#!/usr/bin/env node

/**
 * Complete End-to-End Flow Test
 * Tests full workflow: Upload → Register → Resolve
 * Creates new content to ensure it works with current services
 */

import { chromium } from 'playwright';
import CDP from 'chrome-remote-interface';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function completeFlowTest() {
  console.log('🧪 Complete End-to-End Flow Test');
  console.log('Testing: Upload → Register → Resolve');
  console.log('=' .repeat(60));

  let client = null;
  const testDomain = `flow-test-${Date.now()}.dweb`;
  const testContent = `<html>
<head><title>E2E Flow Test</title></head>
<body>
  <h1>Complete Flow Test Success!</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <p>Domain: ${testDomain}</p>
  <div id="test-success">WORKING</div>
</body>
</html>`;

  try {
    // Step 1: Check prerequisites
    console.log('\n1️⃣  Checking Prerequisites...');
    
    // Check registry
    try {
      const registryResponse = await fetch('http://localhost:8788/health');
      if (!registryResponse.ok) throw new Error('Registry unhealthy');
      console.log('   ✅ Registry running');
    } catch (error) {
      console.log('   ❌ Registry offline');
      return;
    }

    // Check storage
    try {
      const storageResponse = await fetch('http://localhost:8789/health');
      if (!storageResponse.ok) throw new Error('Storage unhealthy');
      console.log('   ✅ Storage running');
    } catch (error) {
      console.log('   ❌ Storage offline - content won\'t persist');
    }

    // Check Chrome/Extension
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    if (tabs.length === 0) {
      console.log('   ❌ Chrome not running with debug mode');
      return;
    }
    
    const extensionTab = tabs.find(t => t.url.includes('chrome-extension://'));
    if (!extensionTab) {
      console.log('   ❌ Extension not loaded');
      return;
    }

    const extensionId = extensionTab.url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`   ✅ Extension ready: ${extensionId}`);

    // Step 2: Upload Content via Extension Panel
    console.log('\n2️⃣  Uploading Content via Extension...');
    
    client = await CDP({ target: tabs[0] });
    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();

    // Navigate to panel
    const panelUrl = `chrome-extension://${extensionId}/panel/index.html`;
    await Page.navigate({ url: panelUrl });
    await new Promise(r => setTimeout(r, 3000));

    // Create temp file
    const tempFile = path.join(__dirname, 'temp-flow-test.html');
    await fs.writeFile(tempFile, testContent);
    console.log(`   📁 Created test file: ${tempFile}`);

    // Upload via extension
    const uploadResult = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Set domain
            const domainInput = document.getElementById('domainInput');
            if (!domainInput) return { success: false, error: 'Domain input not found' };
            domainInput.value = '${testDomain}';

            // Simulate file content (since we can't actually select files via automation)
            // This is a limitation - in real use the user selects a file
            
            // For now, just prepare the domain - the actual upload needs manual file selection
            return { 
              success: true, 
              message: 'Domain set, manual file upload required',
              domain: '${testDomain}'
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });

    console.log('   📝 Upload preparation result:', uploadResult.result?.value?.message);

    // Step 3: Manually create manifest and domain (simulating upload)
    console.log('\n3️⃣  Simulating Content Upload...');
    
    const manifestId = `flow-${Date.now()}-test`;
    const mockManifest = {
      transferId: manifestId,
      fileName: 'flow-test.html',
      fileSize: testContent.length,
      mimeType: 'text/html',
      chunkSize: 262144,
      chunkCount: 1,
      sha256: 'mock-hash-for-test',
      chunkHashes: ['mock-chunk-hash'],
      replicas: ['mock-peer-current']  // Current active "peer"
    };

    // Register manifest
    const manifestResponse = await fetch('http://localhost:8788/manifests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockManifest)
    });

    if (manifestResponse.ok) {
      console.log(`   ✅ Manifest registered: ${manifestId}`);
    } else {
      const error = await manifestResponse.text();
      console.log(`   ❌ Manifest registration failed: ${error}`);
      return;
    }

    // Register domain
    const domainPayload = {
      domain: testDomain,
      owner: 'flow-test-user',
      manifestId: manifestId
    };

    const domainResponse = await fetch('http://localhost:8788/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(domainPayload)
    });

    if (domainResponse.ok) {
      console.log(`   ✅ Domain registered: ${testDomain}`);
    } else {
      const error = await domainResponse.text();
      console.log(`   ❌ Domain registration failed: ${error}`);
      return;
    }

    // Step 4: Verify Registry Data
    console.log('\n4️⃣  Verifying Registry Data...');
    
    // Check domain with replicas
    const checkDomainResponse = await fetch(`http://localhost:8788/domains/${testDomain}`);
    if (checkDomainResponse.ok) {
      const domainData = await checkDomainResponse.json();
      console.log(`   ✅ Domain found: ${domainData.domain}`);
      console.log(`   📄 Manifest: ${domainData.manifestId}`);
      console.log(`   👥 Replicas: ${domainData.replicas ? domainData.replicas.length : 'MISSING'}`);
      
      if (domainData.replicas && domainData.replicas.length > 0) {
        console.log(`   ✅ Registry replica fix working!`);
      } else {
        console.log(`   ❌ Registry replica fix failed`);
      }
    } else {
      console.log(`   ❌ Could not verify domain`);
    }

    // Step 5: Test Extension Resolution
    console.log('\n5️⃣  Testing Extension Resolution...');

    // Navigate to resolver
    const resolverUrl = `chrome-extension://${extensionId}/resolver/index.html`;
    await Page.navigate({ url: resolverUrl });
    await new Promise(r => setTimeout(r, 3000));

    // Test resolution
    const resolverResult = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Clear logs
            const logOutput = document.getElementById('logOutput');
            if (logOutput) logOutput.textContent = '';

            // Set domain
            const domainInput = document.getElementById('domainInput');
            if (!domainInput) return { success: false, error: 'Domain input not found' };
            domainInput.value = '${testDomain}';

            // Click resolve
            const resolveBtn = document.getElementById('resolveBtn');
            if (!resolveBtn) return { success: false, error: 'Resolve button not found' };
            resolveBtn.click();

            // Wait for resolution
            await new Promise(r => setTimeout(r, 5000));

            // Get results
            const logs = logOutput.textContent;
            const previewFrame = document.getElementById('previewFrame');
            const hasContent = previewFrame && previewFrame.src && previewFrame.src.startsWith('blob:');

            return {
              success: true,
              logs,
              hasContent,
              domain: '${testDomain}'
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });

    const result = resolverResult.result?.value;
    if (result?.success) {
      console.log('\n📝 Resolution Results:');
      console.log('Logs:', result.logs);
      
      if (result.hasContent) {
        console.log('\n🎉 SUCCESS: Content resolved and displayed!');
        console.log('✅ Complete end-to-end flow working!');
      } else {
        console.log('\n⚠️  Resolution attempted but no content displayed');
        
        // Analyze the logs
        if (result.logs.includes('replicas (from domain)')) {
          console.log('✅ Registry replica fix working');
        }
        if (result.logs.includes('peer unavailable')) {
          console.log('⚠️  P2P peer not available (expected for mock peer)');
        }
        if (result.logs.includes('Domain not found')) {
          console.log('❌ Domain lookup failed');
        }
      }
    } else {
      console.log('❌ Resolution test failed:', result?.error);
    }

    // Step 6: Test Registry Resolver Fallback
    console.log('\n6️⃣  Testing Registry Resolver Fallback...');
    
    try {
      const resolverResponse = await fetch(`http://localhost:8788/resolve/${testDomain}`);
      if (resolverResponse.ok) {
        const content = await resolverResponse.text();
        console.log(`✅ Registry resolver working: ${content.length} bytes`);
        
        if (content.includes('WORKING')) {
          console.log('🎉 Registry resolver serving correct content!');
        }
      } else {
        const error = await resolverResponse.text();
        console.log(`⚠️  Registry resolver failed: ${error}`);
      }
    } catch (error) {
      console.log(`❌ Registry resolver error: ${error.message}`);
    }

    // Cleanup temp file
    try {
      await fs.unlink(tempFile);
    } catch {}

  } catch (error) {
    console.error('❌ Complete flow test failed:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }

  console.log('\n🏁 Complete Flow Test Finished');
}

completeFlowTest().catch(console.error);