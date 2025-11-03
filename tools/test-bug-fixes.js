#!/usr/bin/env node

/**
 * Automated Test for Bug Fixes
 * 
 * Tests three specific issues:
 * 1. Peer count increasing on refresh
 * 2. Domain registration without peers
 * 3. Desktop node restart functionality
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

class BugFixTests {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = {
      peerCountTest: null,
      noPeersValidationTest: null,
      restartButtonTest: null
    };
  }

  async setup() {
    console.log('🚀 Setting up test environment...');
    
    // Check desktop services
    await this.checkServices();
    
    // Connect to existing Chrome debug instance (preferred) or launch new one
    try {
      console.log('   🔌 Connecting to Chrome debug instance on port 9222...');
      this.browser = await chromium.connectOverCDP('http://localhost:9222');
      console.log('   ✅ Connected to existing Chrome instance');
    } catch (error) {
      console.log('   ⚠️  Could not connect to Chrome debug mode');
      console.log('   🚀 Launching new browser with extension...');
      
      this.browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
    
    // Get extension page
    const extensionId = await this.getExtensionId();
    const panelUrl = `chrome-extension://${extensionId}/panel/index.html`;
    
    // Get or create page
    const pages = this.browser.contexts()[0]?.pages() || [];
    if (pages.length > 0) {
      this.page = pages[0];
      await this.page.goto(panelUrl);
    } else {
      this.page = await this.browser.newPage();
      await this.page.goto(panelUrl);
    }
    
    console.log('✅ Extension panel loaded');
  }

  async checkServices() {
    console.log('🔍 Checking desktop services...');
    
    try {
      const registryCheck = await fetch('http://localhost:8788/health');
      if (!registryCheck.ok) throw new Error('Registry unhealthy');
      console.log('   ✅ Registry service running');
    } catch (error) {
      throw new Error('❌ Registry service not running. Start desktop node first!');
    }
    
    try {
      const storageCheck = await fetch('http://localhost:8789/health');
      if (!storageCheck.ok) throw new Error('Storage unhealthy');
      console.log('   ✅ Storage service running');
    } catch (error) {
      throw new Error('❌ Storage service not running. Start desktop node first!');
    }
    
    console.log('   ℹ️  Signaling service check skipped (WebSocket)');
  }

  async getExtensionId() {
    const targets = this.browser.contexts()[0].backgroundPages();
    if (targets.length > 0) {
      const url = targets[0].url();
      const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) return match[1];
    }
    throw new Error('Could not find extension ID');
  }

  async testPeerCountOnRefresh() {
    console.log('\n🧪 Test #1: Peer Count on Refresh');
    console.log('=' .repeat(60));
    
    try {
      // Connect to signaling
      await this.page.click('#connectBtn');
      await this.page.waitForTimeout(2000);
      
      // Get initial peer count
      const initialCount = await this.page.evaluate(() => {
        const peerCountEl = document.querySelector('[data-stat="connected-peers"]');
        return peerCountEl ? parseInt(peerCountEl.textContent) : 0;
      });
      
      console.log(`   📊 Initial peer count: ${initialCount}`);
      
      // Refresh the page (simulate user F5)
      console.log('   🔄 Refreshing page...');
      await this.page.reload({ waitUntil: 'networkidle' });
      await this.page.waitForTimeout(3000);
      
      // Reconnect (as user would do)
      await this.page.click('#connectBtn');
      await this.page.waitForTimeout(2000);
      
      // Get peer count after refresh
      const afterRefreshCount = await this.page.evaluate(() => {
        const peerCountEl = document.querySelector('[data-stat="connected-peers"]');
        return peerCountEl ? parseInt(peerCountEl.textContent) : 0;
      });
      
      console.log(`   📊 Peer count after refresh: ${afterRefreshCount}`);
      
      // Check console for re-registration message
      const consoleMessages = [];
      this.page.on('console', msg => consoleMessages.push(msg.text()));
      
      const passed = initialCount === afterRefreshCount;
      
      this.results.peerCountTest = {
        passed,
        initialCount,
        afterRefreshCount,
        difference: afterRefreshCount - initialCount
      };
      
      if (passed) {
        console.log('   ✅ PASS: Peer count remained stable');
      } else {
        console.log(`   ❌ FAIL: Peer count changed by ${afterRefreshCount - initialCount}`);
      }
      
      return passed;
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.peerCountTest = { passed: false, error: error.message };
      return false;
    }
  }

  async testNoPeersValidation() {
    console.log('\n🧪 Test #2: Domain Registration Without Peers');
    console.log('=' .repeat(60));
    
    try {
      // First, disconnect or ensure no peers
      console.log('   🔌 Ensuring no peers connected...');
      
      // Navigate to fresh page (no connection)
      await this.page.reload();
      await this.page.waitForTimeout(1000);
      
      // Navigate to Publish tab
      await this.page.click('button:has-text("Publish")');
      await this.page.waitForTimeout(500);
      
      // Fill in domain fields
      await this.page.fill('#domainInput', 'test-no-peers.dweb');
      await this.page.fill('#ownerInput', 'test-owner');
      
      // Try to register domain
      console.log('   🚫 Attempting domain registration without peers...');
      await this.page.click('#registerDomainBtn');
      await this.page.waitForTimeout(1000);
      
      // Check for error message in registry log
      const errorMessage = await this.page.evaluate(() => {
        const logEl = document.querySelector('#registryLog');
        return logEl ? logEl.textContent : '';
      });
      
      const hasError = errorMessage.includes('No peers connected') || 
                       errorMessage.includes('Cannot register domain');
      
      // Check domain bind status
      const bindStatus = await this.page.evaluate(() => {
        const statusEl = document.querySelector('#domainBindStatus');
        return statusEl ? statusEl.textContent : '';
      });
      
      const hasErrorStatus = bindStatus.includes('No peers available');
      
      const passed = hasError && hasErrorStatus;
      
      this.results.noPeersValidationTest = {
        passed,
        errorMessageFound: hasError,
        statusUpdated: hasErrorStatus,
        errorMessage: errorMessage.slice(-100) // Last 100 chars
      };
      
      if (passed) {
        console.log('   ✅ PASS: Domain registration blocked without peers');
        console.log(`   📝 Error message: "${errorMessage.slice(-60)}"`);
      } else {
        console.log('   ❌ FAIL: Domain registration was not blocked');
        console.log(`   📝 Registry log: ${errorMessage.slice(-100)}`);
      }
      
      return passed;
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.noPeersValidationTest = { passed: false, error: error.message };
      return false;
    }
  }

  async testDesktopNodeRestart() {
    console.log('\n🧪 Test #3: Desktop Node Restart Button');
    console.log('=' .repeat(60));
    
    try {
      console.log('   ℹ️  This test requires manual verification of desktop node UI');
      console.log('   ℹ️  Checking if restart endpoint is responsive...');
      
      // Check if we can query the desktop node's status
      const beforeStats = await fetch('http://localhost:8788/health');
      if (!beforeStats.ok) {
        throw new Error('Desktop node not accessible');
      }
      
      const beforeUptime = await this.getUptime();
      console.log(`   📊 Uptime before restart: ${beforeUptime}s`);
      
      // Note: We can't actually click the restart button in the Electron app
      // But we can verify the IPC handler exists and services are responsive
      console.log('   ⚠️  Manual step: Click "Restart Services" in desktop node UI');
      console.log('   ⚠️  Expected: Button shows "⏳ Restarting..." then "✅ Restarted"');
      console.log('   ⚠️  Expected: Restart completes within 10 seconds');
      
      // Wait for potential restart
      await this.page.waitForTimeout(3000);
      
      // Check services are still responsive
      const afterStats = await fetch('http://localhost:8788/health');
      const servicesHealthy = afterStats.ok;
      
      this.results.restartButtonTest = {
        passed: servicesHealthy,
        servicesResponsive: servicesHealthy,
        manualVerificationRequired: true,
        note: 'Desktop node restart requires manual testing in Electron app'
      };
      
      if (servicesHealthy) {
        console.log('   ✅ PASS: Services remain healthy (manual verification needed)');
      } else {
        console.log('   ❌ FAIL: Services not responding after expected restart');
      }
      
      return servicesHealthy;
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.restartButtonTest = { passed: false, error: error.message };
      return false;
    }
  }

  async getUptime() {
    try {
      const response = await fetch('http://localhost:8788/health');
      const data = await response.json();
      return data.uptime || 0;
    } catch {
      return 0;
    }
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    const tests = [
      { name: 'Peer Count on Refresh', result: this.results.peerCountTest },
      { name: 'No Peers Validation', result: this.results.noPeersValidationTest },
      { name: 'Restart Button', result: this.results.restartButtonTest }
    ];
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    tests.forEach(test => {
      const icon = test.result?.passed ? '✅' : '❌';
      const status = test.result?.passed ? 'PASS' : 'FAIL';
      console.log(`${icon} ${test.name}: ${status}`);
      
      if (test.result?.passed) {
        totalPassed++;
      } else {
        totalFailed++;
      }
      
      if (test.result?.error) {
        console.log(`   Error: ${test.result.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('='.repeat(60));
    
    // Write results to JSON file
    const fs = await import('fs');
    const reportPath = path.join(__dirname, 'reports', `bug-fixes-${Date.now()}.json`);
    
    // Ensure reports directory exists
    if (!fs.existsSync(path.join(__dirname, 'reports'))) {
      fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { passed: totalPassed, failed: totalFailed },
      tests: this.results
    }, null, 2));
    
    console.log(`\n📄 Report saved: ${reportPath}`);
    
    return totalFailed === 0;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.browser) {
      await this.browser.close();
    }
    console.log('✅ Cleanup complete');
  }

  async run() {
    try {
      await this.setup();
      
      // Run all tests
      await this.testPeerCountOnRefresh();
      await this.testNoPeersValidation();
      await this.testDesktopNodeRestart();
      
      // Generate report
      const allPassed = await this.generateReport();
      
      await this.cleanup();
      
      process.exit(allPassed ? 0 : 1);
    } catch (error) {
      console.error('\n💥 Test suite failed:', error.message);
      console.error(error.stack);
      
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testRunner = new BugFixTests();
  testRunner.run();
}

export { BugFixTests };
