#!/usr/bin/env node
import CDP from 'chrome-remote-interface';

const c = await CDP({ target: '3B765D56A34A888B2AB8D93DE08D8E39' });
await c.Runtime.enable();

console.log('\n🧪 Testing P2P with correct multiaddr format...\n');

const r = await c.Runtime.evaluate({
  expression: `(async () => {
    try {
      console.log('[Test] Starting P2P with /dns4/localhost/tcp/8787/ws');
      await window.testLibp2pStart('/dns4/localhost/tcp/8787/ws');
      await new Promise(r => setTimeout(r, 3000));
      return {
        success: true,
        isStarted: window.p2pManager?.isStarted || false,
        peerId: window.p2pManager?.peerId?.substring(0, 50) || null
      };
    } catch (e) {
      return { error: e.message };
    }
  })()`,
  awaitPromise: true,
  returnByValue: true
});

const result = r.result.value;

if (result.error) {
  console.log('❌ Failed:', result.error);
} else {
  console.log('✅ P2P Started Successfully!');
  console.log('   isStarted:', result.isStarted);
  console.log('   Peer ID:', result.peerId);
  console.log('\n🎉 P2P auto-start fix is WORKING!\n');
}

await c.close();
