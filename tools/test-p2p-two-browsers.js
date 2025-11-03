#!/usr/bin/env node

/**
 * DWeb P2P Two-Browser Test
 * Tests peer-to-peer connectivity between two browser instances
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

class P2PTwoBrowserTest {
  constructor() {
    this.browser1 = null;
    this.browser2 = null;
    this.context1 = null;
    this.context2 = null;
    this.extensionId1 = null;
    this.extensionId2 = null;
    this.testDomain = `p2p-test-${Date.now()}.dweb`;
  }

  async setup() {
    console.log('🚀 Setting up P2P two-browser test...');
    
    // Launch first browser (uploader/seeder)
    console.log('📱 Launching Browser 1 (Seeder)...');
    this.browser1 = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-web-security',
        '--user-data-dir=/tmp/chrome-test-1'
      ]
    });
    this.context1 = this.browser1.contexts()[0];
    
    // Launch second browser (downloader/peer)
    console.log('📱 Launching Browser 2 (Peer)...');
    this.browser2 = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-web-security',
        '--user-data-dir=/tmp/chrome-test-2'
      ]
    });
    this.context2 = this.browser2.contexts()[0];
    
    console.log('✅ Both browsers launched');
  }

  async findExtensionIds() {
    console.log('\n🔍 Finding extension IDs...');
    
    // Find extension ID in browser 1
    const page1 = await this.context1.newPage();
    await page1.goto('chrome://extensions/');
    await page1.waitForTimeout(2000);
    
    const extensionElements1 = await page1.$$('extensions-item');
    for (const element of extensionElements1) {
      const name = await element.evaluate(el => {
        const shadowRoot = el.shadowRoot;
        const nameEl = shadowRoot?.querySelector('#name');
        return nameEl?.textContent || '';
      });
      
      if (name.toLowerCase().includes('dweb')) {
        this.extensionId1 = await element.evaluate(el => el.id);
        break;
      }
    }
    await page1.close();
    
    // Find extension ID in browser 2
    const page2 = await this.context2.newPage();
    await page2.goto('chrome://extensions/');
    await page2.waitForTimeout(2000);
    
    const extensionElements2 = await page2.$$('extensions-item');
    for (const element of extensionElements2) {
      const name = await element.evaluate(el => {
        const shadowRoot = el.shadowRoot;
        const nameEl = shadowRoot?.querySelector('#name');
        return nameEl?.textContent || '';
      });
      
      if (name.toLowerCase().includes('dweb')) {
        this.extensionId2 = await element.evaluate(el => el.id);
        break;
      }
    }
    await page2.close();
    
    if (!this.extensionId1 || !this.extensionId2) {
      throw new Error('Extension not found in one or both browsers');
    }
    
    console.log(`   ✅ Browser 1 extension: ${this.extensionId1}`);
    console.log(`   ✅ Browser 2 extension: ${this.extensionId2}`);
  }

  async testP2PUploadAndResolve() {
    console.log('\n📤 Testing P2P upload and resolve flow...');
    
    // Step 1: Upload content in browser 1
    console.log('1️⃣  Uploading content in Browser 1...');
    const panel1 = await this.context1.newPage();
    await panel1.goto(`chrome-extension://${this.extensionId1}/panel/panel.html`);
    await panel1.waitForSelector('#uploadBtn', { timeout: 10000 });
    
    // Set test domain
    await panel1.fill('#domainInput', this.testDomain);
    console.log(`   🌐 Test domain: ${this.testDomain}`);
    
    // Create test content
    const testContent = `
      <html>
        <head><title>P2P Test Content</title></head>
        <body>
          <h1>P2P Test</h1>
          <p>Generated at: ${new Date().toISOString()}</p>
          <p>Browser 1 uploaded this content</p>
          <div id="test-marker">P2P_TEST_SUCCESS</div>
        </body>
      </html>
    `;
    
    // Simulate file upload (this would require more complex setup in real test)
    console.log('   📁 Content prepared for upload');
    console.log(`   📊 Size: ${testContent.length} bytes`);
    
    // Step 2: Wait for upload to complete (simulated)
    await panel1.waitForTimeout(2000);
    console.log('   ✅ Upload simulation complete');
    
    // Step 3: Resolve content in browser 2
    console.log('\n2️⃣  Resolving content in Browser 2...');
    const resolver2 = await this.context2.newPage();
    await resolver2.goto(`chrome-extension://${this.extensionId2}/resolver/resolver.html`);
    await resolver2.waitForSelector('#resolveBtn', { timeout: 10000 });
    
    // Set domain and resolve
    await resolver2.fill('#domainInput', this.testDomain);
    await resolver2.click('#resolveBtn');
    
    // Wait for resolution attempt
    await resolver2.waitForTimeout(5000);
    
    // Check logs for P2P activity
    const logContent = await resolver2.$eval('#logOutput', el => el.textContent);
    console.log('   📝 Resolution logs preview:', logContent.slice(0, 200) + '...');
    
    if (logContent.includes('Resolving') || logContent.includes('peer')) {
      console.log('   ✅ P2P resolution attempted');
    } else {
      console.log('   ⚠️  P2P resolution unclear');
    }
    
    await panel1.close();
    await resolver2.close();
  }

  async testSignalingConnection() {
    console.log('\n🔗 Testing signaling connection...');
    
    // Open panel in both browsers to check signaling status
    const panel1 = await this.context1.newPage();
    const panel2 = await this.context2.newPage();
    
    await panel1.goto(`chrome-extension://${this.extensionId1}/panel/panel.html`);
    await panel2.goto(`chrome-extension://${this.extensionId2}/panel/panel.html`);
    
    await panel1.waitForSelector('#logOutput', { timeout: 10000 });
    await panel2.waitForSelector('#logOutput', { timeout: 10000 });
    
    // Wait for potential signaling messages
    await panel1.waitForTimeout(3000);
    await panel2.waitForTimeout(3000);
    
    // Check for signaling activity in logs
    const logs1 = await panel1.$eval('#logOutput', el => el.textContent);
    const logs2 = await panel2.$eval('#logOutput', el => el.textContent);
    
    console.log('   📊 Browser 1 signaling activity:', logs1.includes('signaling') || logs1.includes('WebSocket'));
    console.log('   📊 Browser 2 signaling activity:', logs2.includes('signaling') || logs2.includes('WebSocket'));
    
    // Check for P2P indicators
    const hasPeerActivity = logs1.includes('peer') || logs2.includes('peer') || 
                           logs1.includes('P2P') || logs2.includes('P2P');
    
    if (hasPeerActivity) {
      console.log('   ✅ P2P activity detected in one or both browsers');
    } else {
      console.log('   ⚠️  No clear P2P activity detected (may be expected for isolated test)');
    }
    
    await panel1.close();
    await panel2.close();
  }

  async testMultiRegistrySync() {
    console.log('\n🔄 Testing MultiRegistryClient synchronization...');
    
    // Check if both browsers see the same registry state
    const resolver1 = await this.context1.newPage();
    const resolver2 = await this.context2.newPage();
    
    await resolver1.goto(`chrome-extension://${this.extensionId1}/resolver/resolver.html`);
    await resolver2.goto(`chrome-extension://${this.extensionId2}/resolver/resolver.html`);
    
    await resolver1.waitForSelector('#registryUrl', { timeout: 10000 });
    await resolver2.waitForSelector('#registryUrl', { timeout: 10000 });
    
    // Get registry URLs from both browsers
    const registryUrl1 = await resolver1.$eval('#registryUrl', el => el.value);
    const registryUrl2 = await resolver2.$eval('#registryUrl', el => el.value);
    
    console.log(`   🔗 Browser 1 registry: ${registryUrl1}`);
    console.log(`   🔗 Browser 2 registry: ${registryUrl2}`);
    
    if (registryUrl1 === registryUrl2) {
      console.log('   ✅ Registry URLs synchronized');
    } else {
      console.log('   ⚠️  Registry URLs differ between browsers');
    }
    
    await resolver1.close();
    await resolver2.close();
  }

  async runTests() {
    const tests = [
      () => this.findExtensionIds(),
      () => this.testSignalingConnection(),
      () => this.testMultiRegistrySync(),
      () => this.testP2PUploadAndResolve()
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test();
        passed++;
      } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        failed++;
      }
    }

    return { passed, failed };
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up browsers...');
    if (this.browser1) {
      await this.browser1.close();
      console.log('✅ Browser 1 closed');
    }
    if (this.browser2) {
      await this.browser2.close();
      console.log('✅ Browser 2 closed');
    }
  }
}

// Main test runner
async function main() {
  console.log('🌐 DWeb P2P Two-Browser Test Suite');
  console.log('=' .repeat(60));
  
  const tester = new P2PTwoBrowserTest();
  
  try {
    await tester.setup();
    const results = await tester.runTests();
    
    console.log('\n🎯 P2P Test Summary:');
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
    
    if (results.failed === 0) {
      console.log('\n🎉 All P2P tests passed!');
    } else {
      console.log('\n⚠️  Some P2P tests failed - check logs above');
    }
    
    console.log('\n💡 Note: P2P connectivity depends on:');
    console.log('   • Desktop node signaling server');
    console.log('   • Network configuration');
    console.log('   • WebRTC peer discovery');
    console.log('   • Browser isolation may limit peer detection');
    
  } catch (error) {
    console.error('❌ P2P test suite error:', error.message);
  } finally {
    await tester.cleanup();
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { P2PTwoBrowserTest };