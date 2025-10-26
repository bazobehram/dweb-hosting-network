#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function checkPeerExchange() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html'));
    
    if (panelTabs.length === 0) {
      console.error('No panel tabs found');
      process.exit(1);
    }
    
    console.log(`Checking ${panelTabs.length} panel tab(s)...\n`);
    
    for (let i = 0; i < Math.min(2, panelTabs.length); i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      console.log(`\n📱 Browser ${i + 1}:`);
      
      // Check peer exchange method
      const checkResult = await Runtime.evaluate({
        expression: `
          (() => {
            if (!window.p2pManager || !window.p2pManager.node) {
              return { error: 'p2pManager not available' };
            }
            
            const node = window.p2pManager.node;
            const protocols = node.getProtocols ? node.getProtocols() : [];
            
            return {
              peerId: node.peerId.toString(),
              protocols: protocols,
              hasPeerExchangeMethod: typeof window.p2pManager.requestPeerExchange === 'function',
              connections: node.getConnections().map(c => ({
                peer: c.remotePeer.toString(),
                protocols: c.remoteAddr.protoNames ? c.remoteAddr.protoNames() : []
              }))
            };
          })()
        `,
        returnByValue: true
      });
      
      const result = checkResult.result?.value;
      
      if (result?.error) {
        console.log(`  ❌ ${result.error}`);
      } else {
        console.log(`  Peer ID: ${result.peerId}`);
        console.log(`  Protocols: ${result.protocols?.join(', ') || 'none'}`);
        console.log(`  Has requestPeerExchange: ${result.hasPeerExchangeMethod}`);
        console.log(`  Connections: ${result.connections?.length || 0}`);
        
        if (result.connections?.length > 0) {
          result.connections.forEach(conn => {
            console.log(`    → ${conn.peer.slice(0, 20)}...`);
          });
        }
      }
      
      // Try manual peer exchange
      console.log(`\n  Testing peer exchange...`);
      const exchangeResult = await Runtime.evaluate({
        expression: `
          (async () => {
            try {
              console.log('[TEST] Calling requestPeerExchange...');
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'debug-test', 
                force: true 
              });
              console.log('[TEST] requestPeerExchange completed');
              return { success: true };
            } catch (error) {
              console.error('[TEST] requestPeerExchange failed:', error);
              return { error: error.message, stack: error.stack };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      if (exchangeResult.result?.value?.success) {
        console.log(`  ✅ Peer exchange called successfully`);
      } else {
        console.log(`  ❌ Failed: ${exchangeResult.result?.value?.error}`);
      }
      
      await client.close();
    }
    
    console.log('\n📊 Now check bootstrap log watcher for peer exchange activity!');
    console.log('   Should see: 🔄 Peer exchange request from...\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkPeerExchange();
