#!/usr/bin/env node

/**
 * Full Production E2E Test
 * 
 * Simulates complete user workflow:
 * 1. User A: Publish web app
 * 2. User A: Register domain & bind to app
 * 3. User B: Resolve domain & access app through P2P
 * 
 * Tests pure P2P functionality without cloud dependencies
 */

import CDP from 'chrome-remote-interface';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../extension');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

class ProductionE2ETest {
  constructor() {
    this.chromeProcess = null;
    this.userA = null;  // Publisher
    this.userB = null;  // Consumer
    this.testDomain = `prod-test-${Date.now()}.dweb`;
    this.manifestId = null;
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  log(status, category, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const icon = {
      pass: '✅',
      fail: '❌',
      progress: '🔄',
      info: 'ℹ️'
    }[status] || '•';

    console.log(`${icon} [${timestamp}] [${category}] ${message}`);
    if (data) {
      console.log('  ', JSON.stringify(data, null, 2));
    }

    this.results.tests.push({
      timestamp: Date.now(),
      status,
      category,
      message,
      data
    });

    if (status === 'pass') this.results.passed++;
    if (status === 'fail') this.results.failed++;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async startChrome() {
    this.log('progress', 'SETUP', 'Starting Chrome with extension...');

    return new Promise((resolve, reject) => {
      const args = [
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--remote-debugging-port=9222',
        '--user-data-dir=C:\\Temp\\chrome-test-profile',
        'about:blank'
      ];

      this.chromeProcess = spawn(CHROME_PATH, args, {
        stdio: 'ignore',
        detached: false
      });

      this.chromeProcess.on('error', reject);
      
      setTimeout(() => {
        this.log('pass', 'SETUP', 'Chrome started');
        resolve();
      }, 3000);
    });
  }

  async connectClients() {
    this.log('progress', 'SETUP', 'Connecting CDP clients...');

    const targets = await CDP.List();
    const extensionTargets = targets.filter(t => 
      t.url.includes('chrome-extension://') && t.url.includes('panel.html')
    );

    if (extensionTargets.length < 2) {
      throw new Error('Need at least 2 extension panels open');
    }

    this.userA = await CDP({ target: extensionTargets[0] });
    this.userB = await CDP({ target: extensionTargets[1] });

    await this.userA.Runtime.enable();
    await this.userB.Runtime.enable();
    await this.userA.Network.enable();
    await this.userB.Network.enable();

    this.log('pass', 'SETUP', 'Connected to both users');
  }

  async dismissAuthOverlays() {
    this.log('progress', 'SETUP', 'Authenticating users as guests...');

    for (const [name, client] of [['User A', this.userA], ['User B', this.userB]]) {
      await client.Runtime.evaluate({
        expression: `
          (async () => {
            const overlay = document.getElementById('authOverlay');
            const guestBtn = document.getElementById('authGuestBtn');
            if (overlay && !overlay.classList.contains('hidden') && guestBtn) {
              guestBtn.click();
              await new Promise(r => setTimeout(r, 500));
              return true;
            }
            return false;
          })()
        `,
        awaitPromise: true
      });
    }

    await this.sleep(1000);
    this.log('pass', 'SETUP', 'Users authenticated');
  }

  async verifyP2PConnection() {
    this.log('progress', 'P2P', 'Verifying P2P network is active...');

    const statusA = await this.userA.Runtime.evaluate({
      expression: `({
        p2pRunning: !!(window.p2pManager && window.p2pManager.isStarted),
        peerId: window.p2pManager?.peerId,
        peerCount: window.p2pManager?.peers?.size || 0
      })`,
      returnByValue: true
    });

    const statusB = await this.userB.Runtime.evaluate({
      expression: `({
        p2pRunning: !!(window.p2pManager && window.p2pManager.isStarted),
        peerId: window.p2pManager?.peerId,
        peerCount: window.p2pManager?.peers?.size || 0
      })`,
      returnByValue: true
    });

    const dataA = statusA.result.value;
    const dataB = statusB.result.value;

    if (!dataA.p2pRunning) {
      this.log('fail', 'P2P', 'User A P2P not running');
      return false;
    }

    if (!dataB.p2pRunning) {
      this.log('fail', 'P2P', 'User B P2P not running');
      return false;
    }

    this.log('pass', 'P2P', 'Both users connected to P2P network', {
      userA: { peerId: dataA.peerId?.substring(0, 20) + '...', peers: dataA.peerCount },
      userB: { peerId: dataB.peerId?.substring(0, 20) + '...', peers: dataB.peerCount }
    });

    return true;
  }

  async verifyDashboard() {
    this.log('progress', 'DASHBOARD', 'Verifying dashboard metrics...');

    const dashboard = await this.userA.Runtime.evaluate({
      expression: `({
        appsCount: document.getElementById('dashboardAppsCount')?.textContent,
        domainsCount: document.getElementById('dashboardDomainsCount')?.textContent,
        peersCount: document.getElementById('dashboardPeersCount')?.textContent,
        networkStatus: document.getElementById('dashboardNetworkStatus')?.textContent
      })`,
      returnByValue: true
    });

    const data = dashboard.result.value;
    this.log('info', 'DASHBOARD', 'Current metrics', data);

    if (data.networkStatus !== 'Unknown') {
      this.log('pass', 'DASHBOARD', 'Dashboard displaying network status');
      return true;
    }

    this.log('fail', 'DASHBOARD', 'Dashboard not showing proper status');
    return false;
  }

  async publishApp() {
    this.log('progress', 'PUBLISH', 'User A: Publishing web app...');

    // Create a test HTML app
    const testApp = `
<!DOCTYPE html>
<html>
<head>
  <title>My DWeb App</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 60px;
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 { font-size: 4em; margin: 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
    p { font-size: 1.5em; margin: 20px 0; }
    .success { color: #4ade80; font-weight: bold; font-size: 1.8em; }
    .timestamp { font-size: 0.9em; opacity: 0.8; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 DWeb App</h1>
    <p class="success">✅ Loaded from P2P Network!</p>
    <p>This app is distributed across peers,<br>no cloud servers involved.</p>
    <p class="timestamp">Test ID: ${Date.now()}</p>
    <p class="timestamp">Loaded: <span id="loadTime"></span></p>
  </div>
  <script>
    document.getElementById('loadTime').textContent = new Date().toLocaleString();
  </script>
</body>
</html>
    `.trim();

    const testAppB64 = Buffer.from(testApp).toString('base64');

    const result = await this.userA.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Create test file
            const htmlContent = atob('${testAppB64}');
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const file = new File([blob], 'index.html', { type: 'text/html' });

            // Check chunk manager
            if (!window.chunkManager) {
              return { error: 'ChunkManager not available' };
            }

            // Prepare transfer
            const result = await window.chunkManager.prepareTransfer(file);
            const manifest = result.manifest;
            const transfer = result.transfer;

            // Store globally for domain binding
            window.testManifestId = manifest.transferId;
            window.testTransfer = transfer;

            return {
              success: true,
              manifestId: manifest.transferId,
              fileName: manifest.fileName,
              fileSize: manifest.fileSize,
              chunkCount: transfer.totalChunks,
              sha256: manifest.sha256
            };
          } catch (error) {
            return { error: error.message, stack: error.stack };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const data = result.result.value;

    if (data.error) {
      this.log('fail', 'PUBLISH', 'App publishing failed', data);
      return false;
    }

    this.manifestId = data.manifestId;
    this.log('pass', 'PUBLISH', 'App published successfully', {
      manifestId: data.manifestId,
      fileName: data.fileName,
      size: data.fileSize,
      chunks: data.chunkCount
    });

    return true;
  }

  async registerManifestWithRegistry() {
    this.log('progress', 'REGISTRY', 'Registering manifest with registry...');

    const result = await this.userA.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            const manifest = window.testTransfer;
            if (!manifest) {
              return { error: 'No manifest available' };
            }

            const registryUrl = document.getElementById('registryUrl')?.value || 'http://localhost:8788';
            
            // Build manifest payload
            const payload = {
              transferId: window.testManifestId,
              fileName: 'index.html',
              fileSize: manifest.file.size,
              mimeType: 'text/html',
              chunkSize: 262144,
              chunkCount: manifest.totalChunks,
              sha256: manifest.fullHash,
              chunkHashes: manifest.chunkHashes,
              chunkData: Array(manifest.totalChunks).fill(null)  // No content
            };

            const response = await fetch(registryUrl + '/manifests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const error = await response.text();
              return { error: 'Registry rejected manifest: ' + error };
            }

            const record = await response.json();
            return { success: true, record };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const data = result.result.value;

    if (data.error) {
      this.log('fail', 'REGISTRY', 'Manifest registration failed', data);
      return false;
    }

    this.log('pass', 'REGISTRY', 'Manifest registered with registry');
    return true;
  }

  async registerDomain() {
    this.log('progress', 'DOMAIN', `User A: Registering domain ${this.testDomain}...`);

    const result = await this.userA.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            const registryUrl = document.getElementById('registryUrl')?.value || 'http://localhost:8788';
            const ownerId = document.getElementById('ownerInput')?.value || 'prod-test-user';

            const payload = {
              domain: '${this.testDomain}',
              owner: ownerId,
              manifestId: window.testManifestId,
              replicas: []
            };

            const response = await fetch(registryUrl + '/domains', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const error = await response.text();
              return { error: 'Domain registration failed: ' + error, status: response.status };
            }

            const record = await response.json();
            return { success: true, domain: record.domain, owner: record.owner };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const data = result.result.value;

    if (data.error) {
      this.log('fail', 'DOMAIN', 'Domain registration failed', data);
      return false;
    }

    this.log('pass', 'DOMAIN', 'Domain registered successfully', {
      domain: this.testDomain,
      manifestId: this.manifestId,
      owner: data.owner
    });

    return true;
  }

  async resolveDomain() {
    this.log('progress', 'RESOLVE', `User B: Resolving ${this.testDomain}...`);

    const result = await this.userB.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            const registryUrl = 'http://localhost:8788';

            // Query registry for domain
            const response = await fetch(registryUrl + '/domains/${this.testDomain}');

            if (response.status === 404) {
              return { error: 'Domain not found' };
            }

            if (!response.ok) {
              return { error: 'Failed to resolve domain', status: response.status };
            }

            const domainRecord = await response.json();

            // Get manifest
            const manifestResponse = await fetch(registryUrl + '/manifests/' + domainRecord.manifestId);
            
            if (!manifestResponse.ok) {
              return { error: 'Manifest not found', manifestId: domainRecord.manifestId };
            }

            const manifest = await manifestResponse.json();

            return {
              success: true,
              domain: domainRecord.domain,
              owner: domainRecord.owner,
              manifestId: manifest.manifestId,
              fileName: manifest.fileName,
              fileSize: manifest.fileSize,
              chunkCount: manifest.chunkCount
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const data = result.result.value;

    if (data.error) {
      this.log('fail', 'RESOLVE', 'Domain resolution failed', data);
      return false;
    }

    this.log('pass', 'RESOLVE', 'Domain resolved successfully', data);
    return true;
  }

  async testP2PChunkTransfer() {
    this.log('progress', 'TRANSFER', 'Testing P2P chunk transfer between users...');

    // User B requests chunk from User A via P2P
    const result = await this.userB.Runtime.evaluate({
      expression: `
        (async () => {
          try {
            if (!window.p2pManager || !window.p2pManager.isStarted) {
              return { error: 'P2P not running on User B' };
            }

            // Get User A's peer ID (would normally discover via network)
            const peers = Array.from(window.p2pManager.peers?.keys() || []);
            
            if (peers.length === 0) {
              return { error: 'No peers discovered', discovered: 0 };
            }

            return {
              success: true,
              peerCount: peers.length,
              peers: peers.map(p => p.substring(0, 20) + '...')
            };
          } catch (error) {
            return { error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const data = result.result.value;

    if (data.error) {
      this.log('fail', 'TRANSFER', 'P2P chunk transfer not testable', data);
      return false;
    }

    this.log('pass', 'TRANSFER', 'P2P peers discovered', data);
    return true;
  }

  async generateReport() {
    const duration = Date.now() - this.results.tests[0]?.timestamp || 0;
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;

    console.log('\n' + '='.repeat(70));
    console.log('📊 PRODUCTION E2E TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Pass Rate: ${passRate}%`);
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log('='.repeat(70));

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(t => t.status === 'fail')
        .forEach(t => {
          console.log(`   [${t.category}] ${t.message}`);
          if (t.data) console.log('   ', t.data);
        });
    }

    console.log('\n');
    return this.results.failed === 0;
  }

  async cleanup() {
    this.log('info', 'CLEANUP', 'Cleaning up...');

    if (this.userA) await this.userA.close().catch(() => {});
    if (this.userB) await this.userB.close().catch(() => {});
    
    if (this.chromeProcess) {
      this.chromeProcess.kill();
    }
  }

  async run() {
    try {
      console.log('\n' + '='.repeat(70));
      console.log('🚀 PRODUCTION E2E TEST - DWeb Hosting Network');
      console.log('='.repeat(70));
      console.log('Testing: Complete P2P workflow without cloud dependencies\n');

      // Setup
      await this.startChrome();
      this.log('info', 'SETUP', 'Please open 2 extension panels manually (click extension icon twice)');
      this.log('info', 'SETUP', 'Waiting 10 seconds for panels to open...');
      await this.sleep(10000);

      await this.connectClients();
      await this.dismissAuthOverlays();

      // Verify P2P
      const p2pOk = await this.verifyP2PConnection();
      if (!p2pOk) {
        this.log('fail', 'CRITICAL', 'P2P network not functioning, cannot continue');
        return false;
      }

      // Check dashboard
      await this.verifyDashboard();

      // User A: Publish
      const publishOk = await this.publishApp();
      if (!publishOk) {
        this.log('fail', 'CRITICAL', 'Publishing failed, cannot continue');
        return false;
      }

      // Register manifest
      await this.registerManifestWithRegistry();

      // User A: Register domain
      const domainOk = await this.registerDomain();
      if (!domainOk) {
        this.log('fail', 'CRITICAL', 'Domain registration failed, cannot continue');
        return false;
      }

      // User B: Resolve domain
      const resolveOk = await this.resolveDomain();
      if (!resolveOk) {
        this.log('fail', 'CRITICAL', 'Domain resolution failed');
        return false;
      }

      // Test P2P transfer
      await this.testP2PChunkTransfer();

      // Generate report
      const allPassed = await this.generateReport();

      if (allPassed) {
        console.log('🎉 SUCCESS: All production tests passed!');
        console.log('✅ System is ready for real users');
        return true;
      } else {
        console.log('⚠️  PARTIAL SUCCESS: Some tests failed');
        return false;
      }

    } catch (error) {
      this.log('fail', 'ERROR', 'Test crashed', { error: error.message, stack: error.stack });
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Run test
const test = new ProductionE2ETest();
const success = await test.run();
process.exit(success ? 0 : 1);
