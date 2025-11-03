#!/usr/bin/env node

/**
 * Complete DWeb Extension Automation
 * Handles loading, reloading, and testing the extension
 */

import CDP from 'chrome-remote-interface';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

async function main() {
  console.log('🚀 DWeb Extension Complete Automation');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check Chrome connection
    console.log('\n1. Checking Chrome connection...');
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`   Found ${tabs.length} tab(s)`);
    
    if (tabs.length === 0) {
      console.log('❌ No Chrome tabs found');
      console.log('Run: ./start-chrome-debug.ps1');
      return;
    }
    
    // Step 2: Find existing extension or load it
    console.log('\n2. Setting up DWeb extension...');
    const extensionId = await setupExtension(tabs);
    
    if (!extensionId) {
      console.log('❌ Could not load extension');
      return;
    }
    
    console.log(`   ✅ Extension ready: ${extensionId}`);
    
    // Step 3: Test resolver with desktop node
    console.log('\n3. Testing resolver integration...');
    await testResolver(extensionId);
    
    console.log('\n✅ Extension automation complete!');
    console.log('\n🎯 Extension URLs:');
    console.log(`   Panel: chrome-extension://${extensionId}/panel/panel.html`);
    console.log(`   Resolver: chrome-extension://${extensionId}/resolver/resolver.html`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Make sure Chrome is running with --remote-debugging-port=9222');
  }
}

async function setupExtension(tabs) {
  // Check if extension already exists
  const extensionTabs = tabs.filter(t => 
    t.url.includes('chrome-extension://') && 
    (t.url.includes('panel') || t.url.includes('resolver'))
  );
  
  if (extensionTabs.length > 0) {
    const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`   📦 Found existing extension: ${extensionId}`);
    
    // Reload existing extension
    await reloadExtension(tabs, extensionId);
    return extensionId;
  }
  
  // Extension not found, load it
  console.log('   📥 Loading extension...');
  const extensionId = await loadExtension(tabs);
  return extensionId;
}

async function loadExtension(tabs) {
  // Navigate to chrome://extensions and load the extension
  const firstTab = tabs[0];
  const client = await CDP({ target: firstTab });
  const { Page, Runtime } = client;
  
  try {
    await Page.enable();
    await Runtime.enable();
    
    // Navigate to extensions page
    await Page.navigate({ url: 'chrome://extensions/' });
    await new Promise(r => setTimeout(r, 3000));
    
    // Enable developer mode and load unpacked extension
    const loadScript = `
      (async () => {
        try {
          // Enable developer mode
          const devMode = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-toolbar').shadowRoot
            .querySelector('#devMode');
          
          if (devMode && !devMode.checked) {
            devMode.click();
            await new Promise(r => setTimeout(r, 1000));
          }
          
          // Click "Load unpacked"
          const loadBtn = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-toolbar').shadowRoot
            .querySelector('#loadUnpacked');
          
          if (loadBtn) {
            loadBtn.click();
            return { success: true, message: 'Load unpacked dialog opened' };
          } else {
            return { success: false, message: 'Load unpacked button not found' };
          }
        } catch (error) {
          return { success: false, message: error.message };
        }
      })()
    `;
    
    const result = await Runtime.evaluate({
      expression: loadScript,
      returnByValue: true,
      awaitPromise: true
    });
    
    const value = result.result?.value;
    if (value?.success) {
      console.log('   📂 Extension load dialog opened');
      console.log('   ⚠️  Please manually select the extension folder:');
      console.log(`      ${extensionPath}`);
      console.log('   ⏳ Waiting 10 seconds for manual selection...');
      
      await new Promise(r => setTimeout(r, 10000));
      
      // Check for loaded extension
      const newTabs = await CDP.List();
      const extensionTabs = newTabs.filter(t => 
        t.url.includes('chrome-extension://') && 
        (t.url.includes('panel') || t.url.includes('resolver'))
      );
      
      if (extensionTabs.length > 0) {
        const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
        console.log('   ✅ Extension loaded successfully');
        return extensionId;
      } else {
        console.log('   ❌ Extension not detected after load');
        return null;
      }
    } else {
      console.log('   ❌ Could not open load dialog:', value?.message);
      return null;
    }
  } finally {
    await client.close();
  }
}

async function reloadExtension(tabs, extensionId) {
  console.log('   🔄 Reloading extension...');
  
  // Find or open chrome://extensions tab
  let extensionsTab = tabs.find(t => t.url === 'chrome://extensions/');
  
  if (!extensionsTab) {
    const firstTab = tabs[0];
    const client = await CDP({ target: firstTab });
    const { Page } = client;
    await Page.enable();
    await Page.navigate({ url: 'chrome://extensions/' });
    console.log('   📄 Opened chrome://extensions');
    await new Promise(r => setTimeout(r, 2000));
    await client.close();
    
    const newTabs = await CDP.List();
    extensionsTab = newTabs.find(t => t.url === 'chrome://extensions/');
  }
  
  if (extensionsTab) {
    const client = await CDP({ target: extensionsTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    const reloadScript = `
      (async () => {
        try {
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
            }
          }
          return { success: false, message: 'Extension or reload button not found' };
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
      console.log('   ✅ Extension reloaded');
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log('   ⚠️  Reload result:', value?.message);
    }
    
    await client.close();
  }
}

async function testResolver(extensionId) {
  // Check desktop node registry health
  try {
    const healthResponse = await fetch('http://localhost:8788/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('   ✅ Desktop node registry healthy');
      console.log(`      Service: ${health.service}, Status: ${health.status}`);
      
      // Test MultiRegistryClient detection
      console.log('   🔌 MultiRegistryClient will prefer desktop node');
    } else {
      console.log('   ⚠️  Desktop node registry unhealthy:', healthResponse.status);
      console.log('   🔧 Extension will fallback to VPS (34.107.74.70:8788)');
    }
  } catch (error) {
    console.log('   ❌ Desktop node registry not accessible');
    console.log('   🔧 Extension will use VPS fallback (34.107.74.70:8788)');
    console.log('   💡 Start local registry: npm run start:registry');
  }
  
  // Open extension panels for testing
  const tabs = await CDP.List();
  if (tabs.length > 0) {
    const client = await CDP({ target: tabs[0] });
    const { Page } = client;
    await Page.enable();
    
    // Open resolver
    const resolverUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=testotest.dweb&view=1`;
    await Page.navigate({ url: resolverUrl });
    console.log('   🌐 Opened resolver test page');
    
    await client.close();
  }
}

// Run if executed directly
main().catch(console.error);