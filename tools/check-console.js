#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function main() {
  const client = await CDP({ target: '3B765D56A34A888B2AB8D93DE08D8E39' });
  await client.Runtime.enable();
  await client.Console.enable();
  
  console.log('\n📜 Checking console logs and P2P status...\n');
  
  // Check if testLibp2pStart exists
  const check = await client.Runtime.evaluate({
    expression: `({
      testLibp2pStartExists: typeof window.testLibp2pStart === 'function',
      p2pManagerExists: typeof window.p2pManager !== 'undefined',
      currentEnv: window.localStorage.getItem('dweb-environment') || 'not set',
      toggleChecked: document.getElementById('toggleBackgroundPeer')?.checked || false
    })`,
    returnByValue: true
  });
  
  console.log('Status Check:');
  console.log('  testLibp2pStart function:', check.result.value.testLibp2pStartExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('  p2pManager:', check.result.value.p2pManagerExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('  Current environment:', check.result.value.currentEnv);
  console.log('  Background peer toggle:', check.result.value.toggleChecked ? '✅ ENABLED' : '❌ DISABLED');
  
  console.log('\nTrying to manually start P2P now...\n');
  
  const manual = await client.Runtime.evaluate({
    expression: `(async () => {
      if (typeof window.testLibp2pStart === 'function') {
        try {
          await window.testLibp2pStart('ws://localhost:8787');
          return { success: true, peerId: window.p2pManager?.peerId };
        } catch (e) {
          return { error: e.message };
        }
      }
      return { error: 'testLibp2pStart not available' };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  
  console.log('Manual Start Result:', manual.result.value);
  
  await client.close();
}

main().catch(console.error);
