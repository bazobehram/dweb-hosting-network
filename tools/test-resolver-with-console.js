#!/usr/bin/env node

/**
 * Test Resolver with Console Error Checking
 * Tests the specific failing domain and captures console errors
 */

import { chromium } from 'playwright';
import CDP from 'chrome-remote-interface';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

async function testResolverWithConsole() {
  console.log('🧪 Testing Resolver with Console Error Monitoring');
  console.log('=' .repeat(60));

  try {
    // Connect to existing Chrome instance
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    console.log(`✅ Connected to Chrome (${tabs.length} tabs)`);

    // Find extension
    const extensionTabs = tabs.filter(t => 
      t.url.includes('chrome-extension://') && 
      (t.url.includes('panel') || t.url.includes('resolver'))
    );

    if (extensionTabs.length === 0) {
      console.log('❌ Extension not found');
      return;
    }

    const extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
    console.log(`✅ Extension found: ${extensionId}`);

    // Test domain resolution
    const testDomain = 'heyheyhey.dweb';
    console.log(`\n🎯 Testing domain: ${testDomain}`);

    // Use Playwright for better browser automation
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const context = contexts[0];

    const page = await context.newPage();

    // Capture console logs and errors
    const consoleLogs = [];
    const consoleErrors = [];

    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(text);
        console.log(`❌ Console Error: ${text}`);
      } else {
        console.log(`📝 Console: ${text}`);
      }
    });

    page.on('pageerror', error => {
      const errorText = error.toString();
      consoleErrors.push(errorText);
      console.log(`💥 Page Error: ${errorText}`);
    });

    // Navigate to resolver
    const resolverUrl = `chrome-extension://${extensionId}/resolver/index.html`;
    console.log(`🌐 Opening resolver: ${resolverUrl}`);
    
    await page.goto(resolverUrl);
    
    // Wait for page to load
    await page.waitForSelector('#resolveBtn', { timeout: 10000 });
    console.log('✅ Resolver page loaded');

    // Clear any existing logs
    await page.evaluate(() => {
      const logOutput = document.getElementById('logOutput');
      if (logOutput) logOutput.textContent = '';
    });

    // Set domain and resolve
    await page.fill('#domainInput', testDomain);
    console.log(`📝 Domain set: ${testDomain}`);

    // Monitor network requests
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('localhost:8788') || url.includes('domains') || url.includes('manifests')) {
        console.log(`🌐 Network: ${route.request().method()} ${url}`);
      }
      route.continue();
    });

    // Click resolve
    console.log('🔍 Starting resolution...');
    await page.click('#resolveBtn');

    // Wait for resolution to complete
    await page.waitForTimeout(8000);

    // Get resolver logs
    const resolverLogs = await page.evaluate(() => {
      const logOutput = document.getElementById('logOutput');
      return logOutput ? logOutput.textContent : 'No log output found';
    });

    console.log('\n📋 Resolver Logs:');
    console.log(resolverLogs);

    // Check status badges
    const statusInfo = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[class*="badge"]'));
      return badges.map(badge => badge.textContent).filter(Boolean);
    });

    console.log('\n📊 Status Badges:');
    statusInfo.forEach(status => console.log(`   ${status}`));

    // Check preview frame
    const previewStatus = await page.evaluate(() => {
      const frame = document.getElementById('previewFrame');
      if (!frame) return 'Preview frame not found';
      
      const src = frame.getAttribute('src');
      if (!src) return 'Preview frame has no src';
      if (src.startsWith('blob:')) return 'Preview frame has blob content ✅';
      return `Preview frame src: ${src}`;
    });

    console.log(`\n🖼️  Preview Status: ${previewStatus}`);

    // Analyze the results
    console.log('\n🔍 Analysis:');
    if (resolverLogs.includes('Content rendered')) {
      console.log('✅ SUCCESS: Content was resolved and rendered');
    } else if (resolverLogs.includes('Chunk 0 unavailable')) {
      console.log('❌ FAILURE: Chunk unavailable - P2P resolution failed');
      
      if (resolverLogs.includes('with 0 replicas')) {
        console.log('🐛 ROOT CAUSE: Domain still shows 0 replicas - fix not working');
      } else if (resolverLogs.includes('from manifest')) {
        console.log('✅ FIX APPLIED: Using manifest replicas');
      }
    } else if (resolverLogs.includes('Domain not found')) {
      console.log('❌ FAILURE: Domain not found in registry');
    } else {
      console.log('⚠️  UNCLEAR: Unexpected resolution state');
    }

    // Console error summary
    console.log('\n🚨 Console Errors Summary:');
    if (consoleErrors.length === 0) {
      console.log('✅ No console errors detected');
    } else {
      console.log(`❌ ${consoleErrors.length} console errors:`);
      consoleErrors.forEach(error => console.log(`   • ${error}`));
    }

    await page.close();
    await browser.close();

    console.log('\n🏁 Test Complete');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testResolverWithConsole().catch(console.error);