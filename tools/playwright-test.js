#!/usr/bin/env node

/**
 * DWeb Hosting Network - Playwright Test with UI Visualization
 * 
 * This script tests all phases with a visual browser-based dashboard:
 * - Phase 1: P2P Infrastructure (Bootstrap + Peer Discovery)
 * - Phase 2: Chunk Transfer Protocol
 * - Phase 3: DHT Domain Registry
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../extension');
const dashboardPath = path.join(__dirname, '../backend/monitor/dashboard.html');

// Test state
const testState = {
  phases: {
    phase1: { status: 'pending', browsers: [] },
    phase2: { status: 'pending', transfers: [] },
    phase3: { status: 'pending', domains: [] }
  },
  logs: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, type };
  testState.logs.push(logEntry);
  
  const emoji = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    progress: '🔄'
  }[type] || '📋';
  
  console.log(`${emoji} ${message}`);
}

function getBootstrapPeerId() {
  try {
    const logFile = path.join(__dirname, '../backend/bootstrap-node/bootstrap-server.log');
    const content = fs.readFileSync(logFile, 'utf8');
    const match = content.match(/Peer ID: (12D3KooW[a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createDashboard(page) {
  // Inject dashboard UI into the page
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; background: #0a0e27; color: #e0e6ed; }
      .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
      .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #1e293b; }
      .header h1 { font-size: 2.5em; margin-bottom: 10px; }
      .header .subtitle { color: #64748b; font-size: 1.1em; }
      .phases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
      .phase-card { background: #1e293b; border-radius: 12px; padding: 25px; border: 2px solid #334155; }
      .phase-card.active { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); }
      .phase-card.success { border-color: #10b981; }
      .phase-card.error { border-color: #ef4444; }
      .phase-title { font-size: 1.4em; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
      .phase-status { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
      .status-pending { background: #64748b; }
      .status-running { background: #3b82f6; animation: pulse 1.5s infinite; }
      .status-success { background: #10b981; }
      .status-error { background: #ef4444; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      .phase-details { margin-top: 15px; }
      .detail-item { padding: 8px 0; border-bottom: 1px solid #334155; }
      .detail-item:last-child { border-bottom: none; }
      .detail-label { color: #94a3b8; font-size: 0.9em; }
      .detail-value { color: #e0e6ed; font-weight: 500; margin-top: 3px; }
      .logs-section { background: #1e293b; border-radius: 12px; padding: 25px; margin: 30px 0; }
      .logs-title { font-size: 1.4em; margin-bottom: 15px; }
      .logs-container { background: #0f172a; border-radius: 8px; padding: 15px; max-height: 400px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 0.9em; }
      .log-entry { padding: 5px 0; }
      .log-timestamp { color: #64748b; }
      .log-info { color: #3b82f6; }
      .log-success { color: #10b981; }
      .log-error { color: #ef4444; }
      .log-warning { color: #f59e0b; }
      .progress-bar { width: 100%; height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin: 10px 0; }
      .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s; }
    `;
    document.head.appendChild(style);

    document.body.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>🌐 DWeb Hosting Network Test Dashboard</h1>
          <div class="subtitle">Real-time P2P, Chunk Transfer & DHT Testing</div>
        </div>
        
        <div class="phases">
          <div class="phase-card" id="phase1-card">
            <div class="phase-title">
              <span class="phase-status status-pending" id="phase1-status"></span>
              Phase 1: P2P Infrastructure
            </div>
            <div class="phase-details" id="phase1-details">
              <div class="detail-item">
                <div class="detail-label">Bootstrap Server</div>
                <div class="detail-value" id="bootstrap-status">Checking...</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Browser Nodes</div>
                <div class="detail-value" id="browser-nodes">0 / 2</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Peer Connections</div>
                <div class="detail-value" id="peer-connections">0</div>
              </div>
            </div>
          </div>

          <div class="phase-card" id="phase2-card">
            <div class="phase-title">
              <span class="phase-status status-pending" id="phase2-status"></span>
              Phase 2: Chunk Transfer
            </div>
            <div class="phase-details" id="phase2-details">
              <div class="detail-item">
                <div class="detail-label">Test File</div>
                <div class="detail-value" id="test-file">Not prepared</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Chunks Transferred</div>
                <div class="detail-value" id="chunks-transferred">0 / 0</div>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" id="transfer-progress" style="width: 0%"></div>
              </div>
            </div>
          </div>

          <div class="phase-card" id="phase3-card">
            <div class="phase-title">
              <span class="phase-status status-pending" id="phase3-status"></span>
              Phase 3: DHT Registry
            </div>
            <div class="phase-details" id="phase3-details">
              <div class="detail-item">
                <div class="detail-label">DHT Status</div>
                <div class="detail-value" id="dht-status">Not started</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Test Domain</div>
                <div class="detail-value" id="test-domain">-</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Resolution</div>
                <div class="detail-value" id="domain-resolution">-</div>
              </div>
            </div>
          </div>
        </div>

        <div class="logs-section">
          <div class="logs-title">📜 Test Logs</div>
          <div class="logs-container" id="logs"></div>
        </div>
      </div>
    `;

    // Expose update functions
    window.updatePhaseStatus = (phase, status) => {
      const card = document.getElementById(`${phase}-card`);
      const statusEl = document.getElementById(`${phase}-status`);
      card.className = `phase-card ${status}`;
      statusEl.className = `phase-status status-${status}`;
    };

    window.updateDetail = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    window.addLog = (message, type = 'info') => {
      const logsContainer = document.getElementById('logs');
      const timestamp = new Date().toLocaleTimeString();
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
      logsContainer.appendChild(entry);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    };

    window.updateProgress = (percent) => {
      const fill = document.getElementById('transfer-progress');
      if (fill) fill.style.width = `${percent}%`;
    };
  });
}

async function testPhase1(dashboardPage, browser1, browser2, bootstrapPeerId) {
  await dashboardPage.evaluate(() => {
    window.updatePhaseStatus('phase1', 'running');
    window.addLog('🚀 Starting Phase 1: P2P Infrastructure', 'info');
  });

  const bootstrapAddr = `/dns4/localhost/tcp/9104/ws/p2p/${bootstrapPeerId}`;
  
  // Start libp2p on both browsers
  log('Starting libp2p nodes...', 'progress');
  
  for (let i = 0; i < 2; i++) {
    const browser = i === 0 ? browser1 : browser2;
    await dashboardPage.evaluate((num) => {
      window.addLog(`Starting Browser ${num} libp2p node...`, 'info');
    }, i + 1);

    try {
      const result = await browser.evaluate(async (addr) => {
        await window.testLibp2pStart(addr);
        await new Promise(r => setTimeout(r, 1000));
        const status = window.p2pManager.getStatus();
        return {
          peerId: status.peerId,
          isStarted: status.isStarted,
          peerCount: status.peerCount,
          isDHTEnabled: window.p2pManager.isDHTEnabled()
        };
      }, bootstrapAddr);

      testState.phases.phase1.browsers.push(result);
      
      await dashboardPage.evaluate((data) => {
        window.addLog(`✅ Browser ${data.num} started: ${data.peerId.substring(0, 30)}...`, 'success');
        window.addLog(`   DHT: ${data.isDHTEnabled ? 'Enabled' : 'Disabled'}, Peers: ${data.peerCount}`, 'info');
        window.updateDetail('browser-nodes', `${data.num} / 2`);
      }, { num: i + 1, ...result });

      log(`Browser ${i + 1} started: ${result.peerId.substring(0, 20)}...`, 'success');
    } catch (error) {
      await dashboardPage.evaluate((msg) => {
        window.addLog(`❌ Browser startup failed: ${msg}`, 'error');
      }, error.message);
      throw error;
    }
  }

  // Wait for connections
  await dashboardPage.evaluate(() => {
    window.addLog('⏳ Waiting for peer discovery...', 'info');
  });
  await sleep(3000);

  // Check connections
  const peerCounts = [];
  for (let i = 0; i < 2; i++) {
    const browser = i === 0 ? browser1 : browser2;
    const status = await browser.evaluate(() => window.p2pManager.getStatus());
    peerCounts.push(status.peerCount);
  }

  const totalConnections = Math.max(...peerCounts);
  await dashboardPage.evaluate((count) => {
    window.updateDetail('peer-connections', count);
  }, totalConnections);

  testState.phases.phase1.status = 'success';
  await dashboardPage.evaluate(() => {
    window.updatePhaseStatus('phase1', 'success');
    window.addLog('✅ Phase 1 Complete: P2P Infrastructure Working', 'success');
  });

  log('Phase 1 completed successfully!', 'success');
  return testState.phases.phase1.browsers;
}

async function testPhase2(dashboardPage, browser1, browser2, peerIds) {
  await dashboardPage.evaluate(() => {
    window.updatePhaseStatus('phase2', 'running');
    window.addLog('🚀 Starting Phase 2: Chunk Transfer Protocol', 'info');
  });

  // Create test file
  const testContent = 'DWeb Network Test File - ' + Date.now();
  const testBlob = new Blob([testContent], { type: 'text/plain' });
  
  await dashboardPage.evaluate(() => {
    window.addLog('📦 Preparing test file...', 'info');
  });

  const manifest = await browser1.evaluate(async (content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], 'test.txt', { type: 'text/plain' });
    return await window.testPrepareFile(file);
  }, testContent);

  await dashboardPage.evaluate((data) => {
    window.updateDetail('test-file', `${data.name} (${data.size} bytes, ${data.chunks} chunks)`);
    window.addLog(`✅ File prepared: ${data.chunks} chunks`, 'success');
  }, { name: manifest.name, size: manifest.size, chunks: manifest.totalChunks });

  log(`Test file prepared: ${manifest.totalChunks} chunks`, 'success');

  // Transfer first chunk as test
  await dashboardPage.evaluate(() => {
    window.addLog('🔄 Testing chunk transfer...', 'info');
  });

  try {
    const chunkData = await browser2.evaluate(async (args) => {
      const data = await window.testRequestChunk(args.peerId, args.manifestId, 0);
      return { success: true, size: data.length };
    }, { peerId: peerIds[0], manifestId: manifest.id });

    await dashboardPage.evaluate((data) => {
      window.updateDetail('chunks-transferred', `1 / ${data.total}`);
      window.updateProgress(100 / data.total);
      window.addLog(`✅ Chunk 0 transferred: ${data.size} bytes`, 'success');
    }, { size: chunkData.size, total: manifest.totalChunks });

    log('Chunk transfer successful!', 'success');
    
    testState.phases.phase2.status = 'success';
    await dashboardPage.evaluate(() => {
      window.updatePhaseStatus('phase2', 'success');
      window.addLog('✅ Phase 2 Complete: Chunk Transfer Working', 'success');
    });
  } catch (error) {
    await dashboardPage.evaluate((msg) => {
      window.addLog(`⚠️ Chunk transfer: ${msg}`, 'warning');
      window.updatePhaseStatus('phase2', 'error');
    }, error.message);
    log('Chunk transfer failed: ' + error.message, 'error');
  }
}

async function testPhase3(dashboardPage, browser1, browser2) {
  await dashboardPage.evaluate(() => {
    window.updatePhaseStatus('phase3', 'running');
    window.addLog('🚀 Starting Phase 3: DHT Domain Registry', 'info');
  });

  // Check DHT status
  const dhtStatus = await browser1.evaluate(async () => {
    return await window.testDHTStatus();
  });

  await dashboardPage.evaluate((status) => {
    window.updateDetail('dht-status', status.enabled ? `Enabled (${status.peerCount} DHT peers)` : 'Disabled');
    window.addLog(`DHT Status: ${status.enabled ? 'Enabled' : 'Disabled'}, Peers: ${status.peerCount}`, 'info');
  }, dhtStatus);

  if (!dhtStatus.enabled) {
    await dashboardPage.evaluate(() => {
      window.addLog('⚠️ DHT not enabled', 'warning');
      window.updatePhaseStatus('phase3', 'error');
    });
    log('DHT not enabled', 'warning');
    return;
  }

  // Register test domain
  const testDomain = 'test-' + Date.now() + '.dweb';
  const testManifestId = 'manifest-' + Math.random().toString(36).substring(7);

  await dashboardPage.evaluate((domain) => {
    window.updateDetail('test-domain', domain);
    window.addLog(`📝 Registering domain: ${domain}`, 'info');
  }, testDomain);

  try {
    await browser1.evaluate(async (args) => {
      return await window.testRegisterDomain(args.domain, args.manifestId, {
        owner: 'playwright-test',
        description: 'Automated test domain'
      });
    }, { domain: testDomain, manifestId: testManifestId });

    await dashboardPage.evaluate(() => {
      window.addLog('✅ Domain registered in DHT', 'success');
    });
    log('Domain registered successfully', 'success');

    // Wait for DHT propagation
    await dashboardPage.evaluate(() => {
      window.addLog('⏳ Waiting for DHT propagation...', 'info');
    });
    await sleep(2000);

    // Resolve from other browser
    await dashboardPage.evaluate(() => {
      window.addLog('🔍 Resolving domain from Browser 2...', 'info');
    });

    const resolved = await browser2.evaluate(async (args) => {
      return await window.testResolveDomain(args.domain, 15000);
    }, { domain: testDomain });

    if (resolved.manifestId === testManifestId) {
      await dashboardPage.evaluate((id) => {
        window.updateDetail('domain-resolution', `✅ Resolved: ${id}`);
        window.addLog('✅ Domain resolution successful!', 'success');
        window.updatePhaseStatus('phase3', 'success');
        window.addLog('✅ Phase 3 Complete: DHT Working', 'success');
      }, testManifestId);
      
      testState.phases.phase3.status = 'success';
      log('Phase 3 completed successfully!', 'success');
    } else {
      throw new Error('Manifest ID mismatch');
    }
  } catch (error) {
    await dashboardPage.evaluate((msg) => {
      window.addLog(`⚠️ DHT test: ${msg}`, 'warning');
      window.updatePhaseStatus('phase3', 'error');
    }, error.message);
    log('Phase 3 failed: ' + error.message, 'error');
  }
}

async function main() {
  console.log('🧪 DWeb Hosting Network - Playwright Test with UI\n');

  // Check bootstrap server
  log('Checking bootstrap server...', 'progress');
  const bootstrapPeerId = getBootstrapPeerId();
  if (!bootstrapPeerId) {
    log('Bootstrap server not running!', 'error');
    log('Start it with: cd backend/bootstrap-node && node bootstrap-server.js', 'info');
    process.exit(1);
  }
  log(`Bootstrap found: ${bootstrapPeerId}`, 'success');

  // Launch browsers
  log('Launching browsers...', 'progress');
  
  const userDataDir = path.join(__dirname, '../.playwright-data');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ]
  });

  log('Browser launched, waiting for extension to load...', 'progress');
  await sleep(2000);

  // Get extension ID from service worker
  const extensionId = await getExtensionId(browser);
  if (!extensionId) {
    log('Failed to get extension ID!', 'error');
    process.exit(1);
  }
  log(`Extension ID: ${extensionId}`, 'success');

  // Open dashboard
  const dashboardPage = await browser.newPage();
  await dashboardPage.goto('about:blank');
  await createDashboard(dashboardPage);
  
  await dashboardPage.evaluate((peerId) => {
    window.updateDetail('bootstrap-status', `✅ Connected: ${peerId.substring(0, 30)}...`);
    window.addLog('🎯 Test dashboard initialized', 'success');
  }, bootstrapPeerId);

  // Open two browser panels
  const panel1 = await browser.newPage();
  await panel1.goto(`chrome-extension://${extensionId}/panel/index.html`);
  await panel1.waitForLoadState('networkidle');

  const panel2 = await browser.newPage();
  await panel2.goto(`chrome-extension://${extensionId}/panel/index.html`);
  await panel2.waitForLoadState('networkidle');

  log('Browsers ready', 'success');
  await sleep(1000);

  try {
    // Run tests
    const peerIds = await testPhase1(dashboardPage, panel1, panel2, bootstrapPeerId);
    await sleep(1000);
    
    await testPhase2(dashboardPage, panel1, panel2, peerIds.map(p => p.peerId));
    await sleep(1000);
    
    await testPhase3(dashboardPage, panel1, panel2);

    // Final summary
    await dashboardPage.evaluate(() => {
      window.addLog('═══════════════════════════════', 'info');
      window.addLog('🎉 All Tests Complete!', 'success');
      window.addLog('═══════════════════════════════', 'info');
    });

    log('\n🎉 All tests completed! Dashboard will remain open.', 'success');
    log('Press Ctrl+C to close...', 'info');

    // Keep browser open
    await new Promise(() => {});

  } catch (error) {
    log('Test failed: ' + error.message, 'error');
    await dashboardPage.evaluate((msg) => {
      window.addLog(`❌ Fatal error: ${msg}`, 'error');
    }, error.message);
  }
}

async function getExtensionId(browser) {
  // Wait for service worker to be registered
  const serviceWorkers = browser.serviceWorkers();
  if (serviceWorkers.length > 0) {
    const sw = serviceWorkers[0];
    const url = sw.url();
    const match = url.match(/chrome-extension:\/\/([a-zA-Z]+)\//);  
    if (match) return match[1];
  }
  
  // Alternative: Check background pages
  const backgroundPages = browser.backgroundPages();
  if (backgroundPages.length > 0) {
    const url = backgroundPages[0].url();
    const match = url.match(/chrome-extension:\/\/([a-zA-Z]+)\//);  
    if (match) return match[1];
  }
  
  // Wait a bit more and check contexts
  await sleep(1000);
  const contexts = browser.contexts();
  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      const url = page.url();
      if (url.includes('chrome-extension://')) {
        const match = url.match(/chrome-extension:\/\/([a-zA-Z]+)\//);  
        if (match) return match[1];
      }
    }
  }
  
  return null;
}

main().catch(console.error);
