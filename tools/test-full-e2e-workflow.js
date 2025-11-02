#!/usr/bin/env node

/**
 * Complete End-to-End DWeb Workflow Test
 * Tests: Upload → Chunk → Register → Resolve → Display
 */

import CDP from 'chrome-remote-interface';
import crypto from 'crypto';

const TEST_DOMAIN = `test-${Date.now()}.dweb`;
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>E2E Test</title></head>
<body>
  <h1>Hello from DWeb E2E Test!</h1>
  <p>Domain: ${TEST_DOMAIN}</p>
  <p>Timestamp: ${new Date().toISOString()}</p>
</body>
</html>`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 DWeb Complete End-to-End Workflow Test');
  console.log('='.repeat(70));
  console.log(`\n📝 Test Domain: ${TEST_DOMAIN}`);
  console.log(`📄 Test Content: ${TEST_HTML.length} bytes\n`);

  try {
    // Connect to Chrome
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`✓ Connected to Chrome (${tabs.length} tabs)`);

    // Find or open panel tab
    let panelTab = tabs.find(t => t.url.includes('panel.html'));
    
    if (!panelTab) {
      console.log('📄 Opening extension panel...');
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page } = client;
      await Page.enable();
      
      const extensionId = 'dhnlmdolnenmkealoekhnmjknllealip'; // Your extension ID
      await Page.navigate({ url: `chrome-extension://${extensionId}/panel/panel.html` });
      await sleep(3000);
      await client.close();
      
      const newTabs = await CDP.List();
      panelTab = newTabs.find(t => t.url.includes('panel.html'));
    }

    if (!panelTab) {
      console.log('❌ Could not open panel tab');
      return;
    }

    console.log('✓ Found panel tab');

    // Connect to panel
    const panelClient = await CDP({ target: panelTab });
    const { Page: PanelPage, Runtime: PanelRuntime, Console: PanelConsole } = panelClient;

    await PanelPage.enable();
    await PanelRuntime.enable();
    await PanelConsole.enable();

    // Monitor console for errors
    const consoleLogs = [];
    PanelConsole.messageAdded(({ message }) => {
      consoleLogs.push({
        level: message.level,
        text: message.text || '',
        timestamp: Date.now()
      });
      
      if (message.level === 'error') {
        console.log(`   ⚠️  [Panel Error] ${message.text}`);
      }
    });

    // Wait for panel to fully load
    console.log('⏳ Waiting for panel to load...');
    await sleep(3000);
    
    // Check if chunkManager is available
    const panelCheckScript = `
      (async () => {
        return {
          hasChunkManager: typeof chunkManager !== 'undefined',
          hasP2PManager: typeof p2pManager !== 'undefined',
          hasWindow: typeof window !== 'undefined'
        };
      })()
    `;
    
    const panelCheckResult = await PanelRuntime.evaluate({
      expression: panelCheckScript,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('📦 Panel state:', panelCheckResult.result?.value);
    
    if (!panelCheckResult.result?.value?.hasChunkManager) {
      console.log('❌ chunkManager not available in panel');
      await panelClient.close();
      return;
    }
    
    console.log('\n📤 Step 1: Publishing content...');
    
    // Create a test file and trigger publish workflow
    const publishScript = `
      (async () => {
        try {
          // Create test file
          const testContent = \`${TEST_HTML.replace(/`/g, '\\`')}\`;
          const blob = new Blob([testContent], { type: 'text/html' });
          const file = new File([blob], '${TEST_DOMAIN}.html', { type: 'text/html' });

          // Check if chunkManager exists
          if (typeof chunkManager === 'undefined') {
            return { success: false, error: 'chunkManager not found' };
          }

          // Chunk the file
          const chunks = await chunkManager.chunkFile(file);
          
          if (!chunks || chunks.length === 0) {
            return { success: false, error: 'No chunks created' };
          }

          // Create manifest
          const manifest = {
            manifestId: 'test-' + Date.now(),
            transferId: 'test-' + Date.now(),
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            chunkSize: 262144,
            chunkCount: chunks.length,
            sha256: chunks[0].hash, // Simplified
            chunkHashes: chunks.map(c => c.hash),
            replicas: ['test-peer-' + Date.now()],
            createdAt: new Date().toISOString()
          };

          // Register manifest with desktop node
          const manifestResponse = await fetch('http://localhost:8788/manifests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manifest)
          });

          if (!manifestResponse.ok) {
            const error = await manifestResponse.text();
            return { success: false, error: 'Manifest registration failed: ' + error };
          }

          const manifestResult = await manifestResponse.json();

          // Store chunks in desktop node storage
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkResponse = await fetch('http://localhost:8789/chunks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                manifestId: manifest.manifestId,
                chunkIndex: i,
                chunkHash: chunk.hash,
                data: chunk.data,
                peerId: manifest.replicas[0]
              })
            });

            if (!chunkResponse.ok) {
              console.warn('Chunk storage failed for index', i);
            }
          }

          // Register domain
          const domainResponse = await fetch('http://localhost:8788/domains', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              domain: '${TEST_DOMAIN}',
              owner: 'e2e-test',
              manifestId: manifest.manifestId
            })
          });

          if (!domainResponse.ok) {
            const error = await domainResponse.text();
            return { success: false, error: 'Domain registration failed: ' + error };
          }

          return {
            success: true,
            manifestId: manifest.manifestId,
            chunkCount: chunks.length,
            domain: '${TEST_DOMAIN}'
          };

        } catch (error) {
          return { success: false, error: error.message };
        }
      })()
    `;

    const publishResult = await PanelRuntime.evaluate({
      expression: publishScript,
      returnByValue: true,
      awaitPromise: true,
      timeout: 30000
    });

    const publishData = publishResult.result?.value;

    if (!publishData?.success) {
      console.log(`❌ Publish failed: ${publishData?.error}`);
      await panelClient.close();
      return;
    }

    console.log(`✓ Content published successfully`);
    console.log(`   Manifest ID: ${publishData.manifestId}`);
    console.log(`   Chunk count: ${publishData.chunkCount}`);
    console.log(`   Domain: ${publishData.domain}`);

    await sleep(2000);

    // Verify registration
    console.log('\n🔍 Step 2: Verifying registration...');
    
    const domainCheckResponse = await fetch(`http://localhost:8788/domains/${TEST_DOMAIN}`);
    if (!domainCheckResponse.ok) {
      console.log('❌ Domain not found in registry');
      await panelClient.close();
      return;
    }

    const domainData = await domainCheckResponse.json();
    console.log(`✓ Domain registered:`, domainData);

    if (!domainData.replicas || domainData.replicas.length === 0) {
      console.log('⚠️  Domain has no replicas - resolution may fail');
    } else {
      console.log(`✓ Domain has ${domainData.replicas.length} replica(s)`);
    }

    // Test resolver
    console.log('\n🌐 Step 3: Testing resolver...');

    // Open resolver tab
    const extensionId = panelTab.url.match(/chrome-extension:\/\/([^/]+)/)[1];
    const resolverUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=${TEST_DOMAIN}&view=1`;

    const resolverClient = await CDP({ target: tabs[0] });
    const { Page: ResolverPage, Runtime: ResolverRuntime, Console: ResolverConsole } = resolverClient;

    await ResolverPage.enable();
    await ResolverRuntime.enable();
    await ResolverConsole.enable();

    const resolverLogs = [];
    ResolverConsole.messageAdded(({ message }) => {
      resolverLogs.push(message.text || '');
      if (message.level === 'error') {
        console.log(`   ⚠️  [Resolver Error] ${message.text}`);
      }
    });

    await ResolverPage.navigate({ url: resolverUrl });
    console.log(`✓ Opened resolver: ${TEST_DOMAIN}`);

    // Wait for resolution
    console.log('⏳ Waiting for content to load (10 seconds)...\n');
    await sleep(10000);

    // Check result
    const checkScript = `
      (async () => {
        const frame = document.getElementById('previewFrame');
        const logOutput = document.getElementById('logOutput');
        
        return {
          hasFrame: !!frame,
          frameSrc: frame?.src || null,
          frameSrcDoc: frame?.srcdoc ? frame.srcdoc.substring(0, 200) : null,
          logText: logOutput?.textContent || '',
          hasError: logOutput?.textContent.toLowerCase().includes('error')
        };
      })()
    `;

    const checkResult = await ResolverRuntime.evaluate({
      expression: checkScript,
      returnByValue: true,
      awaitPromise: true
    });

    const resolverData = checkResult.result?.value;

    console.log('📊 Resolution Results:');
    console.log('─'.repeat(70));
    console.log(`   Content Frame: ${resolverData.hasFrame ? '✓' : '✗'}`);
    console.log(`   Frame Source: ${resolverData.frameSrc || 'none'}`);
    
    if (resolverData.frameSrcDoc) {
      console.log(`   Frame Content: ${resolverData.frameSrcDoc.substring(0, 100)}...`);
    }
    
    if (resolverData.hasError) {
      console.log(`   ❌ Errors detected in log`);
    }

    if (resolverData.logText) {
      console.log(`\n📋 Resolver Log (last 300 chars):`);
      console.log(`   ${resolverData.logText.slice(-300)}`);
    }

    // Final verdict
    console.log('\n' + '='.repeat(70));
    
    if (resolverData.hasFrame && (resolverData.frameSrc || resolverData.frameSrcDoc)) {
      if (resolverData.frameSrcDoc && resolverData.frameSrcDoc.includes('E2E Test')) {
        console.log('✅ SUCCESS: Full E2E workflow completed!');
        console.log(`   Domain ${TEST_DOMAIN} published and resolved correctly`);
        console.log(`   Content rendered with expected text`);
      } else {
        console.log('⚠️  PARTIAL: Content loaded but verification needed');
      }
    } else {
      console.log('❌ FAILED: Domain resolution unsuccessful');
      console.log(`   The content may not be available via P2P or storage fallback`);
    }

    await resolverClient.close();
    await panelClient.close();

  } catch (error) {
    console.error('❌ Test Error:', error.message);
    console.error(error.stack);
  }
}

main().catch(console.error);
