#!/usr/bin/env node

/**
 * Test DWeb Resolver with Storage Fallback
 * Verifies that heyheyhey.dweb loads correctly via desktop node
 */

import CDP from 'chrome-remote-interface';

async function testResolverFallback() {
  console.log('🧪 Testing DWeb Resolver Storage Fallback');
  console.log('='.repeat(60));
  
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`\n✓ Connected to Chrome (${tabs.length} tabs)`);
    
    // Find resolver tab or create new one
    let resolverTab = tabs.find(t => t.url.includes('resolver.html'));
    
    if (!resolverTab) {
      console.log('📄 Opening new resolver tab...');
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page } = client;
      await Page.enable();
      
      const extensionId = 'dhnlmdolnenmkealoekhnmjknllealip';
      await Page.navigate({ url: `chrome-extension://${extensionId}/resolver/resolver.html` });
      await new Promise(r => setTimeout(r, 2000));
      await client.close();
      
      const newTabs = await CDP.List();
      resolverTab = newTabs.find(t => t.url.includes('resolver.html'));
    }
    
    if (!resolverTab) {
      console.log('❌ Could not open resolver tab');
      return;
    }
    
    console.log('✓ Found resolver tab');
    
    // Connect to resolver tab
    const client = await CDP({ target: resolverTab });
    const { Page, Runtime, Console } = client;
    
    await Page.enable();
    await Runtime.enable();
    await Console.enable();
    
    // Collect console logs
    const logs = [];
    Console.messageAdded(({ message }) => {
      const text = message.text || '';
      logs.push({
        level: message.level,
        text,
        timestamp: Date.now()
      });
      
      if (message.level === 'error') {
        console.log(`   ❌ [Console Error] ${text}`);
      } else if (text.includes('Resolved') || text.includes('fallback') || text.includes('chunk')) {
        console.log(`   📝 [Console] ${text}`);
      }
    });
    
    console.log('\n🌐 Navigating to heyheyhey.dweb...');
    
    // Navigate directly via URL with domain parameter
    const extensionId = resolverTab.url.match(/chrome-extension:\/\/([^/]+)/)[1];
    const resolveUrl = `chrome-extension://${extensionId}/resolver/resolver.html?domain=heyheyhey.dweb&view=1`;
    
    await Page.navigate({ url: resolveUrl });
    console.log('✓ Navigated to resolver URL');
    console.log('\n⏳ Waiting for content to load (10 seconds)...\n');
    
    // Wait for initial load
    await new Promise(r => setTimeout(r, 3000));
    
    // Check page content
    const pageContentScript = `
      (async () => {
        return {
          title: document.title,
          bodyHTML: document.body.innerHTML.substring(0, 500),
          url: window.location.href
        };
      })()
    `;
    
    const pageContent = await Runtime.evaluate({
      expression: pageContentScript,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('\n📝 Page Content:');
    console.log(JSON.stringify(pageContent.result?.value, null, 2));
    
    // Wait for resolution and rendering
    await new Promise(r => setTimeout(r, 7000));
    
    // Check the resolved content
    const checkContentScript = `
      (async () => {
        const contentFrame = document.getElementById('previewFrame');
        const logOutput = document.getElementById('logOutput');
        const statusMode = document.getElementById('statusMode');
        
        return {
          hasFrame: !!contentFrame,
          frameSrc: contentFrame?.src || null,
          frameSrcDoc: contentFrame?.srcdoc ? contentFrame.srcdoc.substring(0, 100) : null,
          statusMode: statusMode?.textContent || '',
          logText: logOutput?.textContent || '',
          hasError: logOutput?.textContent.toLowerCase().includes('error')
        };
      })()
    `;
    
    const contentCheck = await Runtime.evaluate({
      expression: checkContentScript,
      returnByValue: true,
      awaitPromise: true
    });
    
    const content = contentCheck.result?.value;
    
    console.log('\n📊 Resolution Results:');
    console.log('─'.repeat(60));
    console.log(`   Content Frame: ${content.hasFrame ? '✓' : '✗'}`);
    console.log(`   Frame Source: ${content.frameSrc || 'none'}`);
    console.log(`   Frame SrcDoc: ${content.frameSrcDoc ? content.frameSrcDoc + '...' : 'none'}`);
    console.log(`   Status Mode: ${content.statusMode}`);
    
    if (content.hasError) {
      console.log(`   ❌ Log contains errors`);
    }
    
    if (content.logText) {
      console.log(`\n📋 Log Output (last 200 chars):`);
      console.log(`   ${content.logText.slice(-200)}`);
    }
    
    // Analyze console logs
    console.log('\n📝 Console Log Summary:');
    console.log('─'.repeat(60));
    
    const resolvedLogs = logs.filter(l => l.text.includes('Resolved') || l.text.includes('manifest'));
    const fallbackLogs = logs.filter(l => l.text.includes('fallback') || l.text.includes('storage'));
    const chunkLogs = logs.filter(l => l.text.includes('chunk'));
    const errorLogs = logs.filter(l => l.level === 'error');
    
    console.log(`   Resolved events: ${resolvedLogs.length}`);
    console.log(`   Fallback events: ${fallbackLogs.length}`);
    console.log(`   Chunk operations: ${chunkLogs.length}`);
    console.log(`   Errors: ${errorLogs.length}`);
    
    // Final verdict
    console.log('\n' + '='.repeat(60));
    if (content.hasFrame && (content.frameSrc || content.frameSrcDoc) && !content.hasError) {
      console.log('✅ SUCCESS: Domain resolved and content loaded!');
      if (content.frameSrc) console.log(`   📄 Content URL: ${content.frameSrc}`);
      if (content.frameSrcDoc) console.log(`   📄 Content rendered inline`);
      if (fallbackLogs.length > 0) {
        console.log(`   🔄 Storage fallback was used (${fallbackLogs.length} events)`);
      }
    } else if (fallbackLogs.length > 0) {
      console.log('⚠️  PARTIAL: Fallback attempted but content may not have loaded');
    } else {
      console.log('❌ FAILED: Domain resolution unsuccessful');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

testResolverFallback();
