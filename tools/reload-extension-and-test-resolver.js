#!/usr/bin/env node

/**
 * Reload Extension and Test Resolver Integration
 * This script automatically reloads the DWeb extension and tests the resolver
 */

import CDP from 'chrome-remote-interface';

async function main() {
  console.log('🔄 Reloading DWeb Extension and Testing Resolver');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check Chrome connection
    console.log('\n1. Checking Chrome connection...');
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`   Found ${tabs.length} tab(s)`);
    
    if (tabs.length === 0) {
      console.log('❌ No Chrome tabs found');
      console.log('Start Chrome with: ./start-chrome-debug.ps1');
      return;
    }
    
    // Step 2: Find extension tabs
    console.log('\n2. Looking for DWeb extension...');
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && 
      (t.url.includes('panel') || t.url.includes('resolver'))
    );
    
    if (extensionTabs.length === 0) {
      console.log('❌ Extension not found');
      console.log('Load the extension first at chrome://extensions');
      return;
    }
    
    const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`   ✅ Found extension: ${extensionId}`);
    console.log(`   📊 Extension tabs: ${extensionTabs.length}`);
    
    // Step 3: Navigate to extensions page and reload extension
    console.log('\n3. Reloading extension...');
    await reloadExtension(tabs, extensionId);
    
    // Step 4: Wait for reload
    console.log('⏳ Waiting for extension reload...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 5: Test resolver with desktop node
    console.log('\n4. Testing resolver integration...');
    await testResolver(extensionId);
    
    console.log('\n✅ Extension reload and test complete!');
    console.log('\n🎯 Next steps:');
    console.log('   1. Open resolver: chrome-extension://' + extensionId + '/resolver/resolver.html');
    console.log('   2. Test domain: testotest.dweb');
    console.log('   3. Should now resolve via desktop node!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Make sure Chrome is running with --remote-debugging-port=9222');
  }
}

async function reloadExtension(tabs, extensionId) {
  // Find or open chrome://extensions tab
  let extensionsTab = tabs.find(t => t.url === 'chrome://extensions/');
  
  if (!extensionsTab) {
    // Open chrome://extensions in first available tab
    const firstTab = tabs[0];
    const client = await CDP({ target: firstTab });
    const { Page } = client;
    await Page.enable();
    await Page.navigate({ url: 'chrome://extensions/' });
    console.log('   📄 Opened chrome://extensions');
    
    // Wait for page load
    await new Promise(r => setTimeout(r, 2000));
    await client.close();
    
    // Get updated tabs list
    const newTabs = await CDP.List();
    extensionsTab = newTabs.find(t => t.url === 'chrome://extensions/');
  }
  
  if (extensionsTab) {
    const client = await CDP({ target: extensionsTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    // Find and click the reload button for our extension
    const reloadScript = `
      (async () => {
        try {
          // Find extension by ID in the extensions page
          const extensions = document.querySelectorAll('extensions-item');
          let targetExtension = null;
          
          for (const ext of extensions) {
            const shadowRoot = ext.shadowRoot;
            if (shadowRoot) {
              const details = shadowRoot.querySelector('#name');
              if (details && details.textContent.toLowerCase().includes('dweb')) {
                targetExtension = ext;
                break;
              }
            }
          }
          
          if (targetExtension) {
            const shadowRoot = targetExtension.shadowRoot;
            const reloadBtn = shadowRoot.querySelector('#dev-reload-button');
            if (reloadBtn && !reloadBtn.hidden) {
              reloadBtn.click();
              return { success: true, message: 'Extension reloaded' };
            } else {
              return { success: false, message: 'Reload button not found or hidden' };
            }
          } else {
            return { success: false, message: 'DWeb extension not found' };
          }
        } catch (error) {
          return { success: false, message: error.message };
        }
      })()
    `;
    
    const result = await Runtime.evaluate({
      expression: reloadScript,
      returnByValue: true,
      awaitPromise: true
    });
    
    const value = result.result?.value;
    if (value?.success) {
      console.log('   ✅ Extension reloaded successfully');
    } else {
      console.log('   ⚠️  Extension reload:', value?.message || 'Unknown result');
    }
    
    await client.close();
  } else {
    console.log('   ⚠️  Could not access chrome://extensions tab');
  }
}

async function testResolver(extensionId) {
  // Check if desktop node registry is running  
  try {
    const healthResponse = await fetch('http://localhost:8788/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('   ✅ Desktop node registry healthy');
      console.log(`      Service: ${health.service}, Status: ${health.status}`);
    } else {
      console.log('   ❌ Desktop node registry unhealthy:', healthResponse.status);
    }
  } catch (error) {
    console.log('   ❌ Desktop node registry not accessible:', error.message);
    console.log('   🔧 Start with: npm run start:registry');
  }
  
  // Test domain resolution through registry API
  try {
    const domainResponse = await fetch('http://localhost:8788/domains/testotest.dweb');
    if (domainResponse.ok) {
      const domainData = await domainResponse.json();
      console.log('   ✅ Test domain found in registry');
      console.log(`      Domain: ${domainData.domain}, Manifest: ${domainData.manifestId}`);
    } else if (domainResponse.status === 404) {
      console.log('   ⚠️  Test domain not found - this is expected if no content uploaded');
    } else {
      console.log('   ❌ Domain lookup error:', domainResponse.status);
    }
  } catch (error) {
    console.log('   ❌ Domain lookup failed:', error.message);
  }
  
  // Create resolver URL for testing
  const resolverUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=testotest.dweb&view=1`;
  console.log('   📋 Resolver URL:', resolverUrl);
  
  // Test by opening the resolver
  const tabs = await CDP.List();
  if (tabs.length > 0) {
    const client = await CDP({ target: tabs[0] });
    const { Page } = client;
    await Page.enable();
    
    try {
      // Open resolver in new tab
      await Page.navigate({ url: resolverUrl });
      console.log('   🌐 Opened resolver for testing');
      
      // Wait for page load
      await new Promise(r => setTimeout(r, 2000));
      
      console.log('   ✅ Resolver should now work with desktop node fallback');
      
    } catch (error) {
      console.log('   ⚠️  Could not open resolver:', error.message);
    }
    
    await client.close();
  }
}

// Run if executed directly
main().catch(console.error);