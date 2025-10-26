#!/usr/bin/env node

/**
 * Real UI Test - Opens actual browser and tests extension
 */

import CDP from 'chrome-remote-interface';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../extension');

console.log('\n🚀 Starting Real UI Test\n');
console.log('This will:');
console.log('1. Open Chrome with extension');
console.log('2. Check if P2P auto-starts');
console.log('3. Test basic UI functions');
console.log('4. Report results\n');
console.log('⏳ Starting browser...\n');

let chromeProcess = null;
let client = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  const args = [
    `--load-extension=${EXTENSION_PATH}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Temp\\chrome-test-real',
    'about:blank'
  ];

  return new Promise((resolve) => {
    chromeProcess = spawn(CHROME_PATH, args, {
      stdio: 'ignore',
      detached: false
    });

    setTimeout(() => {
      console.log('✅ Browser started\n');
      resolve();
    }, 3000);
  });
}

async function connectToPanel() {
  console.log('🔌 Waiting for extension panel...');
  console.log('👉 Please click the extension icon to open the panel\n');
  
  // Wait for user to open panel
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    
    try {
      const targets = await CDP.List();
      const panel = targets.find(t => 
        t.url.includes('chrome-extension://') && t.url.includes('panel.html')
      );
      
      if (panel) {
        console.log('✅ Panel found! Connecting...\n');
        client = await CDP({ target: panel });
        await client.Runtime.enable();
        await client.Network.enable();
        return true;
      }
    } catch (e) {
      // Keep trying
    }
    
    if (i % 10 === 0 && i > 0) {
      console.log(`⏳ Still waiting... (${i}s)`);
    }
  }
  
  throw new Error('Panel not opened within 60 seconds');
}

async function testP2PAutoStart() {
  console.log('📡 Test 1: P2P Auto-Start');
  
  await sleep(3000); // Wait for auto-start
  
  const result = await client.Runtime.evaluate({
    expression: `({
      p2pManagerExists: typeof window.p2pManager !== 'undefined',
      isStarted: window.p2pManager?.isStarted || false,
      peerId: window.p2pManager?.peerId || null,
      testLibp2pExists: typeof window.testLibp2pStart !== 'undefined'
    })`,
    returnByValue: true
  });
  
  const data = result.result.value;
  
  console.log('   p2pManager exists:', data.p2pManagerExists ? '✅' : '❌');
  console.log('   P2P started:', data.isStarted ? '✅' : '❌');
  console.log('   Peer ID:', data.peerId ? `✅ ${data.peerId.substring(0, 30)}...` : '❌');
  console.log('   testLibp2pStart exists:', data.testLibp2pExists ? '✅' : '❌');
  
  return data.isStarted;
}

async function testUIElements() {
  console.log('\n📋 Test 2: UI Elements');
  
  const result = await client.Runtime.evaluate({
    expression: `({
      authOverlay: document.getElementById('authOverlay')?.classList.contains('hidden'),
      dashboard: !!document.getElementById('view-dashboard'),
      hosting: !!document.getElementById('view-hosting'),
      domains: !!document.getElementById('view-domains'),
      publishBtn: !!document.getElementById('publishNewAppBtn'),
      dashboardApps: document.getElementById('dashboardAppsCount')?.textContent,
      dashboardDomains: document.getElementById('dashboardDomainsCount')?.textContent,
      dashboardPeers: document.getElementById('dashboardPeersCount')?.textContent
    })`,
    returnByValue: true
  });
  
  const data = result.result.value;
  
  console.log('   Auth overlay hidden:', data.authOverlay ? '✅' : '❌');
  console.log('   Dashboard exists:', data.dashboard ? '✅' : '❌');
  console.log('   Hosting tab exists:', data.hosting ? '✅' : '❌');
  console.log('   Domains tab exists:', data.domains ? '✅' : '❌');
  console.log('   Publish button exists:', data.publishBtn ? '✅' : '❌');
  console.log('   Dashboard metrics:');
  console.log('      Apps:', data.dashboardApps);
  console.log('      Domains:', data.dashboardDomains);
  console.log('      Peers:', data.dashboardPeers);
  
  return data.dashboard && data.hosting && data.publishBtn;
}

async function testChunkManager() {
  console.log('\n💾 Test 3: ChunkManager API');
  
  const result = await client.Runtime.evaluate({
    expression: `({
      exists: typeof window.chunkManager !== 'undefined',
      hasPrepareTransfer: typeof window.chunkManager?.prepareTransfer === 'function',
      hasGetTransfer: typeof window.chunkManager?.getTransfer === 'function'
    })`,
    returnByValue: true
  });
  
  const data = result.result.value;
  
  console.log('   chunkManager exists:', data.exists ? '✅' : '❌');
  console.log('   prepareTransfer method:', data.hasPrepareTransfer ? '✅' : '❌');
  console.log('   getTransfer method:', data.hasGetTransfer ? '✅' : '❌');
  
  return data.exists && data.hasPrepareTransfer;
}

async function testBackendConnection() {
  console.log('\n🌐 Test 4: Backend Services');
  
  const result = await client.Runtime.evaluate({
    expression: `(async () => {
      const results = {};
      
      // Test registry
      try {
        const r = await fetch('http://localhost:8788/health');
        results.registry = r.ok;
      } catch (e) {
        results.registry = false;
      }
      
      // Test storage
      try {
        const s = await fetch('http://localhost:8789/health');
        results.storage = s.ok;
      } catch (e) {
        results.storage = false;
      }
      
      return results;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  
  const data = result.result.value;
  
  console.log('   Registry (8788):', data.registry ? '✅' : '❌');
  console.log('   Storage (8789):', data.storage ? '✅' : '❌');
  
  return data.registry && data.storage;
}

async function getConsoleLogs() {
  console.log('\n📜 Console Logs (last 30 seconds):');
  
  const result = await client.Runtime.evaluate({
    expression: `
      (window._consoleLogs || []).slice(-10).map(log => 
        log.substring(0, 100)
      ).join('\\n')
    `,
    returnByValue: true
  });
  
  if (result.result.value) {
    console.log(result.result.value);
  } else {
    console.log('   (No captured logs - check browser console manually)');
  }
}

async function cleanup() {
  if (client) {
    await client.close().catch(() => {});
  }
  if (chromeProcess) {
    chromeProcess.kill();
  }
}

async function main() {
  try {
    await startChrome();
    await connectToPanel();
    
    console.log('═══════════════════════════════════════════════════\n');
    
    const p2pOk = await testP2PAutoStart();
    const uiOk = await testUIElements();
    const apiOk = await testChunkManager();
    const backendOk = await testBackendConnection();
    
    await getConsoleLogs();
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS\n');
    console.log('   P2P Auto-Start:', p2pOk ? '✅ PASS' : '❌ FAIL');
    console.log('   UI Elements:', uiOk ? '✅ PASS' : '❌ FAIL');
    console.log('   ChunkManager API:', apiOk ? '✅ PASS' : '❌ FAIL');
    console.log('   Backend Services:', backendOk ? '✅ PASS' : '❌ FAIL');
    
    const allPass = p2pOk && uiOk && apiOk && backendOk;
    
    console.log('\n═══════════════════════════════════════════════════');
    if (allPass) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ Extension is working correctly');
    } else {
      console.log('⚠️  SOME TESTS FAILED');
      console.log('❌ Extension needs debugging');
    }
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('Press Ctrl+C to close browser and exit\n');
    
    // Keep browser open for manual inspection
    await new Promise(() => {});
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await cleanup();
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n👋 Cleaning up...');
  await cleanup();
  process.exit(0);
});

main();
