#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function checkStatus() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
    
    if (panelTabs.length === 0) {
      console.log('No panel tabs found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${panelTabs.length} panel tab(s)\n`);
    
    for (let i = 0; i < panelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            if (!window.p2pManager) return { error: 'p2pManager not found' };
            const status = window.p2pManager.getStatus();
            return {
              isStarted: status.isStarted,
              peerId: status.peerId,
              peerCount: status.peerCount,
              peers: status.peers.map(p => ({ peerId: p.peerId, status: p.status }))
            };
          })()
        `,
        returnByValue: true
      });
      
      const status = result.result?.value;
      
      console.log(`\n=== Browser ${i + 1} ===`);
      
      if (status?.error) {
        console.log(`  ${status.error}`);
      } else if (!status?.isStarted) {
        console.log(`  ❌ libp2p not started`);
      } else {
        console.log(`  ✅ libp2p started`);
        console.log(`  Peer ID: ${status.peerId}`);
        console.log(`  Connected Peers: ${status.peerCount}`);
        if (status.peers && status.peers.length > 0) {
          status.peers.forEach(p => {
            console.log(`    - ${p.peerId.substring(0, 20)}... (${p.status})`);
          });
        } else {
          console.log(`    (no peers connected)`);
        }
      }
      
      await client.close();
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStatus();
