#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function runTest() {
  console.log('[Test] Connecting to Chrome...\n');
  
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    // Find extension popup or page
    let targetTab = tabs.find(t => t.url.includes('chrome-extension://') && (t.url.includes('popup') || t.url.includes('panel')));
    if (!targetTab) {
      targetTab = tabs.find(t => t.url.includes('chrome-extension://'));
    }
    
    if (!targetTab) {
      console.error('No extension tab found. Available tabs:');
      tabs.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
      console.error('\nPlease open extension popup first.');
      process.exit(1);
    }
    
    console.log(`[Test] Connected to: ${targetTab.title}\n`);
    
    const client = await CDP({ host: 'localhost', port: 9222, target: targetTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    // Get bootstrap multiaddr from config or use default
    const bootstrapAddr = '/dns4/localhost/tcp/9104/ws/p2p/12D3KooWBxBb3jWHkPnvJjRvSfJZG1aZHVqXJYKe4RmXNAVYvUvG';
    
    console.log('[Test] Checking if libp2p test functions exist...');
    const checkResult = await Runtime.evaluate({
      expression: 'typeof window.testLibp2pStart',
      returnByValue: true
    });
    
    if (checkResult.result?.value !== 'function') {
      console.error('testLibp2pStart not found. Make sure libp2p-test.js is loaded.');
      
      // Try to check p2pManager
      const p2pCheck = await Runtime.evaluate({
        expression: 'typeof window.p2pManager',
        returnByValue: true
      });
      
      console.log('window.p2pManager type:', p2pCheck.result?.value);
      
      if (p2pCheck.result?.value === 'object') {
        console.log('\n[Test] p2pManager exists, checking status...');
        const statusResult = await Runtime.evaluate({
          expression: 'window.p2pManager.getStatus()',
          returnByValue: true,
          awaitPromise: true
        });
        console.log('Status:', statusResult.result?.value);
        
        console.log('\n[Test] Requesting peer exchange...');
        const exchangeResult = await Runtime.evaluate({
          expression: `
            (async () => {
              try {
                await window.p2pManager.requestPeerExchange(undefined, { 
                  reason: 'cdp-test', 
                  force: true 
                });
                return { success: true };
              } catch (error) {
                return { error: error.message };
              }
            })()
          `,
          returnByValue: true,
          awaitPromise: true
        });
        console.log('Exchange result:', exchangeResult.result?.value);
      }
      
      await client.close();
      process.exit(0);
    }
    
    console.log('[Test] Starting libp2p with bootstrap:', bootstrapAddr);
    const startResult = await Runtime.evaluate({
      expression: `testLibp2pStart("${bootstrapAddr}")`,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('Start result:', startResult.result?.value);
    
    // Wait a bit for connection
    console.log('\n[Test] Waiting for bootstrap connection...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Check status
    console.log('\n[Test] Checking status...');
    const statusResult = await Runtime.evaluate({
      expression: 'testLibp2pStatus()',
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('Status:', JSON.stringify(statusResult.result?.value, null, 2));
    
    await client.close();
    console.log('\n[Test] ✓ Completed\n');
    
  } catch (error) {
    console.error('[Test] Error:', error.message);
    process.exit(1);
  }
}

runTest();
