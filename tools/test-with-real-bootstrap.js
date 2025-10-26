#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function test() {
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
    
    console.log('[Test] Reloading panel...\n');
    await Runtime.evaluate({ expression: 'location.reload()', awaitPromise: false });
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('[Test] Restarting with correct bootstrap Peer ID...\n');
    
    // Stop existing if any
    await Runtime.evaluate({
      expression: 'window.testLibp2pStop && window.testLibp2pStop()',
      awaitPromise: true
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Start with FIXED peer ID from bootstrap server
    const BOOTSTRAP_PEER_ID = '12D3KooWQYzUbggz4RfYvHmKUdYDzHqG3r7MR4YzL8jPMTzJGQRa';
    const realBootstrapAddr = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP_PEER_ID}`;
    
    const startResult = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            await window.testLibp2pStart('${realBootstrapAddr}');
            return { success: true };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('Start result:', startResult.result?.value);
    
    // Wait for connection
    console.log('\nWaiting for bootstrap connection...');
    await new Promise(r => setTimeout(r, 5000));
    
    // Check status
    const statusResult = await Runtime.evaluate({
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
            peers: status.peers,
            connectionCount: connections.length,
            connections: connections.map(c => ({
              peer: c.remotePeer.toString(),
              status: c.status
            }))
          };
        })()
      `,
      returnByValue: true
    });
    
    console.log('\nStatus:', JSON.stringify(statusResult.result?.value, null, 2));
    
    // If connected, try peer exchange
    if (statusResult.result?.value?.connectionCount > 0) {
      console.log('\n✓ Connected to bootstrap! Testing peer exchange...');
      
      const exchangeResult = await Runtime.evaluate({
        expression: `
          (async () => {
            try {
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'cdp-final-test', 
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
      
      console.log('Peer exchange result:', exchangeResult.result?.value);
      
      console.log('\n✓ Check bootstrap server console for stream type logs!');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

test();
