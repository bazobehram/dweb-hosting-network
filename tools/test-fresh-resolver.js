#!/usr/bin/env node

/**
 * Open Fresh Resolver Tab and Test Domain
 */
import CDP from 'chrome-remote-interface';

async function testFreshResolver() {
  console.log('🧪 Testing Fresh Resolver Tab');
  console.log('========================================\n');

  const domain = process.argv[2] || 'heyheyhey.dweb';
  
  let client;
  try {
    client = await CDP({ port: 9222 });
    const { Page, Runtime } = client;
    
    await Page.enable();
    await Runtime.enable();
    
    // Open fresh resolver tab
    const extensionId = 'dhnlmdolnenmkealoekhnmjknllealip';
    const resolverUrl = `chrome-extension://${extensionId}/resolver/index.html`;
    
    console.log(`🌐 Opening fresh resolver tab...`);
    await Page.navigate({ url: resolverUrl });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fill in domain and resolve
    console.log(`🎯 Testing domain: ${domain}`);
    await Runtime.evaluate({
      expression: `
        document.getElementById('domainInput').value = '${domain}';
        document.getElementById('resolveBtn').click();
      `
    });
    
    // Wait for resolution
    console.log('⏳ Waiting for resolution...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Get results
    const result = await Runtime.evaluate({
      expression: `({
        logs: document.getElementById('logOutput') ? document.getElementById('logOutput').textContent : '',
        statusBadges: Array.from(document.querySelectorAll('.badge')).map(el => el.textContent),
        hasContent: document.getElementById('previewFrame') ? document.getElementById('previewFrame').src !== '' : false
      })`
    });
    
    console.log('\n📋 Resolution Results:');
    const data = result.result?.value || {};
    if (data.logs) {
      console.log('Logs:', data.logs.split('\n').slice(-10).join('\n'));
    }
    
    console.log('\n📊 Status Badges:', data.statusBadges || []);
    console.log('🖼️  Preview Content:', data.hasContent ? 'Content loaded' : 'No content');
    
    if (data.logs && data.logs.includes('fetched from registry')) {
      console.log('🎉 SUCCESS: Registry fallback working!');
    } else if (data.logs && data.logs.includes('Pure P2P mode')) {
      console.log('❌ ISSUE: Still in pure P2P mode');
    } else {
      console.log('🔍 Check logs for resolution status');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testFreshResolver().catch(console.error);