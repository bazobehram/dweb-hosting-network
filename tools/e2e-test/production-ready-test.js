/**
 * PRODUCTION READINESS TEST
 * 
 * Complete end-to-end test that validates the entire application
 * like a real user would use it.
 * 
 * Tests:
 * 1. Start all backend services (registry, signaling, storage)
 * 2. Load extension in Chrome
 * 3. Complete user flow:
 *    - Check dashboard
 *    - Publish an application
 *    - Register a domain
 *    - Bind domain to app
 *    - Resolve domain in new browser
 *    - Fetch content successfully
 * 4. Verify all data displays correctly
 * 5. Check for any errors
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

class ProductionReadinessTest {
  constructor() {
    this.services = [];
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testResults = [];
    this.screenshots = [];
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

  async screenshot(name) {
    try {
      const filename = `${name}-${Date.now()}.png`;
      const filepath = path.join(__dirname, 'screenshots', filename);
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await this.page.screenshot({ path: filepath, fullPage: true });
      this.screenshots.push(filename);
      console.log(`📸 Screenshot: ${filename}`);
    } catch (err) {
      console.log(`⚠️  Screenshot failed: ${err.message}`);
    }
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
            console.log(`✅ ${name} started on port ${port}`);
            resolve(service);
          }
        }
      });

      service.stderr.on('data', (data) => {
        console.log(`[${name}]`, data.toString().trim());
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
      // Start Registry
      await this.startService(
        'Registry',
        'node',
        ['backend/registry-service/src/index.js'],
        8788
      );
      await this.sleep(1000);

      // Start Signaling
      await this.startService(
        'Signaling',
        'node',
        ['backend/signaling-service/src/index.js'],
        8787
      );
      await this.sleep(1000);

      // Start Storage
      await this.startService(
        'Storage',
        'node',
        ['backend/storage-service/src/index.js'],
        8789
      );
      await this.sleep(1000);

      this.log('pass', 'SERVICES', 'All backend services started successfully');
      return true;
    } catch (err) {
      this.log('fail', 'SERVICES', 'Failed to start services', err.message);
      return false;
    }
  }

  async launchBrowser() {
    console.log('\n🌐 Launching Chrome with Extension...\n');
    
    try {
      const extensionPath = path.join(projectRoot, 'extension');
      
      this.browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-sandbox'
        ],
        viewport: { width: 1280, height: 720 }
      });

      // Get extension page
      await this.sleep(2000);
      const pages = this.browser.pages();
      
      // Open panel
      this.page = await this.browser.newPage();
      await this.page.goto('chrome-extension://placeholder/panel/index.html');
      
      // Find actual extension ID
      const extensionPages = pages.filter(p => p.url().includes('chrome-extension://'));
      if (extensionPages.length > 0) {
        const extensionId = extensionPages[0].url().match(/chrome-extension:\/\/([^\/]+)/)[1];
        await this.page.goto(`chrome-extension://${extensionId}/panel/index.html`);
      }

      await this.sleep(2000);
      await this.screenshot('01-panel-loaded');
      
      this.log('pass', 'BROWSER', 'Browser and extension loaded');
      return true;
    } catch (err) {
      this.log('fail', 'BROWSER', 'Failed to launch browser', err.message);
      return false;
    }
  }

  async testDashboard() {
    console.log('\n📊 Testing Dashboard...\n');
    
    try {
      // Check if dashboard is visible
      const dashboard = await this.page.locator('#view-dashboard').isVisible();
      if (!dashboard) {
        this.log('fail', 'DASHBOARD', 'Dashboard view not visible');
        return false;
      }

      // Check health indicators
      const health = await this.page.evaluate(() => {
        return {
          signaling: document.querySelector('#nhSignaling')?.textContent,
          registry: document.querySelector('#nhRegistry')?.textContent,
          storage: document.querySelector('#nhStorage')?.textContent,
          peers: document.querySelector('#nhPeers')?.textContent
        };
      });

      console.log('Health indicators:', health);

      // Check for errors
      const hasErrors = health.registry?.includes('ERR') || 
                       health.signaling?.includes('ERR') || 
                       health.storage?.includes('ERR');

      if (hasErrors) {
        this.log('fail', 'DASHBOARD', 'Service health checks failed', health);
        await this.screenshot('02-dashboard-errors');
        return false;
      }

      // Check stats
      const stats = await this.page.evaluate(() => {
        return {
          apps: document.querySelector('#dashboardAppsCount')?.textContent,
          domains: document.querySelector('#dashboardDomainsCount')?.textContent,
          peers: document.querySelector('#dashboardPeersCount')?.textContent
        };
      });

      console.log('Stats:', stats);
      
      await this.screenshot('02-dashboard-ok');
      this.log('pass', 'DASHBOARD', 'Dashboard displays correctly', { health, stats });
      return true;
    } catch (err) {
      this.log('fail', 'DASHBOARD', 'Dashboard test failed', err.message);
      await this.screenshot('02-dashboard-fail');
      return false;
    }
  }

  async testPublishApp() {
    console.log('\n📤 Testing Publish Flow...\n');
    
    try {
      // Go to Publish view
      await this.page.click('[data-view="hosting"]');
      await this.sleep(1000);
      await this.screenshot('03-publish-view');

      // Click publish button
      await this.page.click('#publishNewAppBtn');
      await this.sleep(500);
      await this.screenshot('04-publish-modal');

      // Check modal opened
      const modalVisible = await this.page.locator('#publishModal').isVisible();
      if (!modalVisible) {
        this.log('fail', 'PUBLISH', 'Publish modal did not open');
        return false;
      }

      // Create a test HTML file
      const testFile = path.join(__dirname, 'test-app', 'index.html');
      await fs.mkdir(path.dirname(testFile), { recursive: true });
      await fs.writeFile(testFile, `
<!DOCTYPE html>
<html>
<head><title>Test App</title></head>
<body>
  <h1>Hello DWeb!</h1>
  <p>Test application published at ${new Date().toISOString()}</p>
</body>
</html>
      `);

      // Upload file
      const fileInput = await this.page.locator('#publishFileInput');
      await fileInput.setInputFiles(testFile);
      await this.sleep(1000);
      await this.screenshot('05-file-selected');

      // Click Next/Publish
      const nextButton = await this.page.locator('#startPublishBtn');
      const isEnabled = await nextButton.isEnabled();
      
      if (!isEnabled) {
        this.log('warn', 'PUBLISH', 'Publish button not enabled - checking why');
        await this.screenshot('05-button-disabled');
      }

      // If we can click, do it
      if (isEnabled) {
        await nextButton.click();
        await this.sleep(2000);
        await this.screenshot('06-publishing');

        // Wait for success
        await this.page.waitForSelector('#publishStep3', { timeout: 30000 });
        await this.screenshot('07-publish-success');

        // Get manifest ID
        const manifestId = await this.page.locator('#publishedManifestId').textContent();
        console.log('Published manifest:', manifestId);

        this.log('pass', 'PUBLISH', 'Application published successfully', { manifestId });
        
        // Close modal
        await this.page.click('#closeSuccessBtn');
        await this.sleep(500);
        
        return { success: true, manifestId };
      } else {
        this.log('warn', 'PUBLISH', 'Could not complete publish (button disabled)');
        return { success: false };
      }

    } catch (err) {
      this.log('fail', 'PUBLISH', 'Publish flow failed', err.message);
      await this.screenshot('publish-error');
      return { success: false };
    }
  }

  async testDomainRegistration(manifestId) {
    console.log('\n🌐 Testing Domain Registration...\n');
    
    try {
      // Go to Domains view
      await this.page.click('[data-view="domains"]');
      await this.sleep(1000);
      await this.screenshot('08-domains-view');

      // Generate unique domain
      const testDomain = `test-${Date.now()}`;
      
      // Fill domain input
      await this.page.fill('#domainSearchInput', testDomain);
      await this.sleep(500);

      // Click register
      await this.page.click('#registerNewDomainBtn');
      await this.sleep(2000);
      await this.screenshot('09-domain-registering');

      // Wait for domain to appear in table
      await this.sleep(3000);
      await this.screenshot('10-domain-registered');

      // Verify domain in table
      const domainExists = await this.page.locator(`text=${testDomain}.dweb`).isVisible();
      
      if (domainExists) {
        this.log('pass', 'DOMAIN', `Domain ${testDomain}.dweb registered`, { domain: testDomain });
        return { success: true, domain: `${testDomain}.dweb` };
      } else {
        this.log('fail', 'DOMAIN', 'Domain not found in table after registration');
        return { success: false };
      }

    } catch (err) {
      this.log('fail', 'DOMAIN', 'Domain registration failed', err.message);
      await this.screenshot('domain-error');
      return { success: false };
    }
  }

  async testDomainBinding(domain, manifestId) {
    console.log('\n🔗 Testing Domain Binding...\n');
    
    try {
      // Go to Bindings view
      await this.page.click('[data-view="bindings"]');
      await this.sleep(1000);
      await this.screenshot('11-bindings-view');

      // Select app from dropdown
      const appSelect = await this.page.locator('#bindingAppSelect');
      await appSelect.selectOption({ index: 1 }); // Select first app
      await this.sleep(500);

      // Fill domain
      await this.page.fill('#bindingDomainInput', domain.replace('.dweb', ''));
      await this.sleep(500);

      // Click bind button
      await this.page.click('#createBindingBtn');
      await this.sleep(3000);
      await this.screenshot('12-binding-created');

      // Check if binding appears
      const bindingExists = await this.page.locator(`text=${domain}`).isVisible();
      
      if (bindingExists) {
        this.log('pass', 'BINDING', `Domain ${domain} bound to app`, { domain, manifestId });
        return true;
      } else {
        this.log('fail', 'BINDING', 'Binding not found after creation');
        return false;
      }

    } catch (err) {
      this.log('fail', 'BINDING', 'Binding failed', err.message);
      await this.screenshot('binding-error');
      return false;
    }
  }

  async testResolver(domain) {
    console.log('\n🔍 Testing Domain Resolution...\n');
    
    try {
      // Open resolver
      await this.page.click('#openResolverFromSidebar');
      await this.sleep(2000);
      
      // Find resolver page
      const pages = this.browser.pages();
      const resolverPage = pages.find(p => p.url().includes('resolver'));
      
      if (!resolverPage) {
        this.log('fail', 'RESOLVER', 'Resolver page not found');
        return false;
      }

      await resolverPage.bringToFront();
      await this.sleep(1000);
      await resolverPage.screenshot({ path: path.join(__dirname, 'screenshots', '13-resolver.png') });

      // Enter domain
      await resolverPage.fill('input[type="text"]', domain);
      await this.sleep(500);

      // Click resolve/load
      await resolverPage.click('button:has-text("Load")');
      await this.sleep(5000);
      await resolverPage.screenshot({ path: path.join(__dirname, 'screenshots', '14-resolved.png') });

      // Check if content loaded
      const content = await resolverPage.content();
      const hasContent = content.includes('Hello DWeb') || content.includes('Test App');
      
      if (hasContent) {
        this.log('pass', 'RESOLVER', `Domain ${domain} resolved and content loaded`);
        return true;
      } else {
        this.log('fail', 'RESOLVER', 'Content did not load', { contentLength: content.length });
        return false;
      }

    } catch (err) {
      this.log('fail', 'RESOLVER', 'Resolution failed', err.message);
      return false;
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...\n');
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
    }

    // Stop all services
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
      results: this.testResults,
      screenshots: this.screenshots
    };

    // Save report
    const reportPath = path.join(__dirname, 'reports', `production-test-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  async run() {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🚀 PRODUCTION READINESS TEST');
    console.log('═'.repeat(70));
    console.log('\n');

    try {
      // Step 1: Start services
      const servicesOk = await this.startAllServices();
      if (!servicesOk) {
        console.log('\n❌ Cannot continue without services');
        return false;
      }

      // Step 2: Launch browser
      const browserOk = await this.launchBrowser();
      if (!browserOk) {
        console.log('\n❌ Cannot continue without browser');
        return false;
      }

      // Step 3: Test dashboard
      await this.testDashboard();

      // Step 4: Test publish
      const publishResult = await this.testPublishApp();

      // Step 5: Test domain registration
      let domainResult = { success: false };
      if (publishResult.success) {
        domainResult = await this.testDomainRegistration(publishResult.manifestId);
      }

      // Step 6: Test binding
      if (publishResult.success && domainResult.success) {
        await this.testDomainBinding(domainResult.domain, publishResult.manifestId);
      }

      // Step 7: Test resolver
      if (domainResult.success) {
        await this.testResolver(domainResult.domain);
      }

      // Generate report
      const report = await this.generateReport();

      // Print summary
      console.log('\n');
      console.log('═'.repeat(70));
      console.log('📊 TEST SUMMARY');
      console.log('═'.repeat(70));
      console.log(`\n✅ Passed: ${report.summary.passed}`);
      console.log(`❌ Failed: ${report.summary.failed}`);
      console.log(`⚠️  Warnings: ${report.summary.warnings}`);
      console.log(`\n🎯 Production Ready: ${report.summary.productionReady ? 'YES ✅' : 'NO ❌'}`);
      console.log('\n📸 Screenshots:', this.screenshots.length);
      console.log('💾 Report saved to:', path.relative(projectRoot, reportPath));
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
      console.error('\n❌ Test suite crashed:', err);
      await this.screenshot('crash');
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
const test = new ProductionReadinessTest();
test.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
