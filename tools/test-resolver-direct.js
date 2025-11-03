#!/usr/bin/env node

/**
 * Direct CDP Test for Resolver
 * Tests resolver using direct Chrome DevTools Protocol
 */

import CDP from 'chrome-remote-interface';

async function testResolverDirect() {
  console.log('🧪 Direct CDP Resolver Test');
  console.log('=' .repeat(40));

  let client = null;
  
  try {
    // Get Chrome tabs
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`✅ Connected to Chrome (${tabs.length} tabs)`);

    // Find extension
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && 
      t.url.includes('resolver')
    );

    let resolverTab = extensionTabs[0];
    
    if (!resolverTab) {
      // Open resolver in first available tab
      const firstTab = tabs[0];
      client = await CDP({ target: firstTab });
      const { Page } = client;
      await Page.enable();

      // Find extension ID from any extension tab
      const anyExtensionTab = tabs.find(t => t.url.includes('chrome-extension://'));
      if (!anyExtensionTab) {
        console.log('❌ No extension found');
        return;
      }

      const extensionId = anyExtensionTab.url.match(/chrome-extension:\/\/([^/]+)/)[1];
      const resolverUrl = `chrome-extension://${extensionId}/resolver/index.html`;
      
      console.log(`🌐 Opening resolver: ${resolverUrl}`);
      await Page.navigate({ url: resolverUrl });
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log(`✅ Found resolver tab: ${resolverTab.url}`);
      client = await CDP({ target: resolverTab });
    }

    const { Page, Runtime, Console } = client;
    await Page.enable();
    await Runtime.enable();
    await Console.enable();

    // Monitor console messages
    const consoleMessages = [];
    Console.messageAdded((params) => {
      const msg = params.message;
      consoleMessages.push(`${msg.level}: ${msg.text}`);
      console.log(`📝 Console [${msg.level}]: ${msg.text}`);
    });

    // Test domain resolution
    const testDomain = 'heyheyhey.dweb';
    console.log(`\n🎯 Testing domain: ${testDomain}`);

    // Clear logs and set domain
    const setupScript = `
      (async () => {
        try {
          // Clear log output
          const logOutput = document.getElementById('logOutput');
          if (logOutput) logOutput.textContent = '';
          
          // Set domain
          const domainInput = document.getElementById('domainInput');
          if (domainInput) {
            domainInput.value = '${testDomain}';
            return { success: true, message: 'Domain set' };
          } else {
            return { success: false, message: 'Domain input not found' };
          }
        } catch (error) {
          return { success: false, message: error.message };
        }
      })()
    `;

    const setupResult = await Runtime.evaluate({
      expression: setupScript,
      returnByValue: true,
      awaitPromise: true
    });

    if (setupResult.result?.value?.success) {
      console.log('✅ Domain input set');
    } else {
      console.log('❌ Setup failed:', setupResult.result?.value?.message);
      return;
    }

    // Click resolve button
    const resolveScript = `
      (async () => {
        try {
          const resolveBtn = document.getElementById('resolveBtn');
          if (resolveBtn) {
            resolveBtn.click();
            return { success: true, message: 'Resolve clicked' };
          } else {
            return { success: false, message: 'Resolve button not found' };
          }
        } catch (error) {
          return { success: false, message: error.message };
        }
      })()
    `;

    const resolveResult = await Runtime.evaluate({
      expression: resolveScript,
      returnByValue: true,
      awaitPromise: true
    });

    if (resolveResult.result?.value?.success) {
      console.log('🔍 Resolution started');
    } else {
      console.log('❌ Resolve failed:', resolveResult.result?.value?.message);
      return;
    }

    // Wait for resolution
    console.log('⏳ Waiting for resolution...');
    await new Promise(r => setTimeout(r, 8000));

    // Get results
    const resultsScript = `
      (async () => {
        try {
          const logOutput = document.getElementById('logOutput');
          const previewFrame = document.getElementById('previewFrame');
          
          const logs = logOutput ? logOutput.textContent : 'No logs';
          const previewSrc = previewFrame ? previewFrame.getAttribute('src') : null;
          
          // Get status badges
          const badges = Array.from(document.querySelectorAll('[class*="badge"]'))
            .map(badge => badge.textContent)
            .filter(Boolean);
          
          return {
            success: true,
            logs,
            previewSrc,
            badges,
            hasContent: previewSrc && previewSrc.startsWith('blob:')
          };
        } catch (error) {
          return { success: false, message: error.message };
        }
      })()
    `;

    const results = await Runtime.evaluate({
      expression: resultsScript,
      returnByValue: true,
      awaitPromise: true
    });

    const data = results.result?.value;
    if (data?.success) {
      console.log('\n📋 Resolver Results:');
      console.log('Logs:', data.logs);
      console.log('\n📊 Status Badges:', data.badges);
      console.log('🖼️  Preview:', data.previewSrc ? (data.hasContent ? 'Content loaded ✅' : `Src: ${data.previewSrc}`) : 'No content');
      
      // Analyze results
      console.log('\n🔍 Analysis:');
      if (data.hasContent) {
        console.log('✅ SUCCESS: Content resolved and rendered!');
      } else if (data.logs.includes('from manifest')) {
        console.log('✅ FIX WORKING: Using manifest replicas');
        console.log('❌ BUT: Still failing chunk resolution');
      } else if (data.logs.includes('with 0 replicas')) {
        console.log('❌ FIX NOT APPLIED: Still showing 0 replicas');
        console.log('🔄 Extension may need reload');
      } else if (data.logs.includes('Chunk 0 unavailable')) {
        console.log('❌ P2P FAILURE: Chunks unavailable despite replicas');
      } else {
        console.log('⚠️  UNCLEAR: Check logs above');
      }
    } else {
      console.log('❌ Could not get results:', data?.message);
    }

    console.log('\n🚨 Console Messages:', consoleMessages.length);
    consoleMessages.forEach(msg => console.log(`   ${msg}`));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testResolverDirect().catch(console.error);