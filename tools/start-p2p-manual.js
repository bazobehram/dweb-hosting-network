#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function main() {
  const client = await CDP({ target: '3B765D56A34A888B2AB8D93DE08D8E39' });
  await client.Runtime.enable();
  
  console.log('\n🚀 Manually starting P2P with correct format...\n');
  
  const result = await client.Runtime.evaluate({
    expression: `(async () => {
      try {
        console.log('[Test] Starting P2P...');
        await window.testLibp2pStart('ws://localhost:8787');
        
        await new Promise(r => setTimeout(r, 2000));
        
        return {
          success: true,
          isStarted: window.p2pManager?.isStarted || false,
          peerId: window.p2pManager?.peerId || null,
          peerCount: window.p2pManager?.peers?.size || 0
        };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  
  const data = result.result.value;
  
  if (data.error) {
    console.log('❌ Failed:', data.error);
    if (data.stack) console.log(data.stack);
  } else {
    console.log('✅ Success!');
    console.log('   P2P Started:', data.isStarted ? 'YES' : 'NO');
    console.log('   Peer ID:', data.peerId ? data.peerId.substring(0, 50) + '...' : 'None');
    console.log('   Connected Peers:', data.peerCount);
  }
  
  await client.close();
}

main().catch(console.error);
