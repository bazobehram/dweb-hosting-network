/**
 * Functional UI Test - Real Interactions
 * 
 * Tests actual functionality:
 * 1. Check registry connectivity
 * 2. Try to register a domain
 * 3. Try to publish an app
 * 4. Check error handling
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class FunctionalTester {
  constructor() {
    this.client = null;
    this.testResults = [];
  }
  
  log(status, test, message, details = null) {
    const result = { status, test, message, details, timestamp: new Date().toISOString() };
    this.testResults.push(result);
    
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${test}: ${message}`);
    if (details) {
      console.log(`   ${JSON.stringify(details, null, 2)}`);
    }
  }
  
  async connect() {
    const tabs = await CDP.List();
    const panelTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!panelTab) {
      throw new Error('No panel tab found');
    }
    
    this.client = await CDP({ target: panelTab.id });
    await this.client.Runtime.enable();
    await this.client.Console.enable();
    await this.client.Network.enable();
    
    console.log('✅ Connected to panel\n');
  }
  
  async testRegistryConnection() {
    console.log('📡 Test 1: Registry API Connection\n');
    
    try {
      const { Runtime } = this.client;
      
      // Get registry URL from settings
      const configResult = await Runtime.evaluate({
        expression: `({
          registryUrl: document.querySelector('#registryUrl')?.value,
          registryApiKey: document.querySelector('#registryApiKey')?.value
        })`,
        returnByValue: true
      });
      
      const config = configResult.result.value;
      console.log(`Registry URL: ${config.registryUrl}`);
      
      // Try to fetch domains list
      const testResult = await Runtime.evaluate({
        expression: `(async () => {
          try {
            const url = '${config.registryUrl}';
            const apiKey = '${config.registryApiKey}';
            
            const response = await fetch(url + '/domains', {
              headers: apiKey ? { 'x-api-key': apiKey } : {}
            });
            
            return {
              success: response.ok,
              status: response.status,
              statusText: response.statusText,
              data: response.ok ? await response.json() : await response.text()
            };
          } catch (err) {
            return {
              success: false,
              error: err.message
            };
          }
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      
      const result = testResult.result.value;
      
      if (result.success) {
        this.log('pass', 'Registry Connection', `Registry is reachable (${result.status})`, result.data);
      } else {
        this.log('fail', 'Registry Connection', result.error || `HTTP ${result.status}: ${result.statusText}`, result.data);
      }
      
      return result.success;
      
    } catch (err) {
      this.log('fail', 'Registry Connection', 'Exception during test', err.message);
      return false;
    }
  }
  
  async testDomainRegistration() {
    console.log('\n🌐 Test 2: Domain Registration Flow\n');
    
    try {
      const { Runtime } = this.client;
      
      // Navigate to Domains view
      await Runtime.evaluate({
        expression: `document.querySelector('.nav-item[data-view="domains"]')?.click()`,
        awaitPromise: false
      });
      
      await sleep(500);
      
      // Try to register a test domain
      const testDomain = `test-${Date.now()}`;
      
      const result = await Runtime.evaluate({
        expression: `(async () => {
          try {
            const input = document.querySelector('#domainSearchInput');
            const btn = document.querySelector('#registerNewDomainBtn');
            
            if (!input || !btn) {
              return { success: false, error: 'UI elements not found' };
            }
            
            input.value = '${testDomain}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Check if button gets enabled
            await new Promise(r => setTimeout(r, 500));
            
            // Simulate the registration API call
            const registryUrl = document.querySelector('#registryUrl')?.value || 'http://localhost:8788';
            const apiKey = document.querySelector('#registryApiKey')?.value;
            
            const response = await fetch(registryUrl + '/domains', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-api-key': apiKey } : {})
              },
              body: JSON.stringify({
                domain: '${testDomain}.dweb',
                owner: 'test-owner',
                manifestId: 'test-manifest-123'
              })
            });
            
            return {
              success: response.ok,
              status: response.status,
              data: response.ok ? await response.json() : await response.text()
            };
            
          } catch (err) {
            return { success: false, error: err.message };
          }
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      
      const res = result.result.value;
      
      if (res.success) {
        this.log('pass', 'Domain Registration', `Successfully registered ${testDomain}.dweb`, res.data);
      } else {
        this.log('fail', 'Domain Registration', res.error || `HTTP ${res.status}`, res.data);
      }
      
      return res.success;
      
    } catch (err) {
      this.log('fail', 'Domain Registration', 'Exception during test', err.message);
      return false;
    }
  }
  
  async testPublishFlow() {
    console.log('\n📤 Test 3: Publish Application Flow\n');
    
    try {
      const { Runtime } = this.client;
      
      // Navigate to Publish view
      await Runtime.evaluate({
        expression: `document.querySelector('.nav-item[data-view="hosting"]')?.click()`,
        awaitPromise: false
      });
      
      await sleep(500);
      
      // Check if publish button exists and is clickable
      const result = await Runtime.evaluate({
        expression: `(() => {
          const btn = document.querySelector('#publishNewAppBtn');
          
          if (!btn) {
            return { success: false, error: 'Publish button not found' };
          }
          
          // Check if modal opens
          btn.click();
          
          setTimeout(() => {
            const modal = document.querySelector('#publishModal');
            const visible = modal && !modal.classList.contains('hidden');
            return { success: visible, modalVisible: visible };
          }, 100);
          
          return { success: true, buttonExists: true };
        })()`,
        returnByValue: true
      });
      
      await sleep(500);
      
      // Check modal state
      const modalCheck = await Runtime.evaluate({
        expression: `(() => {
          const modal = document.querySelector('#publishModal');
          const step1 = document.querySelector('#publishStep1');
          
          return {
            modalExists: !!modal,
            modalVisible: modal && !modal.classList.contains('hidden'),
            step1Active: step1 && step1.classList.contains('active')
          };
        })()`,
        returnByValue: true
      });
      
      const modalState = modalCheck.result.value;
      
      if (modalState.modalVisible) {
        this.log('pass', 'Publish Flow', 'Publish modal opens correctly', modalState);
        
        // Close modal
        await Runtime.evaluate({
          expression: `document.querySelector('#closePublishModal')?.click()`,
          awaitPromise: false
        });
        
        return true;
      } else {
        this.log('fail', 'Publish Flow', 'Publish modal did not open', modalState);
        return false;
      }
      
    } catch (err) {
      this.log('fail', 'Publish Flow', 'Exception during test', err.message);
      return false;
    }
  }
  
  async testP2PSystem() {
    console.log('\n🔗 Test 4: P2P System Status\n');
    
    try {
      const { Runtime } = this.client;
      
      const result = await Runtime.evaluate({
        expression: `(() => {
          if (!window.p2pManager) {
            return { success: false, error: 'p2pManager not initialized' };
          }
          
          return {
            success: true,
            isStarted: window.p2pManager.isStarted,
            peerId: window.p2pManager.peerId,
            peerCount: window.p2pManager.peers?.size || 0,
            dhtEnabled: window.p2pManager.isDHTEnabled?.() || false,
            hasProtocols: window.p2pManager.node?.getProtocols?.()?.length > 0
          };
        })()`,
        returnByValue: true
      });
      
      const status = result.result.value;
      
      if (status.success && status.isStarted) {
        this.log('pass', 'P2P System', 'libp2p is running', status);
      } else if (status.success) {
        this.log('warn', 'P2P System', 'libp2p initialized but not started', status);
      } else {
        this.log('fail', 'P2P System', status.error);
      }
      
      return status.success;
      
    } catch (err) {
      this.log('fail', 'P2P System', 'Exception during test', err.message);
      return false;
    }
  }
  
  async testNetworkHealthIndicators() {
    console.log('\n📊 Test 5: Network Health Indicators\n');
    
    try {
      const { Runtime } = this.client;
      
      const result = await Runtime.evaluate({
        expression: `(() => {
          const indicators = {
            mode: document.querySelector('#nhMode')?.textContent,
            peers: document.querySelector('#nhPeers')?.textContent,
            channel: document.querySelector('#nhChannel')?.textContent,
            signaling: document.querySelector('#nhSignaling')?.textContent,
            registry: document.querySelector('#nhRegistry')?.textContent,
            storage: document.querySelector('#nhStorage')?.textContent
          };
          
          // Check for error states
          const errors = [];
          if (indicators.signaling?.includes('ERR')) errors.push('Signaling');
          if (indicators.registry?.includes('ERR')) errors.push('Registry');
          if (indicators.storage?.includes('ERR')) errors.push('Storage');
          
          return {
            indicators,
            hasErrors: errors.length > 0,
            errors
          };
        })()`,
        returnByValue: true
      });
      
      const health = result.result.value;
      
      console.log('Network Health:', health.indicators);
      
      if (!health.hasErrors) {
        this.log('pass', 'Network Health', 'All services are healthy', health.indicators);
      } else {
        this.log('fail', 'Network Health', `Errors detected: ${health.errors.join(', ')}`, health.indicators);
      }
      
      return !health.hasErrors;
      
    } catch (err) {
      this.log('fail', 'Network Health', 'Exception during test', err.message);
      return false;
    }
  }
  
  async runAllTests() {
    console.log('🧪 Starting Functional UI Tests\n');
    console.log('═'.repeat(70) + '\n');
    
    const tests = [
      () => this.testRegistryConnection(),
      () => this.testNetworkHealthIndicators(),
      () => this.testP2PSystem(),
      () => this.testPublishFlow(),
      () => this.testDomainRegistration()
    ];
    
    for (const test of tests) {
      await test();
    }
    
    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 FUNCTIONAL TEST SUMMARY');
    console.log('═'.repeat(70) + '\n');
    
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const warnings = this.testResults.filter(r => r.status === 'warn').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    
    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'fail').forEach((r, i) => {
        console.log(`${i + 1}. ${r.test}: ${r.message}`);
      });
    }
    
    // Save report
    try {
      await fs.mkdir(join(__dirname, 'reports'), { recursive: true });
      await fs.writeFile(
        join(__dirname, 'reports', `functional-test-${Date.now()}.json`),
        JSON.stringify({ passed, failed, warnings, results: this.testResults }, null, 2)
      );
      console.log('\n💾 Report saved to tools/ui-tests/reports/');
    } catch (err) {
      console.log('⚠️  Could not save report');
    }
    
    return failed === 0;
  }
  
  async cleanup() {
    if (this.client) {
      await this.client.close();
    }
  }
}

async function main() {
  const tester = new FunctionalTester();
  
  try {
    await tester.connect();
    const success = await tester.runAllTests();
    await tester.cleanup();
    
    process.exit(success ? 0 : 1);
    
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    await tester.cleanup();
    process.exit(1);
  }
}

main();
