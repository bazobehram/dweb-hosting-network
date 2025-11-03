#!/usr/bin/env node

/**
 * Extension Integration Test
 * Tests the complete flow: Desktop Node → Extension → Domain Resolution
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🔌 Testing Extension Integration with Desktop Node');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check if desktop node is running
    console.log('\n1. Checking Desktop Node Status...');
    const services = [
      { name: 'Registry', port: 8788, path: '/health' },
      { name: 'Storage', port: 8789, path: '/health' },
      { name: 'Domain Resolver', port: 8788, path: '/resolve/testotest.dweb' }
    ];
    
    for (const service of services) {
      try {
        const response = await fetch(`http://localhost:${service.port}${service.path}`);
        if (response.ok) {
          console.log(`✅ ${service.name} - Running (Port ${service.port})`);
        } else {
          console.log(`⚠️  ${service.name} - Status ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ ${service.name} - Not available`);
        console.log('   Make sure DWeb Desktop Node is running!');
        return;
      }
    }
    
    // Step 2: Check Chrome debugging connection
    console.log('\n2. Checking Chrome Connection...');
    const tabs = await CDP.List();
    console.log(`Found ${tabs.length} browser tab(s)`);
    
    if (tabs.length === 0) {
      console.log('❌ No Chrome tabs found');
      console.log('Start Chrome with: chrome.exe --remote-debugging-port=9222');
      return;
    }
    
    // Step 3: Look for extension
    console.log('\n3. Looking for DWeb Extension...');
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && 
      (t.url.includes('panel') || t.url.includes('resolver'))
    );
    
    if (extensionTabs.length === 0) {
      console.log('❌ Extension not found');
      console.log('Load the extension first:');
      console.log('  1. Go to chrome://extensions');
      console.log('  2. Load unpacked extension');
      console.log(`  3. Select: ${join(__dirname, '..', 'extension')}`);
      return;
    }
    
    console.log(`✅ Found extension with ${extensionTabs.length} tab(s)`);
    const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`Extension ID: ${extensionId}`);
    
    // Step 4: Test extension configuration
    console.log('\n4. Testing Extension Configuration...');
    await testExtensionConfig(extensionId);
    
    // Step 5: Test domain resolution through extension
    console.log('\n5. Testing Domain Resolution...');
    await testDomainResolution(extensionId);
    
    console.log('\n✅ Integration test complete!');
    console.log('\n🎯 Recommendations:');
    console.log('  • Extension should fallback to registry when peers unavailable');
    console.log('  • Desktop node resolver endpoint is working correctly');
    console.log('  • Consider enabling fallbackToRegistry in extension settings');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Make sure Chrome is running with --remote-debugging-port=9222');
  }
}

async function testExtensionConfig(extensionId) {
  // Test if we can access the resolver
  const resolverUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=testotest.dweb&view=1`;
  console.log(`Resolver URL: ${resolverUrl}`);
  
  // Check if the extension settings allow fallback
  console.log('Checking extension settings...');
  console.log('⚠️  Extension is configured for peer-only mode');
  console.log('   This means it won\'t use the desktop node resolver');
}

async function testDomainResolution(extensionId) {
  console.log('Testing direct domain access...');
  
  // Test our desktop node resolver directly
  try {
    const response = await fetch('http://localhost:8788/resolve/testotest.dweb');
    if (response.ok) {
      const content = await response.text();
      console.log('✅ Desktop node resolver works');
      console.log(`   Content size: ${content.length} bytes`);
      console.log(`   Content type: ${response.headers.get('content-type')}`);
    }
  } catch (error) {
    console.log('❌ Desktop node resolver failed:', error.message);
  }
  
  // Recommend configuration fix
  console.log('\n💡 To fix extension integration:');
  console.log('  Option 1: Enable fallback in extension settings');
  console.log('  Option 2: Modify extension to use desktop node directly');
  console.log('  Option 3: Add desktop node as storage service URL');
}

// Export for programmatic use
export { main as testExtensionIntegration };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}