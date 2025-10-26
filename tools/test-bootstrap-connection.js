#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function test() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    // Look for panel/index.html specifically
    let targetTab = tabs.find(t => t.url.includes('chrome-extension://') && t.url.includes('panel/index.html'));
    if (!targetTab) {
      targetTab = tabs.find(t => t.url.includes('chrome-extension://') && (t.url.includes('popup') || t.url.includes('panel')));
    }
    if (!targetTab) {
      targetTab = tabs.find(t => t.url.includes('chrome-extension://'));
    }
    
    if (!targetTab) {
      console.error('No extension tab found. Available tabs:');
      tabs.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
      console.error('\nPlease open extension panel: chrome-extension://<id>/panel/index.html');
      process.exit(1);
    }
    
    console.log(`[Test] Connecting to: ${targetTab.url}`);
    
    const client = await CDP({ host: 'localhost', port: 9222, target: targetTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    console.log('[Test] Checking p2pManager status...\n');
    
    // Wait a bit for page initialization
    await new Promise(r => setTimeout(r, 1000));
    
    // Check if started
    const statusCheck = await Runtime.evaluate({
      expression: `
        window.p2pManager ? {
          exists: true,
          isStarted: window.p2pManager.isStarted,
          peerId: window.p2pManager.peerId,
          peerCount: window.p2pManager.peers.size,
          config: {
            bootstrapMultiaddr: window.p2pManager.config.bootstrapMultiaddr,
            bootstrapPeers: window.p2pManager.config.bootstrapPeers
          },
          bootstrapPeerIds: Array.from(window.p2pManager.bootstrapPeerIds || [])
        } : { exists: false }
      `,
      returnByValue: true
    });
    
    console.log('Status:', JSON.stringify(statusCheck.result?.value, null, 2));
    
    if (statusCheck.result?.value?.isStarted) {
      console.log('\n[Test] Checking libp2p node connections...');
      
      const nodeCheck = await Runtime.evaluate({
        expression: `
          (() => {
            const node = window.p2pManager.node;
            if (!node) return { error: 'Node not found' };
            
            const connections = node.getConnections();
            const peers = Array.from(node.getPeers());
            
            return {
              connectionCount: connections.length,
              connections: connections.map(c => ({
                peer: c.remotePeer.toString(),
                status: c.status,
                direction: c.direction
              })),
              peerCount: peers.length,
              peers: peers.map(p => p.toString())
            };
          })()
        `,
        returnByValue: true
      });
      
      console.log('Node info:', JSON.stringify(nodeCheck.result?.value, null, 2));
      
      console.log('\n[Test] Manually requesting peer exchange...');
      const exchangeResult = await Runtime.evaluate({
        expression: `
          (async () => {
            try {
              console.log('[CDP] Starting peer exchange request...');
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'cdp-manual', 
                force: true 
              });
              console.log('[CDP] Peer exchange completed');
              return { success: true };
            } catch (error) {
              console.error('[CDP] Peer exchange failed:', error);
              return { error: error.message, stack: error.stack };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      console.log('Exchange result:', JSON.stringify(exchangeResult.result?.value, null, 2));
      
      // Check connections again
      console.log('\n[Test] Checking connections after exchange...');
      await new Promise(r => setTimeout(r, 2000));
      
      const nodeCheck2 = await Runtime.evaluate({
        expression: `
          (() => {
            const node = window.p2pManager.node;
            const connections = node.getConnections();
            const peers = Array.from(node.getPeers());
            
            return {
              connectionCount: connections.length,
              connections: connections.map(c => ({
                peer: c.remotePeer.toString(),
                status: c.status
              })),
              peerCount: peers.length,
              peers: peers.map(p => p.toString())
            };
          })()
        `,
        returnByValue: true
      });
      
      console.log('After exchange:', JSON.stringify(nodeCheck2.result?.value, null, 2));
    }
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

test();
