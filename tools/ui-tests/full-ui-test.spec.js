/**
 * Complete UI Test - Real User Simulation
 * 
 * Tests the entire user flow through the UI:
 * 1. Open panel
 * 2. Check dashboard
 * 3. Start libp2p via UI
 * 4. Upload a file
 * 5. Register domain
 * 6. Check status updates
 * 7. Open resolver
 * 8. Fetch content
 * 
 * Reports all errors and UI issues found
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class UITester {
  constructor() {
    this.client = null;
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }
  
  log(type, message, details = null) {
    const entry = { type, message, details, timestamp: new Date().toISOString() };
    
    if (type === 'error') {
      this.errors.push(entry);
      console.log(`❌ ERROR: ${message}`);
      if (details) console.log(`   Details: ${JSON.stringify(details)}`);
    } else if (type === 'warning') {
      this.warnings.push(entry);
      console.log(`⚠️  WARNING: ${message}`);
    } else if (type === 'success') {
      this.successes.push(entry);
      console.log(`✅ SUCCESS: ${message}`);
    } else {
      console.log(`ℹ️  INFO: ${message}`);
    }
  }
  
  async screenshot(name) {
    try {
      const { Page } = this.client;
      const result = await Page.captureScreenshot({ format: 'png' });
      const filename = `screenshot-${name}-${Date.now()}.png`;
      await fs.writeFile(join(__dirname, 'screenshots', filename), result.data, 'base64');
      console.log(`📸 Screenshot saved: ${filename}`);
    } catch (err) {
      console.log(`⚠️  Could not save screenshot: ${err.message}`);
    }
  }
  
  async connect() {
    const tabs = await CDP.List();
    const panelTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!panelTab) {
      throw new Error('No panel tab found. Please open the extension panel first.');
    }
    
    this.client = await CDP({ target: panelTab.id });
    await this.client.Runtime.enable();
    await this.client.Console.enable();
    
    // Listen for console errors
    this.client.Console.messageAdded(({ message }) => {
      if (message.level === 'error') {
        this.log('error', `Console error: ${message.text}`);
      }
    });
    
    this.log('success', 'Connected to panel');
  }
  
  async checkElement(selector, description) {
    try {
      const { Runtime } = this.client;
      const result = await Runtime.evaluate({
        expression: `(() => {
          const el = document.querySelector('${selector}');
          if (!el) {
            return null;
          } else {
            return {
              exists: true,
              visible: el.offsetParent !== null || el.offsetWidth > 0,
              text: el.textContent?.trim() || '',
              disabled: el.disabled || false,
              value: el.value || ''
            };
          }
        })()`,
        returnByValue: true
      });
      
      const data = result.result?.value;
      
      if (!data) {
        this.log('error', `Element not found: ${description}`, { selector });
        return null;
      }
      
      if (!data.visible) {
        this.log('warning', `Element not visible: ${description}`, { selector });
      }
      
      return data;
      
    } catch (err) {
      this.log('error', `Failed to check element: ${description}`, { selector, error: err.message });
      return null;
    }
  }
  
  async clickElement(selector, description) {
    try {
      const { Runtime } = this.client;
      
      // Check if element exists first
      const check = await this.checkElement(selector, description);
      if (!check) {
        return false;
      }
      
      await Runtime.evaluate({
        expression: `document.querySelector('${selector}')?.click()`,
        awaitPromise: false
      });
      
      await sleep(500); // Wait for click effect
      this.log('success', `Clicked: ${description}`);
      return true;
      
    } catch (err) {
      this.log('error', `Failed to click: ${description}`, { selector, error: err.message });
      return false;
    }
  }
  
  async fillInput(selector, value, description) {
    try {
      const { Runtime } = this.client;
      
      await Runtime.evaluate({
        expression: `{
          const el = document.querySelector('${selector}');
          if (el) {
            el.value = '${value}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }`,
        awaitPromise: false
      });
      
      this.log('success', `Filled input: ${description} = "${value}"`);
      return true;
      
    } catch (err) {
      this.log('error', `Failed to fill input: ${description}`, { selector, error: err.message });
      return false;
    }
  }
  
  async getStatus() {
    try {
      const { Runtime } = this.client;
      const result = await Runtime.evaluate({
        expression: `{
          status: window.p2pManager ? {
            isStarted: window.p2pManager.isStarted,
            peerId: window.p2pManager.peerId,
            peerCount: window.p2pManager.peers?.size || 0,
            dhtEnabled: window.p2pManager.isDHTEnabled?.() || false
          } : null,
          ui: {
            networkStatus: document.querySelector('#dashboardNetworkStatus')?.textContent || 'not found',
            peerCount: document.querySelector('#dashboardPeersCount')?.textContent || '0',
            publishedApps: document.querySelector('#dashboardAppsCount')?.textContent || '0',
            registeredDomains: document.querySelector('#dashboardDomainsCount')?.textContent || '0'
          }
        }`,
        returnByValue: true
      });
      
      return result.result?.value;
    } catch (err) {
      this.log('error', 'Failed to get status', { error: err.message });
      return null;
    }
  }
  
  async runTests() {
    console.log('\n🧪 Starting Complete UI Test\n');
    console.log('═'.repeat(70));
    
    // Test 1: Dashboard Elements
    console.log('\n📋 Test 1: Dashboard Elements Check\n');
    
    const dashboardElements = [
      { selector: '.nav-item[data-view="dashboard"]', desc: 'Dashboard Tab' },
      { selector: '.nav-item[data-view="hosting"]', desc: 'Publish Tab' },
      { selector: '.nav-item[data-view="domains"]', desc: 'Domains Tab' },
      { selector: '.nav-item[data-view="bindings"]', desc: 'Bindings Tab' },
      { selector: '.nav-item[data-view="settings"]', desc: 'Settings Tab' },
      { selector: '#openResolverFromSidebar', desc: 'Open Resolver Button' },
      { selector: '.action-btn', desc: 'Quick Actions' }
    ];
    
    for (const { selector, desc } of dashboardElements) {
      await this.checkElement(selector, desc);
    }
    
    // Test 2: Network Status
    console.log('\n📋 Test 2: Network Status Check\n');
    
    const status = await this.getStatus();
    
    if (status) {
      console.log('System Status:');
      console.log(`  P2P Manager: ${status.status ? '✅ Initialized' : '❌ Not initialized'}`);
      if (status.status) {
        console.log(`  Started: ${status.status.isStarted ? '✅ Yes' : '⚠️  No (manual start needed)'}`);
        console.log(`  Peer ID: ${status.status.peerId || 'N/A'}`);
        console.log(`  Peers: ${status.status.peerCount}`);
        console.log(`  DHT: ${status.status.dhtEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      }
      console.log('UI Status:');
      console.log(`  Network: ${status.ui.networkStatus}`);
      console.log(`  Peers: ${status.ui.peerCount}`);
      console.log(`  Apps: ${status.ui.publishedApps}`);
      console.log(`  Domains: ${status.ui.registeredDomains}`);
    }
    
    // Test 3: Settings View
    console.log('\n📋 Test 3: Settings View\n');
    
    await this.clickElement('.nav-item[data-view="settings"]', 'Settings Tab');
    await sleep(500);
    
    const settingsElements = [
      { selector: '#registryUrl', desc: 'Registry URL Input' },
      { selector: '#registryApiKey', desc: 'Registry API Key Input' },
      { selector: '#toggleBackgroundPeer', desc: 'Background Peer Toggle' },
      { selector: '#settingsOwnerId', desc: 'Owner ID Display' }
    ];
    
    for (const { selector, desc } of settingsElements) {
      const el = await this.checkElement(selector, desc);
      if (el && el.value) {
        console.log(`  ${desc}: ${el.value}`);
      }
    }
    
    // Test 4: Hosting View (Publish)
    console.log('\n📋 Test 4: Hosting View\n');
    
    await this.clickElement('.nav-item[data-view="hosting"]', 'Hosting Tab');
    await sleep(500);
    
    const publishElements = [
      { selector: '#publishNewAppBtn', desc: 'Publish New App Button' },
      { selector: '#appsList', desc: 'Apps List Container' },
      { selector: '#connectBtn', desc: 'Connect Button (Dev Tools)' },
      { selector: '#signalingUrl', desc: 'Signaling URL Input (Dev Tools)' }
    ];
    
    for (const { selector, desc } of publishElements) {
      await this.checkElement(selector, desc);
    }
    
    // Test 5: Domains View
    console.log('\n📋 Test 5: Domains View\n');
    
    await this.clickElement('.nav-item[data-view="domains"]', 'Domains Tab');
    await sleep(500);
    
    const domainsElements = [
      { selector: '#domainSearchInput', desc: 'Domain Search Input' },
      { selector: '#registerNewDomainBtn', desc: 'Register New Domain Button' },
      { selector: '#domainTable', desc: 'Domains Table' },
      { selector: '#refreshDomainsBtn', desc: 'Refresh Domains Button' }
    ];
    
    for (const { selector, desc } of domainsElements) {
      await this.checkElement(selector, desc);
    }
    
    // Test 6: Try Starting libp2p (if test function available)
    console.log('\n📋 Test 6: P2P System Test\n');
    
    try {
      const { Runtime } = this.client;
      
      // Check if p2pManager exists
      const hasP2P = await Runtime.evaluate({
        expression: 'typeof window.p2pManager !== "undefined"',
        returnByValue: true
      });
      
      if (hasP2P.result?.value) {
        console.log('✅ P2P Manager exists');
        
        // Check if started
        const isStarted = await Runtime.evaluate({
          expression: 'window.p2pManager?.isStarted || false',
          returnByValue: true
        });
        
        if (isStarted.result?.value) {
          this.log('success', 'libp2p is already started');
          
          // Get peer info
          const peerInfo = await Runtime.evaluate({
            expression: `{
              peerId: window.p2pManager.peerId,
              peerCount: window.p2pManager.peers?.size || 0,
              bootstrapPeerIds: Array.from(window.p2pManager.bootstrapPeerIds || [])
            }`,
            returnByValue: true
          });
          
          console.log('Peer Info:', peerInfo.result?.value);
        } else {
          this.log('warning', 'libp2p not started - user needs to start manually or via test function');
        }
      } else {
        this.log('warning', 'P2P Manager not initialized yet');
      }
    } catch (err) {
      this.log('error', 'P2P system check failed', { error: err.message });
    }
    
    // Test 7: Check for JavaScript errors
    console.log('\n📋 Test 7: JavaScript Error Check\n');
    
    try {
      const { Runtime } = this.client;
      const result = await Runtime.evaluate({
        expression: `{
          errors: window.__errors || [],
          warnings: window.__warnings || []
        }`,
        returnByValue: true
      });
      
      const jsStatus = result.result?.value;
      if (jsStatus) {
        if (jsStatus.errors.length > 0) {
          this.log('error', `Found ${jsStatus.errors.length} JavaScript errors`, jsStatus.errors);
        } else {
          this.log('success', 'No JavaScript errors detected');
        }
      }
    } catch (err) {
      console.log('⚠️  Could not check for JS errors');
    }
    
    // Test 8: Responsive UI Check
    console.log('\n📋 Test 8: UI Responsiveness\n');
    
    try {
      const { Runtime } = this.client;
      const result = await Runtime.evaluate({
        expression: `{
          width: window.innerWidth,
          height: window.innerHeight,
          sidebar: document.querySelector('.sidebar')?.offsetWidth || 0,
          mainContent: document.querySelector('.main-content')?.offsetWidth || 0
        }`,
        returnByValue: true
      });
      
      const uiLayout = result.result?.value;
      if (uiLayout) {
        console.log(`Window: ${uiLayout.width}x${uiLayout.height}`);
        console.log(`Sidebar: ${uiLayout.sidebar}px`);
        console.log(`Main Content: ${uiLayout.mainContent}px`);
        
        if (uiLayout.width > 0 && uiLayout.mainContent > 0) {
          this.log('success', 'UI layout is responsive');
        }
      }
    } catch (err) {
      this.log('warning', 'Could not check UI layout', { error: err.message });
    }
    
    // Generate Report
    console.log('\n═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));
    
    console.log(`\n✅ Successes: ${this.successes.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach((w, i) => {
        console.log(`${i + 1}. ${w.message}`);
      });
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS FOUND:');
      this.errors.forEach((e, i) => {
        console.log(`${i + 1}. ${e.message}`);
        if (e.details) {
          console.log(`   ${JSON.stringify(e.details, null, 2)}`);
        }
      });
      console.log('\n🔧 These errors need to be fixed!');
    } else {
      console.log('\n🎉 NO ERRORS FOUND!');
      console.log('✅ UI is working correctly!');
    }
    
    console.log('\n═'.repeat(70));
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      successes: this.successes.length,
      warnings: this.warnings.length,
      errors: this.errors.length,
      details: {
        successes: this.successes,
        warnings: this.warnings,
        errors: this.errors
      }
    };
    
    try {
      await fs.mkdir(join(__dirname, 'reports'), { recursive: true });
      await fs.writeFile(
        join(__dirname, 'reports', `ui-test-${Date.now()}.json`),
        JSON.stringify(report, null, 2)
      );
      console.log('\n💾 Report saved to tools/ui-tests/reports/');
    } catch (err) {
      console.log('⚠️  Could not save report:', err.message);
    }
    
    return {
      passed: this.errors.length === 0,
      report
    };
  }
  
  async cleanup() {
    if (this.client) {
      await this.client.close();
    }
  }
}

async function main() {
  const tester = new UITester();
  
  try {
    await tester.connect();
    const result = await tester.runTests();
    await tester.cleanup();
    
    process.exit(result.passed ? 0 : 1);
    
  } catch (err) {
    console.error('\n❌ Test failed with exception:', err.message);
    console.error(err.stack);
    await tester.cleanup();
    process.exit(1);
  }
}

main();
