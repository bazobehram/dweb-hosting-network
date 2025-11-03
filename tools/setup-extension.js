#!/usr/bin/env node

/**
 * DWeb Extension Setup Helper
 * Provides clear instructions for manual extension setup
 */

import CDP from 'chrome-remote-interface';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

async function main() {
  console.log('🔧 DWeb Extension Setup Helper');
  console.log('=' .repeat(50));
  
  try {
    // Check Chrome connection
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    if (tabs.length === 0) {
      console.log('❌ Chrome not found with remote debugging');
      console.log('\n📋 Setup Steps:');
      console.log('1. Run: ./start-chrome-debug.ps1');
      console.log('2. Run this script again');
      return;
    }
    
    console.log(`✅ Chrome connected (${tabs.length} tabs)`);
    
    // Check for existing extension
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && 
      (t.url.includes('panel') || t.url.includes('resolver'))
    );
    
    if (extensionTabs.length > 0) {
      const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
      console.log(`✅ Extension already loaded: ${extensionId}`);
      
      // Test it
      await testExtension(extensionId);
      return;
    }
    
    // Extension not found - provide setup instructions
    console.log('📦 Extension not loaded yet');
    console.log('\n📋 Manual Setup Instructions:');
    console.log('1. Open Chrome (should already be running with debug mode)');
    console.log('2. Navigate to: chrome://extensions/');
    console.log('3. Toggle "Developer mode" ON (top right)');
    console.log('4. Click "Load unpacked"');
    console.log('5. Select this folder:');
    console.log(`   ${extensionPath}`);
    console.log('6. Run this script again to test');
    
    // Open extensions page automatically
    const firstTab = tabs[0];
    const client = await CDP({ target: firstTab });
    const { Page } = client;
    await Page.enable();
    await Page.navigate({ url: 'chrome://extensions/' });
    console.log('\n🌐 Opened chrome://extensions for you');
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testExtension(extensionId) {
  console.log('\n🧪 Testing extension...');
  
  // Test desktop node registry health
  try {
    const healthResponse = await fetch('http://localhost:8788/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log(`✅ Desktop node registry: ${health.service} - ${health.status}`);
    } else {
      console.log('⚠️  Desktop node registry unhealthy - start with: npm run start:registry');
    }
  } catch (error) {
    console.log('❌ Desktop node registry offline - start with: npm run start:registry');
  }
  
  // Test MultiRegistryClient functionality 
  console.log('🔌 Extension uses MultiRegistryClient for desktop/VPS fallback');
  console.log('   Desktop: http://localhost:8788 (preferred)');
  console.log('   VPS Fallback: http://34.107.74.70:8788');
  
  // Provide URLs
  console.log('\n🔗 Extension URLs:');
  console.log(`Panel: chrome-extension://${extensionId}/panel/panel.html`);
  console.log(`Resolver: chrome-extension://${extensionId}/resolver/resolver.html`);
  
  // Test resolver with domain
  const resolverTestUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=testotest.dweb&view=1`;
  console.log(`\n🎯 Test resolver: ${resolverTestUrl}`);
  
  // Open test page
  try {
    const tabs = await CDP.List();
    if (tabs.length > 0) {
      const client = await CDP({ target: tabs[0] });
      const { Page } = client;
      await Page.enable();
      await Page.navigate({ url: resolverTestUrl });
      console.log('🌐 Opened resolver test page');
      await client.close();
    }
  } catch (error) {
    console.log('⚠️  Could not auto-open test page');
  }
}

// Run
main().catch(console.error);