#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function freshTest() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html'));
    
    console.log('🔄 Closing all panel tabs for fresh start...\n');
    
    // Close all existing panel tabs
    for (const tab of panelTabs) {
      try {
        await CDP.Close({ host: 'localhost', port: 9222, id: tab.id });
      } catch (err) {
        // Ignore errors
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('📂 Open 2 new panel tabs in Chrome manually');
    console.log('   chrome://extensions -> DWeb Extension -> Inspect views: panel/index.html');
    console.log('\n⏳ Waiting 10 seconds for you to open tabs...\n');
    
    await new Promise(r => setTimeout(r, 10000));
    
    const newTabs = await CDP.List({ host: 'localhost', port: 9222 });
    const newPanelTabs = newTabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
    
    if (newPanelTabs.length < 2) {
      console.log('❌ Need 2 panel tabs. Found:', newPanelTabs.length);
      console.log('   Please open panel tabs and run again');
      process.exit(1);
    }
    
    const BOOTSTRAP_PEER_ID = '12D3KooWDun2SUw2AJE1SrzYdiFMQinCn9AM3Unbs8hpMqPBTwbf';
    const bootstrapAddr = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP_PEER_ID}`;
    
    console.log('🚀 Starting libp2p on both browsers...\n');
    
    // Start libp2p on both
    for (let i = 0; i < newPanelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: newPanelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      console.log(`Browser ${i + 1}: Starting libp2p...`);
      
      await Runtime.evaluate({
        expression: `
          (async () => {
            await window.testLibp2pStart('${bootstrapAddr}');
          })()
        `,
        awaitPromise: true
      });
      
      console.log(`Browser ${i + 1}: ✓ Started`);
      
      await client.close();
    }
    
    console.log('\n⏳ Waiting 8 seconds for peer discovery and connections...\n');
    await new Promise(r => setTimeout(r, 8000));
    
    // Check status
    console.log('📊 Checking peer status...\n');
    
    for (let i = 0; i < newPanelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: newPanelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            const status = window.p2pManager.getStatus();
            return {
              peerId: status.peerId,
              peerCount: status.peerCount,
              peers: status.peers.map(p => p.peerId)
            };
          })()
        `,
        returnByValue: true
      });
      
      const status = result.result?.value;
      console.log(`Browser ${i + 1}:`);
      console.log(`  Peer ID: ${status.peerId}`);
      console.log(`  Connected Peers: ${status.peerCount}`);
      if (status.peers && status.peers.length > 0) {
        status.peers.forEach(p => console.log(`    - ${p}`));
      }
      console.log();
      
      await client.close();
    }
    
    console.log('✅ Test complete!');
    console.log('   Check browser console logs for detailed connection info\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

freshTest();
