#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function forceDial() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
    
    if (panelTabs.length < 2) {
      console.log('Need 2 panel tabs');
      process.exit(1);
    }
    
    console.log('🔍 Getting peer IDs...\n');
    
    const peerIds = [];
    for (let i = 0; i < 2; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      const result = await Runtime.evaluate({
        expression: 'window.p2pManager.getStatus().peerId',
        returnByValue: true
      });
      
      peerIds.push(result.result?.value);
      await client.close();
    }
    
    console.log(`Browser 1: ${peerIds[0]}`);
    console.log(`Browser 2: ${peerIds[1]}\n`);
    
    // Browser 1 dials Browser 2 via circuit relay
    const BOOTSTRAP = '12D3KooWDun2SUw2AJE1SrzYdiFMQinCn9AM3Unbs8hpMqPBTwbf';
    const relayAddr = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP}/p2p-circuit/p2p/${peerIds[1]}`;
    
    console.log(`🔗 Browser 1 dialing Browser 2 via relay:`);
    console.log(`   ${relayAddr}\n`);
    
    const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[0] });
    const { Runtime, Console } = client;
    await Runtime.enable();
    await Console.enable();
    
    // Listen for console logs
    Console.messageAdded(({ message }) => {
      const text = message.text || '';
      if (text.includes('[P2P]') || text.includes('dial') || text.includes('Dial')) {
        console.log(`  [Log] ${text}`);
      }
    });
    
    const result = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Use the peerIdFromString to get peer ID, then dial by ID
            const targetPeerId = '${peerIds[1]}';
            console.log('[Test] Dialing peer:', targetPeerId);
            
            // libp2p should use the multiaddrs we added to peer store
            await window.p2pManager.node.dial(window.p2pManager.node.peerStore.get(window.peerIdFromString(targetPeerId)).then(peer => peer.id));
            return { success: true };
          } catch (err) {
            return { error: err.message, code: err.code };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log(`\n📊 Result:`, result.result?.value);
    
    // Check connection status
    const status = await Runtime.evaluate({
      expression: `window.p2pManager.getStatus().peerCount`,
      returnByValue: true
    });
    
    console.log(`   Connected peers: ${status.result?.value}\n`);
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

forceDial();
