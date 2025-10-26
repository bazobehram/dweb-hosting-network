#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function openPopupAndTest() {
  try {
    console.log('[Test] Finding extension ID...\n');
    
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    // Find extension tab to get extension ID
    const extTab = tabs.find(t => t.url.includes('chrome-extension://'));
    let extensionId = null;
    
    if (extTab) {
      const match = extTab.url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) {
        extensionId = match[1];
        console.log('[Test] Found extension ID:', extensionId);
      }
    }
    
    if (!extensionId) {
      console.error('Could not find extension ID. Please ensure extension is loaded.');
      console.log('\nAvailable tabs:');
      tabs.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
      process.exit(1);
    }
    
    // Find or create a regular tab to execute from
    let regularTab = tabs.find(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
    
    if (!regularTab) {
      console.log('[Test] No regular tab found. Available tabs:');
      tabs.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
      console.error('\nPlease open a regular web page (e.g., google.com) in Chrome first.');
      process.exit(1);
    }
    
    console.log(`[Test] Using tab: ${regularTab.title}\n`);
    
    const client = await CDP({ host: 'localhost', port: 9222, target: regularTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    // Open extension popup
    console.log('[Test] Opening extension popup...');
    const popupUrl = `chrome-extension://${extensionId}/panel.html`;
    
    const openResult = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Try to open in a new tab
            const opened = window.open('${popupUrl}', '_blank');
            if (opened) {
              return { success: true, method: 'window.open' };
            }
            return { success: false, reason: 'popup blocked' };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('Open result:', openResult.result?.value);
    
    await client.close();
    
    // Wait for popup to load
    console.log('[Test] Waiting for popup to load...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Now reconnect to the popup
    console.log('[Test] Connecting to popup...');
    const newTabs = await CDP.List({ host: 'localhost', port: 9222 });
    const popupTab = newTabs.find(t => t.url.includes(popupUrl) || (t.url.includes('chrome-extension://') && t.url.includes('panel')));
    
    if (!popupTab) {
      console.error('Popup tab not found. Please manually open extension popup and run:');
      console.error('node D:\\Projects\\dweb-hosting-network\\tools\\test-bootstrap-connection.js');
      process.exit(1);
    }
    
    console.log(`[Test] Found popup: ${popupTab.title}\n`);
    
    const popupClient = await CDP({ host: 'localhost', port: 9222, target: popupTab });
    const { Runtime: PopupRuntime } = popupClient;
    await PopupRuntime.enable();
    
    // Wait a bit more for initialization
    await new Promise(r => setTimeout(r, 2000));
    
    // Check p2pManager
    console.log('[Test] Checking p2pManager...');
    const statusCheck = await PopupRuntime.evaluate({
      expression: `
        window.p2pManager ? {
          exists: true,
          isStarted: window.p2pManager.isStarted,
          peerId: window.p2pManager.peerId,
          peerCount: window.p2pManager.peers.size,
          bootstrapPeerIds: Array.from(window.p2pManager.bootstrapPeerIds || [])
        } : { exists: false }
      `,
      returnByValue: true
    });
    
    console.log('Status:', JSON.stringify(statusCheck.result?.value, null, 2));
    
    if (statusCheck.result?.value?.exists && statusCheck.result?.value?.isStarted) {
      console.log('\n[Test] Requesting peer exchange...');
      const exchangeResult = await PopupRuntime.evaluate({
        expression: `
          (async () => {
            try {
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'auto-test', 
                force: true 
              });
              
              const status = window.p2pManager.getStatus();
              return {
                success: true,
                peerCount: status.peerCount,
                peers: status.peers
              };
            } catch (error) {
              return { error: error.message };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      console.log('Exchange result:', JSON.stringify(exchangeResult.result?.value, null, 2));
    }
    
    await popupClient.close();
    console.log('\n[Test] ✓ Done\n');
    
  } catch (error) {
    console.error('[Test] Error:', error.message);
    process.exit(1);
  }
}

openPopupAndTest();
