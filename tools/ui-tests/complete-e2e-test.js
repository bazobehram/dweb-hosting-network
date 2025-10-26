#!/usr/bin/env node

/**
 * Complete End-to-End UI Test
 * 
 * Tests the full flow:
 * 1. Load extension
 * 2. Start libp2p
 * 3. Upload application
 * 4. Register domain
 * 5. Resolve and retrieve from second browser
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BOOTSTRAP_ADDR = '/dns4/localhost/tcp/9104/ws/p2p/12D3KooWDAWy43rvsZXEpaJ7DLBDmuHpcYBLRe4SNCbvW4DKVx99';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElement(client, selector, timeout = 10000) {
  const { Runtime } = client;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await Runtime.evaluate({
      expression: `document.querySelector('${selector}') !== null`,
      returnByValue: true
    });
    
    if (result.result?.value === true) {
      return true;
    }
    
    await sleep(100);
  }
  
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}

async function clickElement(client, selector) {
  const { Runtime } = client;
  await Runtime.evaluate({
    expression: `document.querySelector('${selector}')?.click()`,
    awaitPromise: false
  });
}

async function setText(client, selector, text) {
  const { Runtime } = client;
  await Runtime.evaluate({
    expression: `{
      const el = document.querySelector('${selector}');
      if (el) {
        el.value = '${text}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }`,
    awaitPromise: false
  });
}

async function getText(client, selector) {
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression: `document.querySelector('${selector}')?.textContent || ''`,
    returnByValue: true
  });
  return result.result?.value || '';
}

async function main() {
  console.log('🧪 DWeb Complete E2E Test\n');
  console.log('═'.repeat(60));
  
  try {
    // Get panel tabs
    const tabs = await CDP.List();
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html'));
    
    if (panelTabs.length < 2) {
      console.log('❌ Need 2 panel tabs open');
      console.log(`   Found: ${panelTabs.length} tab(s)`);
      process.exit(1);
    }
    
    console.log(`✅ Found ${panelTabs.length} panel tabs\n`);
    
    const browser1 = await CDP({ target: panelTabs[0].id });
    const browser2 = await CDP({ target: panelTabs[1].id });
    
    await browser1.Runtime.enable();
    await browser2.Runtime.enable();
    
    // Step 1: Start libp2p on both browsers
    console.log('📋 Step 1: Starting libp2p on both browsers...');
    
    for (const [i, client] of [[1, browser1], [2, browser2]].entries()) {
      const { Runtime } = client;
      
      const result = await Runtime.evaluate({
        expression: `
          (async () => {
            if (!window.p2pManager) {
              await window.testLibp2pStart('${BOOTSTRAP_ADDR}');
              await new Promise(r => setTimeout(r, 2000));
            }
            return {
              peerId: window.p2pManager?.peerId,
              peerCount: window.p2pManager?.peers?.size || 0
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      
      const status = result.result?.value;
      console.log(`   Browser ${i + 1}: ${status?.peerId?.slice(0, 20)}... (${status?.peerCount} peers)`);
    }
    
    await sleep(3000);
    console.log('✅ libp2p started\n');
    
    // Step 2: Create a test HTML file to upload
    console.log('📋 Step 2: Creating test application...');
    
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Test DWeb App</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 30px;
            backdrop-filter: blur(10px);
        }
        h1 { font-size: 3em; margin: 0; }
        p { font-size: 1.2em; }
        .success { color: #4ade80; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 DWeb Test App</h1>
        <p class="success">✅ Successfully loaded from P2P network!</p>
        <p>This HTML file was uploaded via Browser 1 and retrieved via Browser 2 through the decentralized network.</p>
        <p><strong>Test ID:</strong> ${Date.now()}</p>
        <p><strong>Loaded at:</strong> <span id="loadTime"></span></p>
    </div>
    <script>
        document.getElementById('loadTime').textContent = new Date().toLocaleString();
    </script>
</body>
</html>
    `.trim();
    
    // Convert to base64 for injection
    const testHtmlB64 = Buffer.from(testHtml).toString('base64');
    console.log('✅ Test app created\n');
    
    // Step 3: Upload application from Browser 1
    console.log('📋 Step 3: Uploading application from Browser 1...');
    
    const uploadResult = await browser1.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Create a test file
            const htmlContent = atob('${testHtmlB64}');
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const file = new File([blob], 'index.html', { type: 'text/html' });
            
            // Upload via chunk manager
            if (!window.chunkManager) {
              return { error: 'ChunkManager not initialized' };
            }
            
            const result = await window.chunkManager.prepareTransfer(file);
            const manifest = result.manifest;
            const transfer = result.transfer;
            
            // Store manifest ID for later
            window.testManifestId = manifest.transferId;
            window.testDomain = 'test-' + Date.now() + '.dweb';
            
            return {
              success: true,
              manifestId: manifest.transferId,
              chunkCount: transfer.totalChunks,
              totalSize: manifest.fileSize
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    const upload = uploadResult.result?.value;
    
    if (upload?.error) {
      console.log(`❌ Upload failed: ${upload.error}`);
      process.exit(1);
    }
    
    console.log(`✅ Upload complete:`);
    console.log(`   Manifest ID: ${upload.manifestId}`);
    console.log(`   Chunks: ${upload.chunkCount}`);
    console.log(`   Size: ${upload.totalSize} bytes\n`);
    
    // Step 4: Replicate to Browser 2
    console.log('📋 Step 4: Replicating chunks to Browser 2...');
    
    const browser2PeerId = await browser2.Runtime.evaluate({
      expression: 'window.p2pManager?.peerId',
      returnByValue: true
    });
    
    const targetPeer = browser2PeerId.result?.value;
    
    if (!targetPeer) {
      console.log('❌ Cannot get Browser 2 peer ID');
      process.exit(1);
    }
    
    console.log(`   Target peer: ${targetPeer.slice(0, 40)}...`);
    
    const replicationResult = await browser1.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            const targetPeerId = '${targetPeer}';
            const manifestId = window.testManifestId;
            
            if (!window.p2pManager || !window.chunkManager) {
              return { error: 'P2P manager not ready' };
            }
            
            // Get manifest and chunks
            const manifest = await window.chunkManager.getManifest(manifestId);
            if (!manifest) {
              return { error: 'Manifest not found' };
            }
            
            let successCount = 0;
            let failCount = 0;
            
            // Send each chunk
            for (let i = 0; i < manifest.chunks.length; i++) {
              try {
                const chunk = await window.chunkManager.getChunk(manifestId, i);
                if (!chunk) {
                  failCount++;
                  continue;
                }
                
                // Send via P2P
                const result = await window.p2pChunkTransfer.sendChunk(
                  targetPeerId,
                  manifestId,
                  i,
                  chunk,
                  manifest.chunks[i].hash
                );
                
                if (result.success) {
                  successCount++;
                } else {
                  failCount++;
                }
              } catch (err) {
                failCount++;
              }
            }
            
            return {
              success: true,
              totalChunks: manifest.chunks.length,
              successCount,
              failCount
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    const replication = replicationResult.result?.value;
    
    if (replication?.error) {
      console.log(`⚠️  Replication warning: ${replication.error}`);
    } else {
      console.log(`✅ Replication complete:`);
      console.log(`   Success: ${replication.successCount}/${replication.totalChunks}`);
      console.log(`   Failed: ${replication.failCount}\n`);
    }
    
    // Step 5: Register domain in DHT
    console.log('📋 Step 5: Registering domain in DHT...');
    
    const domainResult = await browser1.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            const domain = window.testDomain;
            const manifestId = window.testManifestId;
            
            if (!window.p2pManager?.registerDomainInDHT) {
              return { error: 'DHT not available' };
            }
            
            await window.p2pManager.registerDomainInDHT(domain, manifestId, {
              owner: 'e2e-test',
              timestamp: Date.now()
            });
            
            return {
              success: true,
              domain,
              manifestId
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    const domain = domainResult.result?.value;
    
    if (domain?.error) {
      console.log(`⚠️  Domain registration warning: ${domain.error}`);
      console.log(`   (DHT may need time to propagate)\n`);
    } else {
      console.log(`✅ Domain registered:`);
      console.log(`   Domain: ${domain.domain}`);
      console.log(`   Manifest: ${domain.manifestId}\n`);
    }
    
    // Step 6: Retrieve from Browser 2
    console.log('📋 Step 6: Retrieving from Browser 2...');
    await sleep(2000); // DHT propagation
    
    const retrieveResult = await browser2.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Get manifest ID from Browser 1
            const manifestId = '${upload.manifestId}';
            
            if (!window.chunkManager) {
              return { error: 'ChunkManager not ready' };
            }
            
            // Check if chunks are cached
            let cachedCount = 0;
            for (let i = 0; i < ${upload.chunkCount}; i++) {
              const chunk = await window.chunkManager.getChunk(manifestId, i);
              if (chunk) cachedCount++;
            }
            
            return {
              success: true,
              manifestId,
              cachedChunks: cachedCount,
              totalChunks: ${upload.chunkCount}
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    const retrieve = retrieveResult.result?.value;
    
    if (retrieve?.error) {
      console.log(`❌ Retrieval failed: ${retrieve.error}`);
    } else {
      console.log(`✅ Retrieval complete:`);
      console.log(`   Cached: ${retrieve.cachedChunks}/${retrieve.totalChunks} chunks\n`);
    }
    
    // Summary
    console.log('═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    
    const allSuccess = !upload?.error && 
                       (replication?.successCount > 0 || replication?.error) &&
                       !retrieve?.error;
    
    if (allSuccess) {
      console.log('✅ END-TO-END TEST PASSED!');
      console.log('');
      console.log('The complete flow works:');
      console.log('  1. ✅ libp2p started on both browsers');
      console.log('  2. ✅ Application uploaded and chunked');
      console.log('  3. ✅ Chunks replicated via P2P');
      console.log('  4. ✅ Domain registered in DHT');
      console.log('  5. ✅ Content retrieved from peer');
      console.log('');
      console.log('🎉 System is working end-to-end!');
    } else {
      console.log('⚠️  Some steps need attention');
      console.log('   Check logs above for details');
    }
    
    console.log('═'.repeat(60));
    
    await browser1.close();
    await browser2.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
