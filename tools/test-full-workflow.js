#!/usr/bin/env node

/**
 * DWeb Full Workflow Test
 * Tests the complete flow: upload → register domain → resolve content
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../extension');

class FullWorkflowTest {
  constructor() {
    this.browser = null;
    this.context = null;
    this.extensionId = null;
    this.testDomain = `workflow-test-${Date.now()}.dweb`;
    this.testContent = `
      <html>
        <head><title>Full Workflow Test</title></head>
        <body>
          <h1>DWeb Full Workflow Test</h1>
          <p>Generated: ${new Date().toISOString()}</p>
          <p>Domain: ${this.testDomain}</p>
          <div id="test-marker">WORKFLOW_SUCCESS</div>
        </body>
      </html>
    `;
  }

  async setup() {
    console.log('🚀 Setting up full workflow test...');
    
    // Check desktop node first
    await this.checkDesktopNode();
    
    // Launch browser with extension
    this.browser = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.context = this.browser.contexts()[0];
    console.log('✅ Browser launched with extension');
    
    await this.findExtensionId();
  }

  async checkDesktopNode() {
    try {
      const response = await fetch('http://localhost:8788/health');
      if (!response.ok) {
        throw new Error(`Registry unhealthy: ${response.status}`);
      }
      const health = await response.json();
      console.log(`✅ Desktop registry: ${health.service} - ${health.status}`);
      console.log(`📊 Current state: ${health.database.domains} domains, ${health.database.manifests} manifests`);
    } catch (error) {
      throw new Error(`Desktop registry not accessible: ${error.message}\nStart with: npm run start:registry`);
    }
  }

  async findExtensionId() {
    console.log('🔍 Finding extension...');
    
    const page = await this.context.newPage();
    await page.goto('chrome://extensions/');
    await page.waitForTimeout(2000);
    
    const extensionElements = await page.$$('extensions-item');
    for (const element of extensionElements) {
      const name = await element.evaluate(el => {
        const shadowRoot = el.shadowRoot;
        const nameEl = shadowRoot?.querySelector('#name');
        return nameEl?.textContent || '';
      });
      
      if (name.toLowerCase().includes('dweb')) {
        this.extensionId = await element.evaluate(el => el.id);
        break;
      }
    }
    
    await page.close();
    
    if (!this.extensionId) {
      throw new Error('DWeb extension not found - load it first via chrome://extensions');
    }
    
    console.log(`✅ Extension found: ${this.extensionId}`);
  }

  async testStep1_UploadContent() {
    console.log('\n1️⃣  Testing Content Upload...');
    
    const panelUrl = `chrome-extension://${this.extensionId}/panel/index.html`;
    const page = await this.context.newPage();
    await page.goto(panelUrl);
    
    // Wait for panel to load
    await page.waitForSelector('#uploadBtn', { timeout: 15000 });
    console.log('   📱 Panel loaded');
    
    // Fill domain
    await page.fill('#domainInput', this.testDomain);
    console.log(`   🌐 Domain set: ${this.testDomain}`);
    
    // Create a test file and upload it
    // Note: In a real test, we'd need to handle file upload properly
    // For now, let's simulate the upload process
    
    const fileInput = await page.$('#fileInput');
    if (fileInput) {
      // Create a temporary file for testing
      const tempFilePath = path.join(__dirname, 'temp-test-file.html');
      const fs = await import('fs/promises');
      await fs.writeFile(tempFilePath, this.testContent);
      
      // Upload the file
      await fileInput.setInputFiles(tempFilePath);
      console.log('   📁 File selected for upload');
      
      // Click upload button
      await page.click('#uploadBtn');
      console.log('   🚀 Upload initiated');
      
      // Wait for upload to complete - check logs
      await page.waitForTimeout(10000); // Wait 10 seconds for upload
      
      // Check upload results in log
      const logContent = await page.$eval('#logOutput', el => el.textContent);
      console.log('   📝 Upload log preview:', logContent.slice(0, 300) + '...');
      
      if (logContent.includes('success') || logContent.includes('uploaded') || logContent.includes('registered')) {
        console.log('   ✅ Upload appears successful');
      } else {
        console.log('   ⚠️  Upload status unclear from logs');
      }
      
      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    } else {
      console.log('   ❌ File input not found');
    }
    
    await page.close();
  }

  async testStep2_VerifyRegistration() {
    console.log('\n2️⃣  Verifying Domain Registration...');
    
    // Check via registry API
    try {
      const response = await fetch(`http://localhost:8788/domains/${this.testDomain}`);
      if (response.ok) {
        const domainData = await response.json();
        console.log('   ✅ Domain found in registry');
        console.log(`      Domain: ${domainData.domain}`);
        console.log(`      Manifest: ${domainData.manifestId}`);
        console.log(`      Replicas: ${domainData.replicas?.length || 0}`);
        
        if (domainData.replicas && domainData.replicas.length > 0) {
          console.log('   ✅ Domain has replicas for P2P');
        } else {
          console.log('   ⚠️  Domain has no replicas - P2P resolution will fail');
        }
        
        return domainData;
      } else if (response.status === 404) {
        console.log('   ❌ Domain not found in registry');
        return null;
      } else {
        console.log('   ❌ Registry error:', response.status);
        return null;
      }
    } catch (error) {
      console.log('   ❌ Registry check failed:', error.message);
      return null;
    }
  }

  async testStep3_ResolveContent() {
    console.log('\n3️⃣  Testing Content Resolution...');
    
    const resolverUrl = `chrome-extension://${this.extensionId}/resolver/index.html`;
    const page = await this.context.newPage();
    await page.goto(resolverUrl);
    
    // Wait for resolver to load
    await page.waitForSelector('#resolveBtn', { timeout: 15000 });
    console.log('   🔍 Resolver loaded');
    
    // Enter domain and resolve
    await page.fill('#domainInput', this.testDomain);
    await page.click('#resolveBtn');
    console.log(`   🌐 Resolving: ${this.testDomain}`);
    
    // Wait for resolution
    await page.waitForTimeout(10000);
    
    // Check resolution results
    const logContent = await page.$eval('#logOutput', el => el.textContent);
    console.log('   📝 Resolution log preview:', logContent.slice(-300));
    
    // Check if content was resolved
    const previewFrame = await page.$('#previewFrame');
    if (previewFrame) {
      const frameSrc = await previewFrame.getAttribute('src');
      if (frameSrc && frameSrc.startsWith('blob:')) {
        console.log('   ✅ Content resolved and displayed');
        
        // Try to access frame content (may be blocked by security policies)
        try {
          const frameContent = await page.evaluate(() => {
            const frame = document.getElementById('previewFrame');
            return frame.contentDocument?.body?.innerHTML || 'Content loaded but not accessible';
          });
          
          if (frameContent.includes('WORKFLOW_SUCCESS')) {
            console.log('   🎉 Test content verified in preview!');
          } else {
            console.log('   📄 Content loaded (verification limited by security)');
          }
        } catch {
          console.log('   📄 Content loaded in iframe (cross-origin protected)');
        }
      } else {
        console.log('   ❌ No content displayed in preview frame');
      }
    } else {
      console.log('   ❌ Preview frame not found');
    }
    
    // Check status indicators
    const statusElements = await page.$$('[class*="badge"]');
    for (const element of statusElements) {
      const text = await element.textContent();
      if (text && (text.includes('Peer') || text.includes('Registry') || text.includes('Cache'))) {
        console.log(`   📊 Status: ${text}`);
      }
    }
    
    await page.close();
    
    // Return success if we got content
    return logContent.includes('Content rendered') || logContent.includes('rendered');
  }

  async testStep4_CheckPeerStatus() {
    console.log('\n4️⃣  Checking P2P Peer Status...');
    
    // Check if we're properly seeding content
    const panelUrl = `chrome-extension://${this.extensionId}/panel/index.html`;
    const page = await this.context.newPage();
    await page.goto(panelUrl);
    
    await page.waitForSelector('#logOutput', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    const logContent = await page.$eval('#logOutput', el => el.textContent);
    
    // Look for P2P activity
    const hasP2PActivity = logContent.includes('peer') || 
                          logContent.includes('P2P') || 
                          logContent.includes('signaling') ||
                          logContent.includes('WebRTC');
    
    if (hasP2PActivity) {
      console.log('   ✅ P2P activity detected');
    } else {
      console.log('   ⚠️  No clear P2P activity detected');
      console.log('   💡 This may explain why chunks are unavailable');
    }
    
    await page.close();
  }

  async diagnoseIssues() {
    console.log('\n🔧 Diagnosing Issues...');
    
    // Check registry state
    try {
      const domainsResponse = await fetch('http://localhost:8788/domains');
      if (domainsResponse.ok) {
        const domains = await domainsResponse.json();
        const testDomainData = domains.domains?.find(d => d.domain === this.testDomain);
        
        if (testDomainData) {
          console.log(`   🌐 Test domain found: ${testDomainData.domain}`);
          console.log(`   📄 Manifest: ${testDomainData.manifestId}`);
          console.log(`   👥 Replicas: ${testDomainData.replicas?.length || 0}`);
          
          // Check manifest details
          try {
            const manifestResponse = await fetch(`http://localhost:8788/manifests/${testDomainData.manifestId}`);
            if (manifestResponse.ok) {
              const manifest = await manifestResponse.json();
              console.log(`   📊 Manifest details: ${manifest.fileName} (${manifest.chunkCount} chunks)`);
              console.log(`   💾 File size: ${manifest.fileSize} bytes`);
              console.log(`   📝 MIME type: ${manifest.mimeType}`);
            }
          } catch {}
          
          // The issue: No replicas means no peers are hosting the content
          if (!testDomainData.replicas || testDomainData.replicas.length === 0) {
            console.log('\n❌ ROOT CAUSE IDENTIFIED:');
            console.log('   The domain exists but has no replica peers');
            console.log('   This means:');
            console.log('     • Content was uploaded to registry');
            console.log('     • But no peer is actively hosting/seeding it');
            console.log('     • Pure P2P mode requires active peers');
            console.log('\n💡 SOLUTIONS:');
            console.log('   1. Check if P2P network is running in extension');
            console.log('   2. Verify signaling server connectivity');
            console.log('   3. Ensure peer discovery is working');
            console.log('   4. Test with two browser instances for P2P');
          }
        } else {
          console.log('   ❌ Test domain not found in registry');
        }
      }
    } catch (error) {
      console.log('   ❌ Registry diagnosis failed:', error.message);
    }
  }

  async runFullTest() {
    const results = { passed: 0, failed: 0 };
    
    try {
      await this.testStep1_UploadContent();
      results.passed++;
    } catch (error) {
      console.error('   ❌ Upload failed:', error.message);
      results.failed++;
    }
    
    const domainData = await this.testStep2_VerifyRegistration();
    if (domainData) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    try {
      const resolved = await this.testStep3_ResolveContent();
      if (resolved) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      console.error('   ❌ Resolution failed:', error.message);
      results.failed++;
    }
    
    await this.testStep4_CheckPeerStatus();
    
    await this.diagnoseIssues();
    
    return results;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
  }
}

// Main execution
async function main() {
  console.log('🧪 DWeb Full Workflow Test');
  console.log('Testing: Upload → Register → Resolve');
  console.log('=' .repeat(60));
  
  const tester = new FullWorkflowTest();
  
  try {
    await tester.setup();
    const results = await tester.runFullTest();
    
    console.log('\n🎯 Full Workflow Test Summary:');
    console.log(`   Steps Passed: ${results.passed}`);
    console.log(`   Steps Failed: ${results.failed}`);
    console.log(`   Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
    
    if (results.failed === 0) {
      console.log('\n🎉 All workflow steps completed successfully!');
    } else {
      console.log('\n⚠️  Some workflow steps failed - see diagnosis above');
    }
    
  } catch (error) {
    console.error('❌ Workflow test error:', error.message);
  } finally {
    await tester.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { FullWorkflowTest };