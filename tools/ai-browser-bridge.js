#!/usr/bin/env node

/**
 * Autonomous AI-Browser Bridge
 * 
 * Connects to Chrome via CDP and autonomously:
 * - Monitors console logs, network, and DOM changes
 * - Detects errors and suggests fixes
 * - Executes commands (reload, evaluate scripts)
 * - Provides insights without manual intervention
 */

import CDP from 'chrome-remote-interface';
import { promises as fs } from 'fs';
import { join } from 'path';

const CONFIG = {
  host: 'localhost',
  port: 9222,
  logFile: join(process.cwd(), 'ai-bridge.log'),
  patchDir: join(process.cwd(), 'patches'),
};

class AIBrowserBridge {
  constructor() {
    this.client = null;
    this.errors = [];
    this.networkRequests = new Map();
    this.insights = [];
  }

  async connect() {
    console.log('[AI-Bridge] Connecting to Chrome DevTools Protocol...\n');
    
    try {
      // List all tabs
      const tabs = await CDP.List({ host: CONFIG.host, port: CONFIG.port });
      console.log('[AI-Bridge] Available tabs:');
      tabs.forEach((tab, i) => {
        console.log(`  [${i}] ${tab.title} - ${tab.url}`);
      });
      
      // Find extension panel or use first tab
      let targetTab = tabs.find(t => t.url.includes('chrome-extension://')) || tabs[0];
      console.log(`\n[AI-Bridge] Connecting to: ${targetTab.title}`);
      
      this.client = await CDP({ host: CONFIG.host, port: CONFIG.port, target: targetTab });
      const { Console, Network, Page, Runtime, DOM } = this.client;

      await Promise.all([
        Console.enable(),
        Network.enable(),
        Page.enable(),
        Runtime.enable(),
        DOM.enable(),
      ]);

      this.setupEventListeners();
      console.log('[AI-Bridge] ✓ Connected successfully');
      console.log('[AI-Bridge] Monitoring browser activity...\n');
      
      return true;
    } catch (error) {
      console.error('[AI-Bridge] Connection failed:', error.message);
      console.error('[AI-Bridge] Make sure Chrome is running with --remote-debugging-port=9222');
      return false;
    }
  }

  setupEventListeners() {
    const { Console, Network, Runtime, DOM } = this.client;

    // Console logs and errors
    Console.messageAdded(({ message }) => {
      this.handleConsoleMessage(message);
    });

    // Network events
    Network.requestWillBeSent(({ requestId, request }) => {
      this.networkRequests.set(requestId, { url: request.url, status: 'pending', timestamp: Date.now() });
    });

    Network.responseReceived(({ requestId, response }) => {
      const req = this.networkRequests.get(requestId);
      if (req) {
        req.status = response.status;
        if (response.status >= 400) {
          this.handleNetworkError(req, response);
        }
      }
    });

    Network.loadingFailed(({ requestId, errorText }) => {
      const req = this.networkRequests.get(requestId);
      if (req) {
        this.handleNetworkFailure(req, errorText);
      }
    });

    // Runtime errors
    Runtime.exceptionThrown(({ exceptionDetails }) => {
      this.handleRuntimeException(exceptionDetails);
    });

    // DOM mutations (throttled)
    let domChangeTimeout = null;
    DOM.documentUpdated(() => {
      clearTimeout(domChangeTimeout);
      domChangeTimeout = setTimeout(() => {
        this.analyzeDOMChanges();
      }, 1000);
    });
  }

  async logToFile(message) {
    try {
      await fs.appendFile(CONFIG.logFile, message + '\n');
    } catch {}
  }

  handleConsoleMessage(message) {
    const { level, text, url, line } = message;
    
    if (level === 'error') {
      this.errors.push({ type: 'console', text, url, line, timestamp: Date.now() });
      const log = `\n[ERROR] ${text}${url ? `\n  Location: ${url}:${line}` : ''}`;
      console.log(log);
      this.logToFile(`[${new Date().toISOString()}] ${log}`);
      
      this.analyzeError(text, url, line);
    } else if (level === 'warning') {
      console.log(`[WARN] ${text}`);
    } else if (process.env.VERBOSE) {
      console.log(`[LOG] ${text}`);
    }
  }

  handleNetworkError(request, response) {
    console.log(`\n[NETWORK ERROR] ${response.status} ${request.url}`);
    this.errors.push({ type: 'network', status: response.status, url: request.url, timestamp: Date.now() });
    this.suggestNetworkFix(request, response);
  }

  handleNetworkFailure(request, errorText) {
    console.log(`\n[NETWORK FAILED] ${request.url}`);
    console.log(`  Error: ${errorText}`);
    this.errors.push({ type: 'network-fail', url: request.url, error: errorText, timestamp: Date.now() });
  }

  handleRuntimeException(details) {
    const { exception, stackTrace } = details;
    const message = exception?.description || exception?.value || 'Unknown error';
    
    console.log(`\n[RUNTIME ERROR] ${message}`);
    if (stackTrace) {
      console.log('  Stack:', stackTrace.callFrames?.slice(0, 3).map(f => 
        `${f.functionName || '(anonymous)'}@${f.url}:${f.lineNumber}`
      ).join('\n    '));
    }
    
    this.errors.push({ type: 'runtime', message, stackTrace, timestamp: Date.now() });
    this.analyzeRuntimeError(message, stackTrace);
  }

  async analyzeError(text, url, line) {
    // Pattern matching for common errors
    const patterns = [
      {
        regex: /Cannot read propert(?:y|ies) of (null|undefined)/i,
        suggestion: 'Add null check before property access',
        fix: (match) => `Use optional chaining (?.) or check if ${match[1]} exists first`
      },
      {
        regex: /is not a function/i,
        suggestion: 'Function is undefined or not imported',
        fix: () => 'Verify the function is defined and properly imported'
      },
      {
        regex: /Failed to fetch|ERR_CONNECTION_REFUSED/i,
        suggestion: 'Service unavailable',
        fix: () => 'Check if the server is running and the URL is correct'
      },
      {
        regex: /Invalid stream/i,
        suggestion: 'Stream API mismatch detected',
        fix: () => 'Stream object missing .sink or .source properties - check libp2p stream API compatibility'
      },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const insight = {
          error: text,
          location: `${url}:${line}`,
          suggestion: pattern.suggestion,
          fix: pattern.fix(match),
          timestamp: Date.now(),
        };
        
        this.insights.push(insight);
        console.log(`\n[AI INSIGHT]`);
        console.log(`  Problem: ${pattern.suggestion}`);
        console.log(`  Fix: ${insight.fix}`);
        
        await this.generatePatch(insight);
        break;
      }
    }
  }

  analyzeRuntimeError(message, stackTrace) {
    if (message.includes('stream') && message.includes('closed')) {
      console.log('\n[AI INSIGHT] Stream timing issue detected');
      console.log('  Recommendation: Remove delays before writing to streams');
      console.log('  libp2p streams should be written to immediately after creation');
    }
  }

  suggestNetworkFix(request, response) {
    if (response.status === 404) {
      console.log(`[AI INSIGHT] Endpoint not found: ${request.url}`);
      console.log(`  Check if the route is correctly defined in your server`);
    } else if (response.status >= 500) {
      console.log(`[AI INSIGHT] Server error on ${request.url}`);
      console.log(`  Check server logs for the root cause`);
    }
  }

  async analyzeDOMChanges() {
    // Throttled DOM analysis
    if (this.errors.length > 10) {
      console.log('\n[AI INSIGHT] High error rate detected - consider debugging mode');
    }
  }

  async generatePatch(insight) {
    try {
      await fs.mkdir(CONFIG.patchDir, { recursive: true });
      
      const patchFile = join(CONFIG.patchDir, `fix-${Date.now()}.md`);
      const content = `# Auto-generated Fix Suggestion

**Error:** ${insight.error}
**Location:** ${insight.location}
**Detected:** ${new Date(insight.timestamp).toISOString()}

## Problem
${insight.suggestion}

## Suggested Fix
${insight.fix}

## Action Items
- [ ] Review the code at ${insight.location}
- [ ] Apply the suggested fix
- [ ] Test the changes
- [ ] Mark as resolved

---
Generated by AI-Browser Bridge
`;

      await fs.writeFile(patchFile, content);
      console.log(`  Patch saved: ${patchFile}`);
    } catch (error) {
      console.error('Failed to save patch:', error.message);
    }
  }

  async execute(command) {
    const { Runtime, Page } = this.client;
    
    switch (command.type) {
      case 'reload':
        console.log('[AI-Bridge] Reloading page...');
        await Page.reload();
        break;
        
      case 'eval':
        console.log(`[AI-Bridge] Executing: ${command.script}`);
        const result = await Runtime.evaluate({ expression: command.script, awaitPromise: true });
        if (result.exceptionDetails) {
          console.error('Execution failed:', result.exceptionDetails);
        } else {
          console.log('Result:', result.result?.value);
        }
        return result;
        
      case 'reload-extension':
        console.log('[AI-Bridge] Reloading extensions...');
        // Navigate to chrome://extensions and reload
        await this.execute({ type: 'eval', script: 'chrome.runtime.reload()' });
        break;
        
      default:
        console.warn('Unknown command:', command.type);
    }
  }

  async watchForPatterns() {
    // Autonomous monitoring loop
    setInterval(() => {
      const recentErrors = this.errors.filter(e => Date.now() - e.timestamp < 60000);
      
      if (recentErrors.length > 5) {
        console.log(`\n[AI-Bridge] ${recentErrors.length} errors in the last minute`);
        console.log('[AI-Bridge] Analyzing patterns...');
        
        // Group by type
        const byType = recentErrors.reduce((acc, err) => {
          acc[err.type] = (acc[err.type] || 0) + 1;
          return acc;
        }, {});
        
        console.log('[AI-Bridge] Error distribution:', byType);
        
        // Auto-actions based on patterns
        if (byType['network'] > 3) {
          console.log('[AI-Bridge] Network instability detected - consider checking backend');
        }
        
        if (byType['runtime'] > 3) {
          console.log('[AI-Bridge] Multiple runtime errors - consider adding defensive checks');
        }
      }
    }, 30000); // Every 30 seconds
  }

  async generateReport() {
    const report = {
      startTime: this.startTime,
      duration: Date.now() - this.startTime,
      totalErrors: this.errors.length,
      insights: this.insights.length,
      errorTypes: this.errors.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
      recentInsights: this.insights.slice(-5),
    };

    console.log('\n' + '='.repeat(60));
    console.log('[AI-Bridge] Session Report');
    console.log('='.repeat(60));
    console.log(`Duration: ${Math.round(report.duration / 1000)}s`);
    console.log(`Total Errors: ${report.totalErrors}`);
    console.log(`AI Insights: ${report.insights}`);
    console.log(`Error Types:`, report.errorTypes);
    console.log('='.repeat(60) + '\n');

    await fs.writeFile(CONFIG.logFile, JSON.stringify(report, null, 2));
    console.log(`Full report saved: ${CONFIG.logFile}`);
  }

  async disconnect() {
    if (this.client) {
      await this.generateReport();
      await this.client.close();
      console.log('[AI-Bridge] Disconnected');
    }
  }
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   AI-Browser Bridge via CDP           ║');
  console.log('║   Autonomous Error Detection & Fixes  ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Prerequisites:');
  console.log('  1. Chrome must be running with: --remote-debugging-port=9222');
  console.log('  2. Example: chrome.exe --remote-debugging-port=9222\n');

  const bridge = new AIBrowserBridge();
  bridge.startTime = Date.now();
  
  const connected = await bridge.connect();
  if (!connected) {
    process.exit(1);
  }

  // Start autonomous monitoring
  bridge.watchForPatterns();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n[AI-Bridge] Shutting down...');
    await bridge.disconnect();
    process.exit(0);
  });

  // Keep process alive
  process.stdin.resume();
}

main().catch(console.error);
