const CDP = require('chrome-remote-interface');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testUIFinal() {
  console.log('🧪 Final Comprehensive UI Test\n');
  console.log('═'.repeat(60));
  
  let client;
  
  try {
    // Connect to extension panel
    const targets = await CDP.List();
    const extensionPanel = targets.find(t => 
      t.url && t.url.includes('chrome-extension://') && t.url.includes('panel/index.html')
    );
    
    if (!extensionPanel) {
      console.error('\n❌ No extension panel open');
      console.log('\n📋 Please open the DWeb extension panel first\n');
      process.exit(1);
    }
    
    console.log(`\n✅ Connected to panel: ${extensionPanel.id}`);
    console.log(`   URL: ${extensionPanel.url}\n`);
    
    client = await CDP({ target: extensionPanel.id });
    const { Runtime, Console } = client;
    
    await Console.enable();
    await Runtime.enable();
    
    // Capture all console messages
    const consoleMessages = [];
    Console.messageAdded(({ message }) => {
      consoleMessages.push({
        level: message.level,
        text: message.text,
        timestamp: new Date().toISOString()
      });
    });
    
    console.log('⏳ Waiting 3 seconds for P2P auto-start...\n');
    await sleep(3000);
    
    // Test 1: Check P2P Status
    console.log('📊 Test 1: P2P Manager Status');
    console.log('─'.repeat(60));
    
    const p2pStatus = await Runtime.evaluate({
      expression: `(function() {
        return {
          exists: !!window.p2pManager,
          isStarted: window.p2pManager?.isStarted || false,
          peerId: window.p2pManager?.peerId || null,
          peerCount: window.p2pManager?.peers?.size || 0,
          hasNode: !!window.p2pManager?.node,
          testFnAvailable: typeof window.testLibp2pStart === 'function'
        };
      })()`
    });
    
    const p2p = p2pStatus.result?.value || {};
    console.log(`   Manager Exists: ${p2p.exists ? '✅' : '❌'}`);
    console.log(`   Is Started: ${p2p.isStarted ? '✅' : '⚠️  NO'}`);
    console.log(`   Has Node: ${p2p.hasNode ? '✅' : '❌'}`);
    console.log(`   Peer ID: ${p2p.peerId || '(none)'}`);
    console.log(`   Connected Peers: ${p2p.peerCount}`);
    console.log(`   Test Function: ${p2p.testFnAvailable ? '✅' : '❌'}\n`);
    
    // Test 2: Check console for errors
    console.log('📊 Test 2: Console Log Analysis');
    console.log('─'.repeat(60));
    
    const errors = consoleMessages.filter(m => m.level === 'error');
    const warnings = consoleMessages.filter(m => m.level === 'warning');
    const p2pLogs = consoleMessages.filter(m => 
      m.text.includes('[P2P]') || m.text.includes('libp2p') || m.text.includes('Panel')
    );
    
    console.log(`   Errors: ${errors.length === 0 ? '✅ None' : `⚠️  ${errors.length}`}`);
    console.log(`   Warnings: ${warnings.length}`);
    console.log(`   P2P Logs: ${p2pLogs.length}\n`);
    
    if (errors.length > 0) {
      console.log('   Recent Errors:');
      errors.slice(-3).forEach(err => {
        console.log(`      - ${err.text}`);
      });
      console.log();
    }
    
    if (p2pLogs.length > 0) {
      console.log('   Recent P2P Logs:');
      p2pLogs.slice(-5).forEach(log => {
        console.log(`      ${log.text}`);
      });
      console.log();
    }
    
    // Test 3: Chunk Manager
    console.log('📊 Test 3: Chunk Manager');
    console.log('─'.repeat(60));
    
    const chunkStatus = await Runtime.evaluate({
      expression: `(function() {
        const cm = window.getChunkManager?.() || window.chunkManager;
        return {
          exists: !!cm,
          methods: cm ? {
            computeHash: typeof cm.computeHash === 'function',
            getChunk: typeof cm.getChunk === 'function',
            storeChunk: typeof cm.storeChunk === 'function',
            prepareTransfer: typeof cm.prepareTransfer === 'function'
          } : null
        };
      })()`
    });
    
    const chunk = chunkStatus.result?.value || {};
    console.log(`   Manager Exists: ${chunk.exists ? '✅' : '❌'}`);
    if (chunk.methods) {
      console.log(`   API Methods:`);
      console.log(`      computeHash: ${chunk.methods.computeHash ? '✅' : '❌'}`);
      console.log(`      getChunk: ${chunk.methods.getChunk ? '✅' : '❌'}`);
      console.log(`      storeChunk: ${chunk.methods.storeChunk ? '✅' : '❌'}`);
      console.log(`      prepareTransfer: ${chunk.methods.prepareTransfer ? '✅' : '❌'}`);
    }
    console.log();
    
    // Test 4: UI Elements
    console.log('📊 Test 4: UI Rendering');
    console.log('─'.repeat(60));
    
    const uiStatus = await Runtime.evaluate({
      expression: `(function() {
        return {
          bodyChildren: document.body.children.length,
          hasPanel: !!document.querySelector('.panel-shell'),
          hasSidebar: !!document.querySelector('.sidebar'),
          hasViews: document.querySelectorAll('.view').length,
          hasPublishBtn: !!document.getElementById('publishNewAppBtn'),
          hasDomainTable: !!document.getElementById('domainTable'),
          hasSettings: !!document.getElementById('view-settings')
        };
      })()`
    });
    
    const ui = uiStatus.result?.value || {};
    console.log(`   Body Children: ${ui.bodyChildren}`);
    console.log(`   Panel Shell: ${ui.hasPanel ? '✅' : '❌'}`);
    console.log(`   Sidebar: ${ui.hasSidebar ? '✅' : '❌'}`);
    console.log(`   Views: ${ui.hasViews}`);
    console.log(`   Publish Button: ${ui.hasPublishBtn ? '✅' : '❌'}`);
    console.log(`   Domain Table: ${ui.hasDomainTable ? '✅' : '❌'}`);
    console.log(`   Settings: ${ui.hasSettings ? '✅' : '❌'}\n`);
    
    // Test 5: Backend Connectivity
    console.log('📊 Test 5: Backend Services');
    console.log('─'.repeat(60));
    
    const backendTest = await Runtime.evaluate({
      expression: `(async function() {
        try {
          const response = await fetch('http://localhost:3000/api/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
          const data = await response.json();
          return { ok: true, status: data.status };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      })()`
    });
    
    if (backendTest.result?.objectId) {
      try {
        const result = await Runtime.awaitPromise({
          promiseObjectId: backendTest.result.objectId
        });
        const backend = result.result?.value || {};
        console.log(`   Backend Health: ${backend.ok ? `✅ ${backend.status}` : `❌ ${backend.error}`}\n`);
      } catch (err) {
        console.log(`   Backend Health: ❌ ${err.message}\n`);
      }
    }
    
    // Final Summary
    console.log('═'.repeat(60));
    console.log('📋 SUMMARY\n');
    
    const allGood = p2p.isStarted && chunk.exists && ui.hasPanel && errors.length === 0;
    
    if (allGood) {
      console.log('🎉 ✅ ALL SYSTEMS OPERATIONAL');
      console.log('   • P2P Manager: Running');
      console.log('   • Chunk Manager: Ready');
      console.log('   • UI: Loaded');
      console.log('   • Console: Clean\n');
      console.log('✅ The extension is fully functional and ready for user testing!\n');
    } else {
      console.log('⚠️  ISSUES DETECTED:\n');
      if (!p2p.isStarted) console.log('   ❌ P2P Manager not started');
      if (!chunk.exists) console.log('   ❌ Chunk Manager not initialized');
      if (!ui.hasPanel) console.log('   ❌ UI not rendered');
      if (errors.length > 0) console.log(`   ❌ ${errors.length} console errors`);
      
      console.log('\n📝 Recommendations:');
      if (!p2p.isStarted) {
        console.log('   1. Check console for P2P startup errors');
        console.log('   2. Verify bootstrap node is running');
        console.log('   3. Try manually: window.testLibp2pStart()');
      }
      console.log();
    }
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testUIFinal();
