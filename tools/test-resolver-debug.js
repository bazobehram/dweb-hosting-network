#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function main() {
  console.log('🔍 DWeb Resolver Debug');
  console.log('='.repeat(60));

  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`\n✓ Connected to Chrome (${tabs.length} tabs)`);

    // Find resolver tab
    let resolverTab = tabs.find(t => t.url.includes('resolver'));
    
    if (!resolverTab) {
      console.log('Opening new resolver tab...');
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page } = client;
      await Page.enable();
      
      const extensionId = 'dhnlmdolnenmkealoekhnmjknllealip';
      await Page.navigate({ url: `chrome-extension://${extensionId}/resolver/index.html?domain=heyheyhey.dweb` });
      await new Promise(r => setTimeout(r, 3000));
      await client.close();
      
      const newTabs = await CDP.List();
      resolverTab = newTabs.find(t => t.url.includes('resolver'));
    }

    if (!resolverTab) {
      console.log('❌ Could not open resolver tab');
      return;
    }

    console.log(`✓ Found resolver tab: ${resolverTab.url}`);

    const client = await CDP({ target: resolverTab });
    const { Runtime, Console } = client;

    await Runtime.enable();
    await Console.enable();

    // Capture console logs
    Console.messageAdded(({ message }) => {
      console.log(`   [${message.level}] ${message.text || ''}`);
    });

    // Check page state
    const checkScript = `
      (async () => {
        return {
          url: window.location.href,
          domainInput: document.getElementById('domainInput')?.value || 'not found',
          resolveBtn: !!document.getElementById('resolveBtn'),
          logOutput: document.getElementById('logOutput')?.textContent?.substring(0, 200) || 'not found',
          hasRegistryClient: typeof registryClient !== 'undefined'
        };
      })()
    `;

    const result = await Runtime.evaluate({
      expression: checkScript,
      returnByValue: true,
      awaitPromise: true
    });

    console.log('\n📊 Resolver State:');
    console.log(JSON.stringify(result.result?.value, null, 2));

    // Try to resolve heyheyhey.dweb
    console.log('\n🌐 Attempting to resolve heyheyhey.dweb...');
    
    const resolveScript = `
      (async () => {
        const input = document.getElementById('domainInput');
        const btn = document.getElementById('resolveBtn');
        
        if (input && btn) {
          input.value = 'heyheyhey.dweb';
          btn.click();
          return { success: true };
        }
        
        return { success: false, error: 'Elements not found' };
      })()
    `;

    const resolveResult = await Runtime.evaluate({
      expression: resolveScript,
      returnByValue: true,
      awaitPromise: true
    });

    console.log('Resolve triggered:', resolveResult.result?.value);

    // Wait and check logs
    console.log('\n⏳ Waiting 15 seconds for resolution...\n');
    await new Promise(r => setTimeout(r, 15000));

    // Get final log output
    const logScript = `document.getElementById('logOutput')?.textContent || 'no logs'`;
    const logResult = await Runtime.evaluate({
      expression: logScript,
      returnByValue: true
    });

    console.log('\n📋 Resolver Log Output:');
    console.log(logResult.result?.value);

    await client.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main().catch(console.error);
