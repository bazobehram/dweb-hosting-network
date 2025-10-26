#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

console.log('\n🔍 Testing existing extension panel...\n');

async function main() {
  try {
    // Connect to first panel
    const client = await CDP({ target: '3B765D56A34A888B2AB8D93DE08D8E39' });
    await client.Runtime.enable();
    
    console.log('✅ Connected to panel\n');
    console.log('═══════════════════════════════════════\n');
    
    // Test 1: P2P Auto-Start
    console.log('📡 Test 1: P2P Auto-Start Status');
    const p2p = await client.Runtime.evaluate({
      expression: `({
        exists: typeof window.p2pManager !== 'undefined',
        isStarted: window.p2pManager?.isStarted || false,
        peerId: window.p2pManager?.peerId?.substring(0, 40) || null
      })`,
      returnByValue: true
    });
    const p2pData = p2p.result.value;
    console.log('   p2pManager exists:', p2pData.exists ? '✅ YES' : '❌ NO');
    console.log('   P2P started:', p2pData.isStarted ? '✅ YES' : '❌ NO');
    console.log('   Peer ID:', p2pData.peerId || '❌ None');
    
    // Test 2: ChunkManager API
    console.log('\n💾 Test 2: ChunkManager API');
    const chunk = await client.Runtime.evaluate({
      expression: `({
        exists: typeof window.chunkManager !== 'undefined',
        hasPrepareTransfer: typeof window.chunkManager?.prepareTransfer === 'function'
      })`,
      returnByValue: true
    });
    const chunkData = chunk.result.value;
    console.log('   chunkManager exists:', chunkData.exists ? '✅ YES' : '❌ NO');
    console.log('   prepareTransfer method:', chunkData.hasPrepareTransfer ? '✅ YES' : '❌ NO');
    
    // Test 3: Dashboard UI
    console.log('\n📊 Test 3: Dashboard Metrics');
    const dash = await client.Runtime.evaluate({
      expression: `({
        apps: document.getElementById('dashboardAppsCount')?.textContent,
        domains: document.getElementById('dashboardDomainsCount')?.textContent,
        peers: document.getElementById('dashboardPeersCount')?.textContent,
        status: document.getElementById('dashboardNetworkStatus')?.textContent
      })`,
      returnByValue: true
    });
    const dashData = dash.result.value;
    console.log('   Published Apps:', dashData.apps);
    console.log('   Registered Domains:', dashData.domains);
    console.log('   Connected Peers:', dashData.peers);
    console.log('   Network Status:', dashData.status);
    
    // Test 4: Backend Services
    console.log('\n🌐 Test 4: Backend Services');
    const backend = await client.Runtime.evaluate({
      expression: `(async () => {
        try {
          const r = await fetch('http://localhost:8788/health');
          const s = await fetch('http://localhost:8789/health');
          return { registry: r.ok, storage: s.ok };
        } catch (e) {
          return { registry: false, storage: false, error: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const backendData = backend.result.value;
    console.log('   Registry (8788):', backendData.registry ? '✅ Connected' : '❌ Failed');
    console.log('   Storage (8789):', backendData.storage ? '✅ Connected' : '❌ Failed');
    
    // Test 5: Try to create a test file and chunk it
    console.log('\n🧪 Test 5: File Chunking');
    const fileTest = await client.Runtime.evaluate({
      expression: `(async () => {
        try {
          const content = 'Test DWeb App - ${Date.now()}';
          const blob = new Blob([content], { type: 'text/plain' });
          const file = new File([blob], 'test.txt', { type: 'text/plain' });
          
          if (!window.chunkManager) {
            return { error: 'ChunkManager not available' };
          }
          
          const result = await window.chunkManager.prepareTransfer(file);
          return {
            success: true,
            manifestId: result.manifest.transferId,
            chunks: result.transfer.totalChunks,
            size: result.manifest.fileSize
          };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    const fileData = fileTest.result.value;
    if (fileData.success) {
      console.log('   ✅ File chunked successfully');
      console.log('   Manifest ID:', fileData.manifestId);
      console.log('   Chunks:', fileData.chunks);
      console.log('   Size:', fileData.size, 'bytes');
    } else {
      console.log('   ❌ Failed:', fileData.error);
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('📊 FINAL RESULTS\n');
    
    const results = {
      p2p: p2pData.isStarted,
      api: chunkData.hasPrepareTransfer,
      ui: dashData.apps !== null,
      backend: backendData.registry && backendData.storage,
      chunking: fileData.success
    };
    
    console.log('   P2P Auto-Start:', results.p2p ? '✅ PASS' : '❌ FAIL');
    console.log('   ChunkManager API:', results.api ? '✅ PASS' : '❌ FAIL');
    console.log('   Dashboard UI:', results.ui ? '✅ PASS' : '❌ FAIL');
    console.log('   Backend Services:', results.backend ? '✅ PASS' : '❌ FAIL');
    console.log('   File Chunking:', results.chunking ? '✅ PASS' : '❌ FAIL');
    
    const allPass = Object.values(results).every(v => v);
    
    console.log('\n═══════════════════════════════════════');
    if (allPass) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ Extension is fully functional!\n');
      process.exit(0);
    } else {
      console.log('⚠️  SOME TESTS FAILED');
      console.log('❌ Extension needs fixes\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

main();
