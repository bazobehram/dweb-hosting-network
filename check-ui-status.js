const CDP = require('chrome-remote-interface');

async function checkUIStatus() {
  try {
    console.log('🔍 Checking available Chrome DevTools targets...\n');
    
    const targets = await CDP.List();
    
    console.log(`Found ${targets.length} targets:\n`);
    
    const extensionPanels = targets.filter(t => 
      t.url && t.url.includes('chrome-extension://') && t.url.includes('panel/index.html')
    );
    
    const extensionPages = targets.filter(t => 
      t.url && t.url.includes('chrome-extension://')
    );
    
    if (extensionPanels.length > 0) {
      console.log(`✅ Found ${extensionPanels.length} extension panel(s):`);
      extensionPanels.forEach((panel, i) => {
        console.log(`   ${i+1}. ID: ${panel.id}`);
        console.log(`      URL: ${panel.url}`);
        console.log(`      Type: ${panel.type}`);
      });
      console.log('\n✅ Ready to run live UI tests!');
      console.log('   Run: node test-live-ui.js\n');
    } else if (extensionPages.length > 0) {
      console.log(`⚠️  Found ${extensionPages.length} extension page(s), but no panel.html:`);
      extensionPages.forEach((page, i) => {
        console.log(`   ${i+1}. ${page.url}`);
      });
      console.log('\n📋 To test the UI:');
      console.log('   1. Open Chrome');
      console.log('   2. Click the DWeb extension icon (should auto-load if pinned)');
      console.log('   3. Re-run: node check-ui-status.js\n');
    } else {
      console.log('❌ No extension targets found.\n');
      console.log('📋 Setup steps:');
      console.log('   1. Ensure Chrome is running with remote debugging:');
      console.log('      chrome.exe --remote-debugging-port=9222');
      console.log('   2. Load the extension from: D:\\Projects\\dweb-hosting-network\\extension');
      console.log('   3. Open the extension popup');
      console.log('   4. Re-run: node check-ui-status.js\n');
    }
    
    // Also check for regular pages
    const pages = targets.filter(t => t.type === 'page' && !t.url.includes('chrome-extension://'));
    if (pages.length > 0) {
      console.log(`\n📄 Other pages open (${pages.length}):`);
      pages.slice(0, 3).forEach(page => {
        const url = page.url.length > 60 ? page.url.substring(0, 57) + '...' : page.url;
        console.log(`   • ${url}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to connect to Chrome DevTools:');
    console.error(`   ${error.message}\n`);
    console.log('📋 Troubleshooting:');
    console.log('   1. Ensure Chrome is running with:');
    console.log('      chrome.exe --remote-debugging-port=9222');
    console.log('   2. Check if port 9222 is accessible');
    console.log('   3. Try closing and restarting Chrome with the flag above\n');
  }
}

checkUIStatus();
