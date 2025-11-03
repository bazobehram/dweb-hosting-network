#!/usr/bin/env node

/**
 * Simple Test for Resolver Fix
 * Opens new resolver tab and tests heyheyhey.dweb
 */

import CDP from 'chrome-remote-interface';

async function testFix() {
  console.log('🔧 Testing Resolver Fix');
  console.log('=' .repeat(30));

  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`✅ Chrome connected (${tabs.length} tabs)`);

    // Find extension ID
    const extensionTab = tabs.find(t => t.url.includes('chrome-extension://'));
    if (!extensionTab) {
      console.log('❌ Extension not found');
      return;
    }

    const extensionId = extensionTab.url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`✅ Extension ID: ${extensionId}`);

    // Open fresh resolver in new tab
    const firstTab = tabs[0];
    const client = await CDP({ target: firstTab });
    const { Page, Runtime } = client;
    
    await Page.enable();
    await Runtime.enable();

    const resolverUrl = `chrome-extension://${extensionId}/resolver/index.html`;
    console.log(`🌐 Opening resolver: ${resolverUrl}`);
    
    await Page.navigate({ url: resolverUrl });
    await new Promise(r => setTimeout(r, 4000));

    // Test the fix
    const testScript = `
      (async () => {
        try {
          console.log('Starting resolver test...');
          
          // Clear logs
          const logOutput = document.getElementById('logOutput');
          if (logOutput) logOutput.textContent = '';
          
          // Set domain
          const domainInput = document.getElementById('domainInput');
          if (!domainInput) return { success: false, message: 'Domain input not found' };
          
          domainInput.value = 'heyheyhey.dweb';
          console.log('Domain set to heyheyhey.dweb');
          
          // Click resolve
          const resolveBtn = document.getElementById('resolveBtn');
          if (!resolveBtn) return { success: false, message: 'Resolve button not found' };
          
          resolveBtn.click();
          console.log('Resolve clicked');
          
          // Wait for resolution
          await new Promise(r => setTimeout(r, 6000));
          
          // Get results
          const logs = logOutput.textContent;
          const previewFrame = document.getElementById('previewFrame');
          const previewSrc = previewFrame ? previewFrame.getAttribute('src') : null;
          
          console.log('Resolution complete, analyzing results...');
          
          return {
            success: true,
            logs,
            hasContent: previewSrc && previewSrc.startsWith('blob:'),
            previewSrc
          };
        } catch (error) {
          console.error('Test script error:', error);
          return { success: false, message: error.message };
        }
      })()
    `;

    const result = await Runtime.evaluate({
      expression: testScript,
      returnByValue: true,
      awaitPromise: true
    });

    const data = result.result?.value;
    if (data?.success) {
      console.log('\n📋 Test Results:');
      console.log('\n📝 Logs:');
      console.log(data.logs);
      
      console.log('\n🔍 Analysis:');
      if (data.hasContent) {
        console.log('✅ SUCCESS: Content resolved and rendered!');
        console.log('🎉 The fix is working!');
      } else if (data.logs.includes('from manifest')) {
        console.log('✅ FIX APPLIED: Using manifest replicas');
        if (data.logs.includes('Chunk 0 unavailable')) {
          console.log('❌ BUT: P2P chunk resolution still failing');
          console.log('💡 Need to check P2P network connectivity');
        }
      } else if (data.logs.includes('with 1 replicas (from manifest)')) {
        console.log('✅ FIX WORKING: Found 1 replica from manifest');
      } else if (data.logs.includes('with 0 replicas')) {
        console.log('❌ FIX NOT APPLIED: Still showing 0 replicas');
      } else {
        console.log('⚠️  Unexpected result - check logs above');
      }
    } else {
      console.log('❌ Test failed:', data?.message);
    }

    await client.close();

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testFix().catch(console.error);