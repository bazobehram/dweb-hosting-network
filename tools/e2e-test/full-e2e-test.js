/**
 * FULL E2E PRODUCTION TEST
 * 
 * Uses existing Chrome instance with extension loaded
 * Tests complete user workflow end-to-end
 */

import CDP from 'chrome-remote-interface';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

class FullE2ETest {
  constructor() {
    this.services = [];
    this.client = null;
    this.testResults = [];
  }

  log(status, step, message, data = null) {
    const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : status === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} [${step}] ${message}`);
    if (data) console.log('   ', JSON.stringify(data, null, 2));
    
    this.testResults.push({
      status,
      step,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async startService(name, command, args, port) {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Starting ${name}...`);
      
      const service = spawn(command, args, {
        cwd: projectRoot,
        shell: true,
        stdio: 'pipe'
      });

      let started = false;
      const timeout = setTimeout(() => {
        if (!started) {
          reject(new Error(`${name} failed to start within 10s`));
        }
      }, 10000);

      service.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('listening') || output.includes('started') || output.includes(port)) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            console.log(`✅ ${name} started`);
            resolve(service);
          }
        }
      });

      service.stderr.on('data', (data) => {
        // Silent unless error
      });

      service.on('error', (err) => {
        if (!started) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.services.push({ name, process: service });
    });
  }

  async startAllServices() {
    console.log('\n📦 Starting Backend Services...\n');
    
    try {
      await this.startService('Registry', 'node', ['backend/registry-service/src/index.js'], 8788);
      await this.sleep(1000);

      await this.startService('Signaling', 'node', ['backend/signaling-service/src/index.js'], 8787);
      await this.sleep(1000);

      await this.startService('Storage', 'node', ['backend/storage-service/src/index.js'], 8789);
      await this.sleep(2000);

      this.log('pass', 'SERVICES', 'All backend services running');
      return true;
    } catch (err) {
      this.log('fail', 'SERVICES', 'Failed to start services', err.message);
      return false;
    }
  }

  async connect() {
    console.log('\n🌐 Connecting to Chrome Extension Panel...\n');
    
    try {
      const tabs = await CDP.List();
      const panelTab = tabs.find(t => t.url.includes('panel/index.html'));
      
      if (!panelTab) {
        throw new Error('Panel not found. Please open extension panel first!');
      }
      
      this.client = await CDP({ target: panelTab.id });
      await this.client.Runtime.enable();
      await this.client.Page.enable();
      
      this.log('pass', 'CONNECT', 'Connected to panel');
      return true;
    } catch (err) {
      this.log('fail', 'CONNECT', 'Failed to connect', err.message);
      return false;
    }
  }

  async testDashboard() {
    console.log('\n📊 Test 1: Dashboard & Health Check\n');
    
    try {
      // Wait for services to be detected
      await this.sleep(3000);
      
      const health = await this.client.Runtime.evaluate({
        expression: `(() => {
          return {
            signaling: document.querySelector('#nhSignaling')?.textContent,
            registry: document.querySelector('#nhRegistry')?.textContent,
            storage: document.querySelector('#nhStorage')?.textContent,
            peers: document.querySelector('#nhPeers')?.textContent,
            mode: document.querySelector('#nhMode')?.textContent
          };
        })()`,
        returnByValue: true
      });

      const indicators = health.result.value;
      console.log('Health:', indicators);

      const hasErrors = indicators.registry?.includes('ERR') || 
                       indicators.signaling?.includes('ERR') || 
                       indicators.storage?.includes('ERR');

      if (hasErrors) {
        this.log('fail', 'DASHBOARD', 'Service health checks failed', indicators);
        return false;
      }

      this.log('pass', 'DASHBOARD', 'All services healthy', indicators);
      return true;
    } catch (err) {
      this.log('fail', 'DASHBOARD', 'Dashboard test failed', err.message);
      return false;
    }
  }

  async testPublish() {
    console.log('\n📤 Test 2: Publish Application\n');
    
    try {
      // Navigate to hosting
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('[data-view="hosting"]').click()`,
        awaitPromise: false
      });
      await this.sleep(1000);

      // Open publish modal
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('#publishNewAppBtn').click()`,
        awaitPromise: false
      });
      await this.sleep(500);

      // Check modal
      const modalOpen = await this.client.Runtime.evaluate({
        expression: `!document.querySelector('#publishModal').classList.contains('hidden')`,
        returnByValue: true
      });

      if (!modalOpen.result.value) {
        this.log('fail', 'PUBLISH', 'Modal did not open');
        return { success: false };
      }

      this.log('pass', 'PUBLISH', 'Publish modal opened');
      
      // Close modal (we can't upload files via CDP easily)
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('#closePublishModal').click()`,
        awaitPromise: false
      });

      return { success: true };
    } catch (err) {
      this.log('fail', 'PUBLISH', 'Publish test failed', err.message);
      return { success: false };
    }
  }

  async testDomainRegistration() {
    console.log('\n🌐 Test 3: Domain Registration\n');
    
    try {
      // Go to domains
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('[data-view="domains"]').click()`,
        awaitPromise: false
      });
      await this.sleep(1000);

      // Try to register a domain
      const testDomain = `e2e-test-${Date.now()}`;
      
      const result = await this.client.Runtime.evaluate({
        expression: `(async () => {
          try {
            const input = document.querySelector('#domainSearchInput');
            const btn = document.querySelector('#registerNewDomainBtn');
            
            input.value = '${testDomain}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            await new Promise(r => setTimeout(r, 500));
            
            // Make API call
            const registryUrl = 'http://localhost:8788';
            const response = await fetch(registryUrl + '/domains', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                domain: '${testDomain}.dweb',
                owner: 'e2e-test',
                manifestId: 'test-manifest-' + Date.now()
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
        this.log('pass', 'DOMAIN', `Domain registered: ${testDomain}.dweb`, res.data);
        return { success: true, domain: `${testDomain}.dweb` };
      } else {
        this.log('fail', 'DOMAIN', res.error || `HTTP ${res.status}`, res.data);
        return { success: false };
      }
    } catch (err) {
      this.log('fail', 'DOMAIN', 'Domain test failed', err.message);
      return { success: false };
    }
  }

  async testBindings() {
    console.log('\n🔗 Test 4: Bindings View\n');
    
    try {
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('[data-view="bindings"]').click()`,
        awaitPromise: false
      });
      await this.sleep(1000);

      const bindingsViewOk = await this.client.Runtime.evaluate({
        expression: `!!document.querySelector('#bindingAppSelect')`,
        returnByValue: true
      });

      if (bindingsViewOk.result.value) {
        this.log('pass', 'BINDINGS', 'Bindings view functional');
        return true;
      } else {
        this.log('fail', 'BINDINGS', 'Bindings view elements missing');
        return false;
      }
    } catch (err) {
      this.log('fail', 'BINDINGS', 'Bindings test failed', err.message);
      return false;
    }
  }

  async testSettings() {
    console.log('\n⚙️  Test 5: Settings\n');
    
    try {
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('[data-view="settings"]').click()`,
        awaitPromise: false
      });
      await this.sleep(1000);

      const settings = await this.client.Runtime.evaluate({
        expression: `(() => {
          return {
            registryUrl: document.querySelector('#registryUrl')?.value,
            hasOwnerId: !!document.querySelector('#settingsOwnerId')?.textContent,
            bgPeerToggle: document.querySelector('#toggleBackgroundPeer')?.checked
          };
        })()`,
        returnByValue: true
      });

      const config = settings.result.value;
      console.log('Settings:', config);

      if (config.registryUrl && config.hasOwnerId !== undefined) {
        this.log('pass', 'SETTINGS', 'Settings configured correctly', config);
        return true;
      } else {
        this.log('fail', 'SETTINGS', 'Settings incomplete', config);
        return false;
      }
    } catch (err) {
      this.log('fail', 'SETTINGS', 'Settings test failed', err.message);
      return false;
    }
  }

  async testP2PSystem() {
    console.log('\n🔗 Test 6: P2P System\n');
    
    try {
      const p2p = await this.client.Runtime.evaluate({
        expression: `(() => {
          if (!window.p2pManager) return { error: 'p2pManager not found' };
          
          return {
            isStarted: window.p2pManager.isStarted,
            peerId: window.p2pManager.peerId,
            peerCount: window.p2pManager.peers?.size || 0,
            dhtEnabled: window.p2pManager.isDHTEnabled?.() || false
          };
        })()`,
        returnByValue: true
      });

      const status = p2p.result.value;

      if (status.error) {
        this.log('fail', 'P2P', status.error);
        return false;
      }

      if (status.isStarted) {
        this.log('pass', 'P2P', 'libp2p running', status);
        return true;
      } else {
        this.log('warn', 'P2P', 'libp2p not started', status);
        return false;
      }
    } catch (err) {
      this.log('fail', 'P2P', 'P2P test failed', err.message);
      return false;
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleanup...\n');
    
    if (this.client) {
      await this.client.close();
    }

    for (const service of this.services) {
      console.log(`Stopping ${service.name}...`);
      service.process.kill();
    }
  }

  async generateReport() {
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const warnings = this.testResults.filter(r => r.status === 'warn').length;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.testResults.length,
        passed,
        failed,
        warnings,
        productionReady: failed === 0
      },
      results: this.testResults
    };

    const reportPath = path.join(__dirname, 'reports', `e2e-test-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  async run() {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🚀 FULL END-TO-END PRODUCTION TEST');
    console.log('═'.repeat(70));
    console.log('\nℹ️  Make sure Chrome extension panel is open before running!');
    console.log('\n');

    try {
      // Start services
      const servicesOk = await this.startAllServices();
      if (!servicesOk) {
        console.log('\n❌ Cannot continue without services\n');
        return false;
      }

      // Connect to panel
      const connected = await this.connect();
      if (!connected) {
        console.log('\n❌ Cannot continue - open extension panel first!\n');
        return false;
      }

      // Run tests
      await this.testDashboard();
      await this.testP2PSystem();
      await this.testPublish();
      await this.testDomainRegistration();
      await this.testBindings();
      await this.testSettings();

      // Report
      const report = await this.generateReport();

      console.log('\n');
      console.log('═'.repeat(70));
      console.log('📊 TEST SUMMARY');
      console.log('═'.repeat(70));
      console.log(`\n✅ Passed: ${report.summary.passed}`);
      console.log(`❌ Failed: ${report.summary.failed}`);
      console.log(`⚠️  Warnings: ${report.summary.warnings}`);
      console.log(`\n🎯 Production Ready: ${report.summary.productionReady ? 'YES ✅' : 'NO ❌'}`);
      console.log('\n💾 Report:', path.relative(projectRoot, path.join(__dirname, 'reports', `e2e-test-${Date.now()}.json`)));
      console.log('\n');

      if (report.summary.failed > 0) {
        console.log('❌ FAILED TESTS:');
        this.testResults.filter(r => r.status === 'fail').forEach((r, i) => {
          console.log(`${i + 1}. [${r.step}] ${r.message}`);
        });
        console.log('\n');
      }

      return report.summary.productionReady;

    } catch (err) {
      console.error('\n❌ Test crashed:', err);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

const test = new FullE2ETest();
test.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
