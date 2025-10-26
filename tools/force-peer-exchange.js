#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function forcePeerExchange() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const targetTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!targetTab) {
      console.error('Panel not found');
      process.exit(1);
    }
    
    const client = await CDP({ host: 'localhost', port: 9222, target: targetTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    console.log('[Test] Checking connection status...\n');
    
    const statusCheck = await Runtime.evaluate({
      expression: `
        (() => {
          if (!window.p2pManager) return { error: 'p2pManager not found' };
          
          const status = window.p2pManager.getStatus();
          const node = window.p2pManager.node;
          const connections = node ? node.getConnections() : [];
          
          return {
            isStarted: status.isStarted,
            peerId: status.peerId,
            peerCount: status.peerCount,
            connectionCount: connections.length,
            connectedPeers: connections.map(c => c.remotePeer.toString())
          };
        })()
      `,
      returnByValue: true
    });
    
    console.log('Current status:', JSON.stringify(statusCheck.result?.value, null, 2));
    
    if (statusCheck.result?.value?.connectionCount > 0) {
      console.log('\n✓ Connected to bootstrap. Forcing peer exchange...\n');
      
      // Force multiple peer exchanges to ensure we see the logs
      for (let i = 0; i < 3; i++) {
        console.log(`[Test] Peer exchange attempt ${i + 1}/3...`);
        
        const result = await Runtime.evaluate({
          expression: `
            (async () => {
              try {
                console.log('[CDP-Test] Sending peer exchange request...');
                await window.p2pManager.requestPeerExchange(undefined, { 
                  reason: 'force-test-${i}', 
                  force: true 
                });
                console.log('[CDP-Test] Peer exchange completed');
                return { success: true };
              } catch (error) {
                console.error('[CDP-Test] Error:', error);
                return { error: error.message };
              }
            })()
          `,
          returnByValue: true,
          awaitPromise: true
        });
        
        console.log(`  Result:`, result.result?.value);
        
        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.log('\n✓ Done! Check bootstrap server console for:');
      console.log('  - [Bootstrap] Peer exchange request from ...');
      console.log('  - [Bootstrap] Stream type: ...');
      console.log('  - [Bootstrap] Stream properties: ...');
    } else {
      console.log('\n✗ Not connected to bootstrap. Start libp2p first.');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

forcePeerExchange();
