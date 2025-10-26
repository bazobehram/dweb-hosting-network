#!/usr/bin/env node

/**
 * Load Extension and Start Testing
 * 
 * This script:
 * 1. Navigates to chrome://extensions
 * 2. Guides extension loading (or detects if already loaded)
 * 3. Opens panel tabs
 * 4. Runs comprehensive tests
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = join(__dirname, '..', 'extension');

async function main() {
  console.log('🚀 Starting automated extension load and test...\n');
  
  let client;
  
  try {
    // List all tabs
    const tabs = await CDP.List();
    console.log(`Found ${tabs.length} tab(s)`);
    
    // Check if extension is already loaded
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && t.url.includes('panel/index.html')
    );
    
    if (extensionTabs.length > 0) {
      console.log(`✓ Extension already loaded with ${extensionTabs.length} panel tab(s)`);
      console.log('Extension ID:', extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1]);
      
      // Open more panel tabs if needed
      if (extensionTabs.length < 2) {
        console.log(`\nOpening additional panel tab...`);
        const firstPanel = extensionTabs[0];
        const panelUrl = firstPanel.url;
        
        client = await CDP({ target: tabs[0] });
        const { Page } = client;
        await Page.enable();
        
        // Open new tab with panel URL
        await Page.navigate({ url: panelUrl });
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('✓ Additional panel tab opened');
      }
      
      console.log('\n✅ Extension setup complete!');
      console.log('\n📊 Running status check...\n');
      
      // Run status check
      const { exec } = await import('child_process');
      exec('node tools/check-status.js', (error, stdout, stderr) => {
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        
        console.log('\n🧪 Ready for testing!');
        console.log('\nNext steps:');
        console.log('  1. Run: node tools/reload-and-test.js');
        console.log('  2. Check: node tools/check-relay-capability.js');
        console.log('  3. Test: node tools/manual-dial.js');
      });
      
      if (client) await client.close();
      return;
    }
    
    // Extension not loaded - guide manual loading
    console.log('\n❌ Extension not loaded yet.');
    console.log('\n📝 To load the extension:');
    console.log('  1. In Chrome, go to: chrome://extensions');
    console.log('  2. Enable "Developer mode" (top right toggle)');
    console.log('  3. Click "Load unpacked"');
    console.log(`  4. Select folder: ${extensionPath}`);
    console.log('  5. Click on "Inspect views: panel/index.html" twice to open 2 panels');
    console.log('\nThen run this script again!\n');
    
    // Navigate first tab to extensions page
    if (tabs.length > 0) {
      console.log('Opening chrome://extensions in current tab...');
      client = await CDP({ target: tabs[0] });
      const { Page } = client;
      await Page.enable();
      await Page.navigate({ url: 'chrome://extensions/' });
      console.log('✓ Extensions page opened\n');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nMake sure Chrome is running with:');
    console.error('  chrome.exe --remote-debugging-port=9222\n');
  } finally {
    if (client) {
      await client.close();
    }
  }
}

main();
