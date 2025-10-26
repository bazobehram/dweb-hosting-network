#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function checkRelayCapability() {
  const tabs = await CDP.List({ host: 'localhost', port: 9222 });
  const panelTabs = tabs.filter(t => t.url.includes('panel/index.html')).slice(0, 1);
  
  if (panelTabs.length === 0) {
    console.log('No panel tabs found');
    process.exit(1);
  }
  
  const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[0] });
  const { Runtime } = client;
  await Runtime.enable();
  
  console.log('📊 Checking relay capability detection...\n');
  
  const result = await Runtime.evaluate({
    expression: `
      (async () => {
        try {
          if (!window.p2pManager || !window.p2pManager.node) {
            return { error: 'p2pManager or node not available' };
          }
          
          const bootstrap = Array.from(window.p2pManager.bootstrapPeerIds)[0];
          console.log('[Check] Bootstrap peer ID:', bootstrap);
          
          // Get peer info from peer store
          const peerIdObj = window.peerIdFromString(bootstrap);
          const peerInfo = await window.p2pManager.node.peerStore.get(peerIdObj);
          
          console.log('[Check] Peer info:', peerInfo);
          console.log('[Check] Protocols:', peerInfo.protocols);
          console.log('[Check] Addresses:', peerInfo.addresses.map(a => a.multiaddr.toString()));
          
          // Check if relay protocol is in peer's protocols
          const hasRelay = peerInfo.protocols.some(p => p.includes('relay'));
          console.log('[Check] Has relay protocol:', hasRelay);
          
          // Get self addresses
          const selfAddrs = window.p2pManager.node.getMultiaddrs();
          console.log('[Check] Self addresses:', selfAddrs.map(a => a.toString()));
          
          const hasCircuit = selfAddrs.some(a => a.toString().includes('p2p-circuit'));
          console.log('[Check] Has circuit addresses:', hasCircuit);
          
          return {
            bootstrap,
            hasRelayProtocol: hasRelay,
            protocols: peerInfo.protocols,
            hasCircuitAddr: hasCircuit,
            selfAddrCount: selfAddrs.length
          };
        } catch (err) {
          console.error('[Check] Error:', err.message);
          return { error: err.message, stack: err.stack };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\n📊 Result:', JSON.stringify(result.result?.value, null, 2));
  
  await client.close();
}

checkRelayCapability().catch(console.error);
