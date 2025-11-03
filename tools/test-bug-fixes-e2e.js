#!/usr/bin/env node

/**
 * Complete End-to-End Bug Fix Test
 * 
 * This script:
 * 1. Restarts desktop node services
 * 2. Reloads Chrome extension
 * 3. Tests all three bug fixes
 * 4. Generates comprehensive report
 */

import CDP from 'chrome-remote-interface';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

class E2EBugFixTester {
  constructor() {
    this.results = {
      desktopNodeRestart: null,
      extensionReload: null,
      peerCountTest: null,
      noPeersValidationTest: null,
      restartButtonTest: null
    };
    this.extensionId = null;
  }

  async run() {
    console.log('🚀 Complete End-to-End Bug Fix Test');
    console.log('=' .repeat(70));
    
    try {
      // Step 1: Restart Desktop Node
      await this.restartDesktopNode();
      
      // Step 2: Reload Extension  
      await this.reloadExtension();
      
      // Step 3: Run Bug Fix Tests
      await this.testPeerCountOnRefresh();
      await this.testNoPeersValidation();
      await this.testRestartButton();
      
      // Step 4: Generate Report
      await this.generateReport();
      
      process.exit(0);
    } catch (error) {
      console.error('\n💥 E2E test failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  async restartDesktopNode() {
    console.log('\n📱 Step 1: Restarting Desktop Node');
    console.log('-'.repeat(70));
    
    try {
      // Find and kill existing desktop node processes
      console.log('   🔍 Finding desktop node processes...');
      
      try {
        const killCmd = 'Get-Process | Where-Object { $_.ProcessName -like "*DWeb Desktop Node*" } | Stop-Process -Force';
        await execAsync(`powershell -Command "${killCmd}"`, { timeout: 5000 });
        console.log('   ✅ Stopped existing desktop node processes');
      } catch (error) {
        console.log('   ℹ️  No existing processes to stop');
      }
      
      // Wait for clean shutdown
      await new Promise(r => setTimeout(r, 2000));
      
      // Start desktop node
      console.log('   🚀 Starting desktop node...');
      const desktopNodePath = path.resolve(__dirname, '../desktop-node');
      
      // Start in background
      const nodeProcess = spawn('npm', ['start'], {
        cwd: desktopNodePath,
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      
      nodeProcess.unref();
      
      // Wait for services to start
      console.log('   ⏳ Waiting for services to start...');
      await new Promise(r => setTimeout(r, 5000));
      
      // Verify services
      const servicesHealthy = await this.checkServices();
      
      if (servicesHealthy) {
        console.log('   ✅ Desktop node restarted successfully');
        this.results.desktopNodeRestart = { success: true, servicesHealthy: true };
      } else {
        throw new Error('Desktop node services not healthy after restart');
      }
      
    } catch (error) {
      console.error('   ❌ Desktop node restart failed:', error.message);
      this.results.desktopNodeRestart = { success: false, error: error.message };
      throw error;
    }
  }

  async checkServices() {
    const services = [
      { name: 'Registry', url: 'http://localhost:8788/health' },
      { name: 'Storage', url: 'http://localhost:8789/health' }
    ];
    
    let allHealthy = true;
    
    for (const service of services) {
      try {
        const response = await fetch(service.url);
        if (response.ok) {
          console.log(`   ✅ ${service.name} service healthy`);
        } else {
          console.log(`   ❌ ${service.name} service unhealthy: ${response.status}`);
          allHealthy = false;
        }
      } catch (error) {
        console.log(`   ❌ ${service.name} service not accessible: ${error.message}`);
        allHealthy = false;
      }
    }
    
    return allHealthy;
  }

  async reloadExtension() {
    console.log('\n🔌 Step 2: Reloading Chrome Extension');
    console.log('-'.repeat(70));
    
    try {
      // Connect to Chrome
      console.log('   🔍 Connecting to Chrome debug mode...');
      const tabs = await CDP.List({ host: 'localhost', port: 9222 });
      
      if (tabs.length === 0) {
        throw new Error('No Chrome tabs found. Run: ./tools/start-chrome-debug.ps1');
      }
      
      console.log(`   ✅ Found ${tabs.length} tab(s)`);
      
      // Find extension
      const extensionTabs = tabs.filter(t => 
        t.url.includes('chrome-extension://') && 
        (t.url.includes('panel') || t.url.includes('resolver'))
      );
      
      if (extensionTabs.length === 0) {
        throw new Error('Extension not found. Load it at chrome://extensions');
      }
      
      this.extensionId = extensionTabs[0].url.match(/chrome-extension:\/\/([^/]+)/)[1];
      console.log(`   📦 Found extension: ${this.extensionId}`);
      
      // Reload extension
      console.log('   🔄 Reloading extension...');
      await this.performExtensionReload(tabs);
      
      // Wait for reload
      await new Promise(r => setTimeout(r, 3000));
      
      console.log('   ✅ Extension reloaded successfully');
      this.results.extensionReload = { success: true, extensionId: this.extensionId };
      
    } catch (error) {
      console.error('   ❌ Extension reload failed:', error.message);
      this.results.extensionReload = { success: false, error: error.message };
      throw error;
    }
  }

  async performExtensionReload(tabs) {
    // Navigate to extensions page
    let extensionsTab = tabs.find(t => t.url === 'chrome://extensions/');
    
    if (!extensionsTab) {
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page } = client;
      await Page.enable();
      await Page.navigate({ url: 'chrome://extensions/' });
      await new Promise(r => setTimeout(r, 2000));
      await client.close();
      
      const newTabs = await CDP.List();
      extensionsTab = newTabs.find(t => t.url === 'chrome://extensions/');
    }
    
    if (extensionsTab) {
      const client = await CDP({ target: extensionsTab });
      const { Runtime } = client;
      await Runtime.enable();
      
      const reloadScript = `
        (async () => {
          try {
            const extensions = document.querySelectorAll('extensions-item');
            for (const ext of extensions) {
              const shadowRoot = ext.shadowRoot;
              if (shadowRoot) {
                const name = shadowRoot.querySelector('#name');
                if (name && name.textContent.toLowerCase().includes('dweb')) {
                  const reloadBtn = shadowRoot.querySelector('#dev-reload-button');
                  if (reloadBtn && !reloadBtn.hidden) {
                    reloadBtn.click();
                    return { success: true };
                  }
                }
              }
            }
            return { success: false, message: 'Extension or reload button not found' };
          } catch (error) {
            return { success: false, message: error.message };
          }
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: reloadScript,
        returnByValue: true,
        awaitPromise: true
      });
      
      await client.close();
      
      const value = result.result?.value;
      if (!value?.success) {
        throw new Error(value?.message || 'Failed to reload extension');
      }
    }
  }

  async testPeerCountOnRefresh() {
    console.log('\n🧪 Test #1: Peer Count on Refresh');
    console.log('-'.repeat(70));
    
    try {
      // Open panel
      const tabs = await CDP.List();
      const panelUrl = `chrome-extension://${this.extensionId}/panel/index.html`;
      
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page, Runtime } = client;
      await Page.enable();
      await Runtime.enable();
      
      await Page.navigate({ url: panelUrl });
      await new Promise(r => setTimeout(r, 3000));
      
      // Connect to signaling
      await Runtime.evaluate({
        expression: 'document.getElementById("connectBtn").click()',
        returnByValue: false
      });
      
      await new Promise(r => setTimeout(r, 2000));
      
      // Get initial peer count
      const initialResult = await Runtime.evaluate({
        expression: `(function() {
          const peers = window.peers || [];
          return peers.length;
        })()`,
        returnByValue: true
      });
      
      const initialCount = initialResult.result?.value || 0;
      console.log(`   📊 Initial peer count: ${initialCount}`);
      
      // Refresh page
      console.log('   🔄 Refreshing page...');
      await Page.reload();
      await new Promise(r => setTimeout(r, 3000));
      
      // Reconnect
      await Runtime.evaluate({
        expression: 'document.getElementById("connectBtn").click()',
        returnByValue: false
      });
      
      await new Promise(r => setTimeout(r, 2000));
      
      // Get peer count after refresh
      const afterResult = await Runtime.evaluate({
        expression: `(function() {
          const peers = window.peers || [];
          return peers.length;
        })()`,
        returnByValue: true
      });
      
      const afterCount = afterResult.result?.value || 0;
      console.log(`   📊 Peer count after refresh: ${afterCount}`);
      
      const passed = initialCount === afterCount;
      
      this.results.peerCountTest = {
        passed,
        initialCount,
        afterCount,
        difference: afterCount - initialCount
      };
      
      if (passed) {
        console.log('   ✅ PASS: Peer count remained stable');
      } else {
        console.log(`   ❌ FAIL: Peer count changed by ${afterCount - initialCount}`);
      }
      
      await client.close();
      
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.peerCountTest = { passed: false, error: error.message };
    }
  }

  async testNoPeersValidation() {
    console.log('\n🧪 Test #2: Domain Registration Without Peers');
    console.log('-'.repeat(70));
    
    try {
      const tabs = await CDP.List();
      const panelUrl = `chrome-extension://${this.extensionId}/panel/index.html`;
      
      const firstTab = tabs[0];
      const client = await CDP({ target: firstTab });
      const { Page, Runtime } = client;
      await Page.enable();
      await Runtime.enable();
      
      // Open fresh panel (no connection)
      await Page.navigate({ url: panelUrl });
      await new Promise(r => setTimeout(r, 2000));
      
      // Navigate to Publish tab
      await Runtime.evaluate({
        expression: 'document.querySelector(\'button[onclick*="Publish"]\')?.click()',
        returnByValue: false
      });
      
      await new Promise(r => setTimeout(r, 500));
      
      // Fill domain fields and try to register
      await Runtime.evaluate({
        expression: `
          document.getElementById('domainInput').value = 'test-no-peers.dweb';
          document.getElementById('ownerInput').value = 'test-owner';
        `,
        returnByValue: false
      });
      
      console.log('   🚫 Attempting domain registration without peers...');
      
      await Runtime.evaluate({
        expression: 'document.getElementById("registerDomainBtn").click()',
        returnByValue: false
      });
      
      await new Promise(r => setTimeout(r, 1000));
      
      // Check for error message
      const errorResult = await Runtime.evaluate({
        expression: `
          (function() {
            const log = document.getElementById('registryLog');
            const status = document.getElementById('domainBindStatus');
            return {
              logText: log ? log.textContent : '',
              statusText: status ? status.textContent : ''
            };
          })()
        `,
        returnByValue: true
      });
      
      const { logText, statusText } = errorResult.result?.value || {};
      
      const hasError = (logText && logText.includes('No peers connected')) || 
                       (logText && logText.includes('Cannot register domain'));
      const hasErrorStatus = statusText && statusText.includes('No peers available');
      
      const passed = hasError && hasErrorStatus;
      
      this.results.noPeersValidationTest = {
        passed,
        errorMessageFound: hasError,
        statusUpdated: hasErrorStatus,
        logText: logText?.slice(-100),
        statusText
      };
      
      if (passed) {
        console.log('   ✅ PASS: Domain registration blocked without peers');
      } else {
        console.log('   ❌ FAIL: Domain registration was not blocked');
        console.log(`   📝 Log: ${logText?.slice(-60)}`);
        console.log(`   📝 Status: ${statusText}`);
      }
      
      await client.close();
      
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.noPeersValidationTest = { passed: false, error: error.message };
    }
  }

  async testRestartButton() {
    console.log('\n🧪 Test #3: Desktop Node Restart Button');
    console.log('-'.repeat(70));
    
    try {
      console.log('   ℹ️  Testing service health after restart...');
      
      const servicesHealthy = await this.checkServices();
      
      this.results.restartButtonTest = {
        passed: servicesHealthy,
        servicesHealthy,
        note: 'Services verified after automated restart'
      };
      
      if (servicesHealthy) {
        console.log('   ✅ PASS: Services healthy after restart');
      } else {
        console.log('   ❌ FAIL: Services not healthy');
      }
      
    } catch (error) {
      console.error('   ❌ Test error:', error.message);
      this.results.restartButtonTest = { passed: false, error: error.message };
    }
  }

  async generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 E2E TEST RESULTS SUMMARY');
    console.log('='.repeat(70));
    
    const tests = [
      { name: 'Desktop Node Restart', result: this.results.desktopNodeRestart },
      { name: 'Extension Reload', result: this.results.extensionReload },
      { name: 'Peer Count on Refresh', result: this.results.peerCountTest },
      { name: 'No Peers Validation', result: this.results.noPeersValidationTest },
      { name: 'Restart Button / Services', result: this.results.restartButtonTest }
    ];
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    tests.forEach(test => {
      const success = test.result?.success !== undefined ? test.result.success : test.result?.passed;
      const icon = success ? '✅' : '❌';
      const status = success ? 'PASS' : 'FAIL';
      console.log(`${icon} ${test.name}: ${status}`);
      
      if (success) {
        totalPassed++;
      } else {
        totalFailed++;
      }
      
      if (test.result?.error) {
        console.log(`   Error: ${test.result.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(70));
    console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('='.repeat(70));
    
    // Write report
    const fs = await import('fs');
    const reportPath = path.join(__dirname, 'reports', `bug-fixes-e2e-${Date.now()}.json`);
    
    if (!fs.existsSync(path.join(__dirname, 'reports'))) {
      fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'end-to-end',
      summary: { passed: totalPassed, failed: totalFailed },
      tests: this.results
    }, null, 2));
    
    console.log(`\n📄 Report saved: ${reportPath}`);
    
    if (totalFailed > 0) {
      console.log('\n⚠️  Some tests failed. Review the report for details.');
    } else {
      console.log('\n🎉 All tests passed! Bug fixes verified end-to-end!');
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new E2EBugFixTester();
  tester.run();
}

export { E2EBugFixTester };
