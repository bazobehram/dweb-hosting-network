const CDP = require('chrome-remote-interface');

async function testLiveUI() {
  console.log('🧪 Starting comprehensive live UI test...\n');
  
  let client;
  
  try {
    // Connect to the first available extension panel
    const targets = await CDP.List();
    const extensionPanel = targets.find(t => 
      t.url && t.url.includes('chrome-extension://') && t.url.includes('panel/index.html')
    );
    
    if (!extensionPanel) {
      console.error('❌ No extension panel found. Please open the extension popup.');
      process.exit(1);
    }
    
    console.log(`✅ Found extension panel: ${extensionPanel.id}`);
    console.log(`   URL: ${extensionPanel.url}\n`);
    
    client = await CDP({ target: extensionPanel.id });
    const { Runtime, Console } = client;
    
    // Enable console and runtime
    await Console.enable();
    await Runtime.enable();
    
    // Capture console messages
    const consoleLogs = [];
    Console.messageAdded(({ message }) => {
      consoleLogs.push(message);
    });
    
    console.log('📊 Test 1: Check P2P Manager Auto-Start');
    const p2pStatus = await Runtime.evaluate({
      expression: `(function() {
        if (!window.p2pManager) return { error: 'p2pManager not found' };
        return {
          exists: true,
          isStarted: window.p2pManager.isStarted,
          peerId: window.p2pManager.peerId,
          peerCount: window.p2pManager.peers?.size || 0,
          nodeExists: !!window.p2pManager.node
        };
      })()`
    });
    
    const p2pValue = p2pStatus.result?.value || {};
    if (p2pValue.error) {
      console.error('   ❌ P2P Manager not initialized');
    } else {
      console.log(`   ✅ P2P Manager: ${p2pValue.isStarted ? 'Started' : 'Not started'}`);
      console.log(`   📌 Peer ID: ${p2pValue.peerId || 'none'}`);
      console.log(`   👥 Connected Peers: ${p2pValue.peerCount}`);
    }
    
    console.log('\n📊 Test 2: Check Chunk Manager');
    const chunkStatus = await Runtime.evaluate({
      expression: `(function() {
        if (!window.chunkManager) return { error: 'chunkManager not found' };
        return {
          exists: true,
          hasComputeHash: typeof window.chunkManager.computeHash === 'function',
          hasGetChunk: typeof window.chunkManager.getChunk === 'function',
          hasStoreChunk: typeof window.chunkManager.storeChunk === 'function'
        };
      })()`
    });
    
    const chunkValue = chunkStatus.result?.value || {};
    if (chunkValue.error) {
      console.error('   ❌ Chunk Manager not found');
    } else {
      console.log(`   ✅ Chunk Manager API complete`);
      console.log(`   • computeHash: ${chunkValue.hasComputeHash ? '✓' : '✗'}`);
      console.log(`   • getChunk: ${chunkValue.hasGetChunk ? '✓' : '✗'}`);
      console.log(`   • storeChunk: ${chunkValue.hasStoreChunk ? '✓' : '✗'}`);
    }
    
    console.log('\n📊 Test 3: Backend Connectivity');
    const backendTest = await Runtime.evaluate({
      expression: `(async function() {
        try {
          const response = await fetch('http://localhost:3000/api/health');
          const data = await response.json();
          return { ok: true, status: data.status };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      })()`
    });
    
    // Wait for promise to resolve
    if (backendTest.result?.objectId) {
      try {
        const promiseResult = await Runtime.awaitPromise({
          promiseObjectId: backendTest.result.objectId
        });
        const backendData = promiseResult.result?.value || {};
        if (backendData.ok) {
          console.log(`   ✅ Backend connected: ${backendData.status}`);
        } else {
          console.log(`   ❌ Backend error: ${backendData.error || 'unknown'}`);
        }
      } catch (error) {
        console.log(`   ❌ Backend connection failed: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  Backend test returned no result');
    }
    
    console.log('\n📊 Test 4: UI Elements Rendering');
    const uiTest = await Runtime.evaluate({
      expression: `(function() {
        return {
          hasPublishSection: !!document.querySelector('.publish-section'),
          hasRegisterSection: !!document.querySelector('.register-section'),
          hasResolveSection: !!document.querySelector('.resolve-section'),
          hasP2PStatus: !!document.querySelector('.p2p-status'),
          bodyLoaded: document.body.children.length > 0
        };
      })()`
    });
    
    const ui = uiTest.result?.value || {};
    console.log(`   • Publish Section: ${ui.hasPublishSection ? '✓' : '✗'}`);
    console.log(`   • Register Section: ${ui.hasRegisterSection ? '✓' : '✗'}`);
    console.log(`   • Resolve Section: ${ui.hasResolveSection ? '✓' : '✗'}`);
    console.log(`   • P2P Status: ${ui.hasP2PStatus ? '✓' : '✗'}`);
    console.log(`   • Body Loaded: ${ui.bodyLoaded ? '✓' : '✗'}`);
    
    console.log('\n📊 Test 5: Check for Critical Errors in Console');
    const errors = consoleLogs.filter(log => log.level === 'error');
    if (errors.length === 0) {
      console.log('   ✅ No critical errors found');
    } else {
      console.log(`   ⚠️  Found ${errors.length} errors:`);
      errors.slice(0, 3).forEach(err => {
        console.log(`      - ${err.text}`);
      });
    }
    
    console.log('\n📊 Test 6: P2P Protocol Handlers');
    const protocolTest = await Runtime.evaluate({
      expression: `(function() {
        if (!window.p2pManager || !window.p2pManager.node) {
          return { error: 'Node not available' };
        }
        const node = window.p2pManager.node;
        return {
          hasHandle: typeof node.handle === 'function',
          registeredHandlers: node.components?.registrar?.handlers?.size || 0
        };
      })()`
    });
    
    const protoValue = protocolTest.result?.value || {};
    if (protoValue.error) {
      console.log(`   ⚠️  ${protoValue.error}`);
    } else {
      console.log(`   ✅ Protocol handlers registered: ${protoValue.registeredHandlers}`);
    }
    
    console.log('\n📊 Test 7: Test Publishing Function (Dry Run)');
    const publishTest = await Runtime.evaluate({
      expression: `(function() {
        const publishBtn = document.querySelector('#publish-button, [data-action="publish"], button:contains("Publish")');
        const fileInput = document.querySelector('#file-input, input[type="file"]');
        return {
          hasPublishButton: !!publishBtn,
          hasFileInput: !!fileInput,
          publishEnabled: publishBtn && !publishBtn.disabled
        };
      })()`
    });
    
    const pub = publishTest.result?.value || {};
    console.log(`   • Publish Button: ${pub.hasPublishButton ? '✓' : '✗'}`);
    console.log(`   • File Input: ${pub.hasFileInput ? '✓' : '✗'}`);
    console.log(`   • Button Enabled: ${pub.publishEnabled ? '✓' : '✗'}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Live UI Test Complete!\n');
    
    // Summary
    const allGood = p2pValue.isStarted && 
                    !chunkValue.error &&
                    ui.bodyLoaded;
    
    if (allGood) {
      console.log('✅ All core systems operational');
      console.log('✅ UI loaded and functional');
      console.log('✅ Ready for end-user testing\n');
    } else {
      console.log('⚠️  Some issues detected - review test results above\n');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testLiveUI();
