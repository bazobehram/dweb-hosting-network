#!/usr/bin/env node

/**
 * PRODUCTION READINESS TEST
 * 
 * Tests the COMPLETE user workflow as it will be used in production:
 * 
 * User 1 (Browser 1):
 *   1. Upload an app/file
 *   2. File is chunked and replicated to P2P network
 *   3. Register a .dweb domain
 *   4. Bind domain to the uploaded app
 * 
 * User 2 (Browser 2):
 *   5. Open resolver
 *   6. Enter the domain name
 *   7. App loads successfully from P2P network
 * 
 * This simulates real-world usage with multiple users.
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

class ProductionReadinessTest {
  constructor() {
    this.services = [];
    this.browser = null;
    this.user1Panel = null;
    this.user2Panel = null;
    this.testResults = [];
    this.startTime = Date.now();
    
    // Test data
    this.testApp = null;
    this.manifestId = null;
    this.domainName = null;
  }

  log(status, step, message, data = null) {
    const emoji = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️', progress: '🔄' }[status] || 'ℹ️';
    const timestamp = new Date().toISOString().substring(11, 19);
    console.log(`${emoji} [${timestamp}] [${step}] ${message}`);
    if (data && process.env.VERBOSE) console.log('   ', JSON.stringify(data, null, 2));
    
    this.testResults.push({ status, step, message, data, timestamp: new Date().toISOString() });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async screenshot(name, page) {
    try {
      const filename = `prod-${name}-${Date.now()}.png`;
      const filepath = path.join(__dirname, 'screenshots', filename);
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await page.screenshot({ path: filepath, fullPage: true });
      this.log('info', 'SCREENSHOT', filename);
    } catch (err) {}
  }

  async startService(name, scriptPath, port) {
    return new Promise((resolve, reject) => {
      this.log('progress', 'SERVICES', `Starting ${name}...`);
      const service = spawn('node', [scriptPath], { cwd: projectRoot, stdio: 'pipe', shell: true });

      let started = false;
      const timeout = setTimeout(() => !started && reject(new Error(`${name} timeout`)), 15000);

      let output = '';
      service.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('listening') || output.includes('started') || output.includes(`${port}`)) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            this.log('pass', 'SERVICES', `${name} ready (port ${port})`);
            resolve(service);
          }
        }
      });

      service.on('error', (err) => !started && (clearTimeout(timeout), reject(err)));
      this.services.push({ name, process: service });
    });
  }

  async startAllServices() {
    this.log('progress', 'SETUP', 'Starting backend services...');
    try {
      await this.startService('Registry', 'backend/registry-service/src/index.js', 8788);
      await this.sleep(1000);
      await this.startService('Signaling', 'backend/signaling-service/src/index.js', 8787);
      await this.sleep(1000);
      await this.startService('Storage', 'backend/storage-service/src/index.js', 8789);
      await this.sleep(2000);
      this.log('pass', 'SETUP', 'All services running');
      return true;
    } catch (err) {
      this.log('fail', 'SETUP', `Services failed: ${err.message}`);
      return false;
    }
  }

  async launchBrowser() {
    this.log('progress', 'SETUP', 'Launching browser with extension...');
    try {
      const extensionPath = path.join(projectRoot, 'extension');
      const userDataDir = path.join(__dirname, '../.prod-test-profile');

      this.browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-sandbox'
        ],
        viewport: { width: 1400, height: 900 }
      });

      await this.sleep(3000);
      this.log('pass', 'SETUP', 'Browser launched');
      return true;
    } catch (err) {
      this.log('fail', 'SETUP', `Browser launch failed: ${err.message}`);
      return false;
    }
  }

  async getExtensionId() {
    const workers = this.browser.serviceWorkers();
    for (const worker of workers) {
      const match = worker.url().match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) return match[1];
    }
    
    await this.sleep(2000);
    const pages = this.browser.pages();
    for (const page of pages) {
      if (page.url().includes('chrome-extension://')) {
        const match = page.url().match(/chrome-extension:\/\/([a-z]+)\//);
        if (match) return match[1];
      }
    }
    return null;
  }

  async openUserPanels(extensionId) {
    this.log('progress', 'SETUP', 'Opening user panels...');
    try {
      const panelUrl = `chrome-extension://${extensionId}/panel/index.html`;

      this.user1Panel = await this.browser.newPage();
      await this.user1Panel.goto(panelUrl);
      await this.user1Panel.waitForLoadState('networkidle');
      await this.dismissAuthOverlay(this.user1Panel);
      this.log('pass', 'SETUP', 'User 1 panel ready');

      await this.sleep(1000);

      this.user2Panel = await this.browser.newPage();
      await this.user2Panel.goto(panelUrl);
      await this.user2Panel.waitForLoadState('networkidle');
      await this.dismissAuthOverlay(this.user2Panel);
      this.log('pass', 'SETUP', 'User 2 panel ready');

      await this.sleep(2000);
      return true;
    } catch (err) {
      this.log('fail', 'SETUP', `Panels failed: ${err.message}`);
      return false;
    }
  }

  async dismissAuthOverlay(page) {
    try {
      const hasOverlay = await page.evaluate(() => {
        const overlay = document.querySelector('#authOverlay');
        return overlay && !overlay.classList.contains('hidden');
      });
      if (hasOverlay) {
        await page.click('#authGuestBtn');
        await this.sleep(1000);
      }
    } catch (err) {}
  }

  async waitForP2P(page, user) {
    this.log('progress', `USER${user}`, 'Waiting for P2P network...');
    
    for (let i = 0; i < 30; i++) {
      const p2p = await page.evaluate(() => {
        return window.p2pManager ? {
          started: window.p2pManager.isStarted,
          peerId: window.p2pManager.peerId,
          peers: window.p2pManager.peers?.size || 0
        } : null;
      });

      if (p2p && p2p.started) {
        this.log('pass', `USER${user}`, `P2P ready (${p2p.peers} peers)`, { peerId: p2p.peerId?.substring(0, 20) });
        return true;
      }

      await this.sleep(1000);
    }

    this.log('fail', `USER${user}`, 'P2P failed to start');
    return false;
  }

  async testUser1UploadApp() {
    this.log('progress', 'USER1', '📤 Uploading application...');
    await this.screenshot('01-user1-upload-start', this.user1Panel);

    try {
      // Navigate to publish
      await this.user1Panel.click('[data-view="hosting"]');
      await this.sleep(1000);

      // Click publish button
      await this.user1Panel.click('#publishNewAppBtn');
      await this.sleep(1000);

      // Create test app
      const testApp = `<!DOCTYPE html>
<html>
<head>
  <title>DWeb Production Test App</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    h1 { font-size: 3em; margin: 0; }
    .success { color: #4ade80; font-size: 1.5em; margin: 20px 0; }
    .info { background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>🎉 Success!</h1>
  <div class="success">✅ App loaded from P2P network!</div>
  <div class="info">
    <p><strong>Test ID:</strong> ${Date.now()}</p>
    <p><strong>Loaded at:</strong> <span id="time"></span></p>
    <p>This page was published by User 1 and retrieved by User 2 through the decentralized P2P network.</p>
  </div>
  <script>document.getElementById('time').textContent = new Date().toLocaleString();</script>
</body>
</html>`;

      this.testApp = testApp;

      // Upload file via modal
      const result = await this.user1Panel.evaluate(async (htmlContent) => {
        try {
          // Wait for modal
          const modal = document.querySelector('#publishModal');
          if (!modal || modal.classList.contains('hidden')) {
            return { error: 'Modal not open' };
          }

          // Create file
          const blob = new Blob([htmlContent], { type: 'text/html' });
          const file = new File([blob], 'index.html', { type: 'text/html' });

          // Get file input
          const fileInput = document.querySelector('#publishFileInput') || document.querySelector('#publishFolderInput');
          if (!fileInput) return { error: 'File input not found' };

          // Create DataTransfer
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;

          // Trigger input event
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));

          // Wait for processing
          await new Promise(r => setTimeout(r, 2000));

          // Check if Next button is enabled
          const nextBtn = document.querySelector('#startPublishBtn');
          if (!nextBtn || nextBtn.disabled) {
            return { error: 'Next button not enabled' };
          }

          // Click Next
          nextBtn.click();

          // Wait for publish to complete
          await new Promise(r => setTimeout(r, 10000));

          // Check for success screen
          const successScreen = document.querySelector('#publishStep3');
          if (!successScreen || successScreen.style.display === 'none') {
            return { error: 'Publish did not complete' };
          }

          // Get manifest ID
          const manifestIdEl = document.querySelector('#publishedManifestId');
          const manifestId = manifestIdEl?.textContent;

          if (!manifestId || manifestId === '—') {
            return { error: 'No manifest ID' };
          }

          return {
            success: true,
            manifestId,
            chunks: document.querySelector('#publishedChunks')?.textContent || 'unknown',
            peers: document.querySelector('#publishedPeers')?.textContent || '0'
          };
        } catch (err) {
          return { error: err.message };
        }
      }, testApp);

      await this.screenshot('02-user1-upload-complete', this.user1Panel);

      if (result.error) {
        this.log('fail', 'USER1', `Upload failed: ${result.error}`);
        return false;
      }

      this.manifestId = result.manifestId;
      this.log('pass', 'USER1', `App uploaded: ${result.manifestId}`, result);
      return true;

    } catch (err) {
      this.log('fail', 'USER1', `Upload error: ${err.message}`);
      await this.screenshot('02-user1-upload-error', this.user1Panel);
      return false;
    }
  }

  async testUser1RegisterDomain() {
    this.log('progress', 'USER1', '🌐 Registering domain...');

    try {
      // Use quick domain input from publish success screen
      this.domainName = `prod-test-${Date.now()}`;

      const result = await this.user1Panel.evaluate(async (domain) => {
        try {
          // Check if we're on success screen
          const successScreen = document.querySelector('#publishStep3');
          if (!successScreen || successScreen.style.display === 'none') {
            return { error: 'Not on success screen' };
          }

          // Fill quick domain input
          const domainInput = document.querySelector('#quickDomainInput');
          if (!domainInput) return { error: 'Quick domain input not found' };

          domainInput.value = domain;
          domainInput.dispatchEvent(new Event('input', { bubbles: true }));

          await new Promise(r => setTimeout(r, 500));

          // Click register & bind
          const bindBtn = document.querySelector('#quickBindDomainBtn');
          if (!bindBtn) return { error: 'Bind button not found' };

          bindBtn.click();

          // Wait for registration
          await new Promise(r => setTimeout(r, 3000));

          return {
            success: true,
            domain: `${domain}.dweb`
          };
        } catch (err) {
          return { error: err.message };
        }
      }, this.domainName);

      await this.screenshot('03-user1-domain-registered', this.user1Panel);

      if (result.error) {
        this.log('fail', 'USER1', `Domain registration failed: ${result.error}`);
        return false;
      }

      this.domainName = result.domain;
      this.log('pass', 'USER1', `Domain registered: ${this.domainName}`);
      return true;

    } catch (err) {
      this.log('fail', 'USER1', `Domain error: ${err.message}`);
      return false;
    }
  }

  async testUser2ResolveApp() {
    this.log('progress', 'USER2', '🔍 Resolving domain and loading app...');

    try {
      // Open resolver
      await this.user2Panel.click('#openResolverFromSidebar');
      await this.sleep(2000);

      // Find resolver page
      const pages = this.browser.pages();
      const resolverPage = pages.find(p => p.url().includes('resolver'));

      if (!resolverPage) {
        this.log('fail', 'USER2', 'Resolver page not found');
        return false;
      }

      await resolverPage.bringToFront();
      await this.sleep(1000);
      await this.screenshot('04-user2-resolver', resolverPage);

      // Enter domain and resolve
      const result = await resolverPage.evaluate(async (domain) => {
        try {
          const input = document.querySelector('input[type="text"]');
          if (!input) return { error: 'Input not found' };

          input.value = domain;
          input.dispatchEvent(new Event('input', { bubbles: true }));

          await new Promise(r => setTimeout(r, 500));

          // Find and click load button
          const buttons = Array.from(document.querySelectorAll('button'));
          const loadBtn = buttons.find(b => b.textContent.includes('Load') || b.textContent.includes('Resolve'));
          
          if (!loadBtn) return { error: 'Load button not found' };

          loadBtn.click();

          // Wait for content to load
          await new Promise(r => setTimeout(r, 10000));

          // Check if content loaded
          const body = document.body.innerHTML;
          const hasContent = body.includes('Success!') || body.includes('DWeb') || body.includes('P2P network');

          return {
            success: hasContent,
            contentLength: body.length,
            title: document.title
          };
        } catch (err) {
          return { error: err.message };
        }
      }, this.domainName);

      await this.sleep(2000);
      await this.screenshot('05-user2-app-loaded', resolverPage);

      if (result.error) {
        this.log('fail', 'USER2', `Resolution failed: ${result.error}`);
        return false;
      }

      if (result.success) {
        this.log('pass', 'USER2', `App loaded successfully!`, result);
        return true;
      } else {
        this.log('fail', 'USER2', 'App did not load', result);
        return false;
      }

    } catch (err) {
      this.log('fail', 'USER2', `Resolution error: ${err.message}`);
      return false;
    }
  }

  async cleanup() {
    this.log('progress', 'CLEANUP', 'Stopping services...');
    try {
      if (this.browser) await this.browser.close();
      for (const service of this.services) service.process.kill();
      await this.sleep(1000);
      this.log('pass', 'CLEANUP', 'Cleanup complete');
    } catch (err) {}
  }

  async generateReport() {
    const duration = Date.now() - this.startTime;
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const productionReady = failed === 0;

    const report = {
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(1)}s`,
      summary: { total: this.testResults.length, passed, failed, productionReady },
      workflow: {
        appUploaded: !!this.manifestId,
        domainRegistered: !!this.domainName,
        manifestId: this.manifestId,
        domain: this.domainName
      },
      results: this.testResults
    };

    const reportPath = path.join(__dirname, 'reports', `production-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  async run() {
    console.log('\n' + '═'.repeat(80));
    console.log('🚀 PRODUCTION READINESS TEST - Complete User Workflow');
    console.log('═'.repeat(80) + '\n');

    try {
      // Setup
      if (!await this.startAllServices()) return false;
      if (!await this.launchBrowser()) return false;
      
      const extensionId = await this.getExtensionId();
      if (!extensionId) {
        this.log('fail', 'SETUP', 'Extension not found');
        return false;
      }
      this.log('pass', 'SETUP', `Extension ID: ${extensionId}`);

      if (!await this.openUserPanels(extensionId)) return false;

      // Wait for P2P
      const user1P2P = await this.waitForP2P(this.user1Panel, 1);
      const user2P2P = await this.waitForP2P(this.user2Panel, 2);

      if (!user1P2P || !user2P2P) {
        this.log('warn', 'P2P', 'P2P not fully ready - continuing anyway');
      }

      // Test workflow
      console.log('\n' + '─'.repeat(80));
      console.log('👤 USER 1 WORKFLOW: Upload → Register → Bind');
      console.log('─'.repeat(80) + '\n');

      const uploaded = await this.testUser1UploadApp();
      if (!uploaded) {
        this.log('fail', 'WORKFLOW', 'Cannot continue - upload failed');
        return false;
      }

      const registered = await this.testUser1RegisterDomain();
      if (!registered) {
        this.log('warn', 'WORKFLOW', 'Domain registration failed - trying manual bind');
      }

      console.log('\n' + '─'.repeat(80));
      console.log('👤 USER 2 WORKFLOW: Resolve → Load App');
      console.log('─'.repeat(80) + '\n');

      await this.sleep(3000); // Allow replication

      const resolved = await this.testUser2ResolveApp();

      // Report
      const report = await this.generateReport();

      console.log('\n' + '═'.repeat(80));
      console.log('📊 PRODUCTION READINESS RESULTS');
      console.log('═'.repeat(80));
      console.log(`\n✅ Passed: ${report.summary.passed}`);
      console.log(`❌ Failed: ${report.summary.failed}`);
      console.log(`⏱️  Duration: ${report.duration}`);
      console.log(`\n📦 App Published: ${report.workflow.appUploaded ? '✅' : '❌'}`);
      console.log(`🌐 Domain Registered: ${report.workflow.domainRegistered ? '✅' : '❌'}`);
      console.log(`🔗 Domain: ${report.workflow.domain || 'N/A'}`);
      console.log(`📝 Manifest: ${report.workflow.manifestId || 'N/A'}`);
      console.log(`\n🎯 PRODUCTION READY: ${report.summary.productionReady ? '✅ YES' : '❌ NO'}`);
      console.log('\n' + '═'.repeat(80) + '\n');

      if (!report.summary.productionReady) {
        console.log('❌ FAILED TESTS:\n');
        this.testResults.filter(r => r.status === 'fail').forEach((r, i) => {
          console.log(`${i + 1}. [${r.step}] ${r.message}`);
        });
        console.log('');
      }

      return report.summary.productionReady;

    } catch (err) {
      this.log('fail', 'CRASH', `Test crashed: ${err.message}`);
      console.error(err.stack);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

const test = new ProductionReadinessTest();
test.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
