#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function testAfterWait() {
  console.log('⏳ Waiting 15 seconds for relay reservations to complete...\n');
  await new Promise(r => setTimeout(r, 15000));
  
  const tabs = await CDP.List({ host: 'localhost', port: 9222 });
  const panelTabs = tabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
  
  if (panelTabs.length < 2) {
    console.log('Need 2 panel tabs');
    process.exit(1);
  }
  
  // Get peer 2's ID
  const client2 = await CDP({ host: 'localhost', port: 9222, target: panelTabs[1] });
  const { Runtime: Runtime2 } = client2;
  await Runtime2.enable();
  
  const peer2Result = await Runtime2.evaluate({
    expression: 'window.p2pManager.getStatus().peerId',
    returnByValue: true
  });
  
  const peer2Id = peer2Result.result?.value;
  await client2.close();
  
  console.log(`Target Peer (Browser 2): ${peer2Id}\n`);
  console.log('🔗 Browser 1 attempting to dial Browser 2...\n');
  
  // Browser 1 dials peer 2
  const client1 = await CDP({ host: 'localhost', port: 9222, target: panelTabs[0] });
  const { Runtime, Console } = client1;
  await Runtime.enable();
  await Console.enable();
  
  Console.messageAdded(({ message }) => {
    const text = message.text || '';
    if (text.includes('[P2P]') || text.includes('dial') || text.includes('Dial')) {
      console.log(`  ${text}`);
    }
  });
  
  const result = await Runtime.evaluate({
    expression: `
      (async () => {
        try {
          const targetId = window.peerIdFromString('${peer2Id}');
          console.log('[P2P] Dialing after relay wait...');
          const conn = await window.p2pManager.node.dial(targetId);
          console.log('[P2P] ✓ Connection successful!', conn.id);
          return { success: true, connectionId: conn.id };
        } catch (err) {
          console.error('[P2P] ✗ Dial failed:', err.message);
          return { error: err.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log(`\n📊 Result:`, result.result?.value);
  
  const status1 = await Runtime.evaluate({
    expression: 'window.p2pManager.getStatus().peerCount',
    returnByValue: true
  });
  
  console.log(`\n   Browser 1 connected peers: ${status1.result?.value}`);
  
  await client1.close();
  
  const client2b = await CDP({ host: 'localhost', port: 9222, target: panelTabs[1] });
  const { Runtime: Runtime2b } = client2b;
  await Runtime2b.enable();
  
  const status2 = await Runtime2b.evaluate({
    expression: 'window.p2pManager.getStatus().peerCount',
    returnByValue: true
  });
  
  console.log(`   Browser 2 connected peers: ${status2.result?.value}\n`);
  
  await client2b.close();
}

testAfterWait().catch(console.error);
