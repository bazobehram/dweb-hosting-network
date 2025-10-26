#!/usr/bin/env node

/**
 * Use AI-Bridge to automatically test peer exchange
 */

import CDP from 'chrome-remote-interface';

async function testViaBridge() {
  console.log('[Bridge Test] Connecting to Chrome...\n');
  
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    console.log('Available tabs:');
    tabs.forEach((t, i) => console.log(`  [${i}] ${t.title} - ${t.url}`));
    console.log();
    
    // Try to find extension popup or any extension page
    let targetTab = tabs.find(t => t.url.includes('chrome-extension://') && t.url.includes('popup'));
    if (!targetTab) {
      targetTab = tabs.find(t => t.url.includes('chrome-extension://') && !t.url.includes('background'));
    }
    if (!targetTab) {
      // Try service worker
      targetTab = tabs.find(t => t.url.includes('chrome-extension://'));
    }
    
    if (!targetTab) {
      console.error('No extension tab found. Please open extension popup first.');
      process.exit(1);
    }
    
    console.log(`[Bridge Test] Using tab: ${targetTab.title}\n`);
    
    const client = await CDP({ host: 'localhost', port: 9222, target: targetTab });
    const { Runtime } = client;
    
    await Runtime.enable();
    
    // Step 1: Reload extension
    console.log('[Step 1] Reloading extension...');
    try {
      await Runtime.evaluate({ expression: 'chrome.runtime.reload()', awaitPromise: false });
    } catch (e) {
      // Connection will close during reload, this is expected
    }
    
    await client.close();
    
    // Wait for reload to complete
    console.log('[Step 1] Waiting for extension to reload...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Reconnect to the reloaded extension
    console.log('[Step 1] Reconnecting...');
    const newTabs = await CDP.List({ host: 'localhost', port: 9222 });
    const newTab = newTabs.find(t => t.url.includes('chrome-extension://')) || newTabs[0];
    const newClient = await CDP({ host: 'localhost', port: 9222, target: newTab });
    const { Runtime: NewRuntime } = newClient;
    await NewRuntime.enable();
    
    // Step 2: Check P2P status
    console.log('\n[Step 2] Checking P2P status...');
    const statusResult = await NewRuntime.evaluate({
      expression: `
        (function() {
          if (!window.p2pManager) return { error: 'P2P Manager not found' };
          const status = window.p2pManager.getStatus();
          return {
            isStarted: status.isStarted,
            peerId: status.peerId,
            peerCount: status.peerCount,
            peers: status.peers.map(p => p.peerId)
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    if (statusResult.result?.value) {
      console.log('P2P Status:', JSON.stringify(statusResult.result.value, null, 2));
    }
    
    // Wait for bootstrap connection
    console.log('\n[Step 3] Waiting for bootstrap connection...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Test peer exchange
    console.log('\n[Step 4] Testing peer exchange...');
    const exchangeResult = await NewRuntime.evaluate({
      expression: `
        (async function() {
          if (!window.p2pManager) return { error: 'P2P Manager not found' };
          
          try {
            await window.p2pManager.requestPeerExchange(undefined, { 
              reason: 'bridge-test', 
              force: true 
            });
            
            const status = window.p2pManager.getStatus();
            return {
              success: true,
              peerCount: status.peerCount,
              peers: status.peers.map(p => ({ peerId: p.peerId, status: p.status }))
            };
          } catch (error) {
            return {
              error: error.message,
              stack: error.stack
            };
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    if (exchangeResult.result?.value) {
      console.log('Peer Exchange Result:', JSON.stringify(exchangeResult.result.value, null, 2));
    }
    
    // Step 5: Get libp2p details
    console.log('\n[Step 5] Getting libp2p connection details...');
    const libp2pResult = await NewRuntime.evaluate({
      expression: `
        (async function() {
          if (!window.p2pManager?.node) return { error: 'Node not available' };
          
          const node = window.p2pManager.node;
          const connections = node.getConnections();
          const peers = node.getPeers();
          
          return {
            peerId: node.peerId.toString(),
            isStarted: node.isStarted(),
            connectionCount: connections.length,
            connections: connections.map(c => ({
              peer: c.remotePeer.toString(),
              status: c.status,
              direction: c.direction,
              multiaddr: c.remoteAddr.toString()
            })),
            peerCount: peers.length,
            peers: peers.map(p => p.toString())
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    if (libp2pResult.result?.value) {
      console.log('Libp2p Details:', JSON.stringify(libp2pResult.result.value, null, 2));
    }
    
    console.log('\n[Bridge Test] ✓ Test completed\n');
    
    await newClient.close();
    process.exit(0);
    
  } catch (error) {
    console.error('[Bridge Test] Error:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Chrome is running with --remote-debugging-port=9222');
    console.error('  2. Extension is loaded');
    process.exit(1);
  }
}

testViaBridge();
