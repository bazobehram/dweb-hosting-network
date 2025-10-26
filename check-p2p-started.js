const CDP = require('chrome-remote-interface');

async function checkP2PStarted() {
  try {
    const targets = await CDP.List();
    const panels = targets.filter(t => 
      t.url && t.url.includes('chrome-extension://') && t.url.includes('panel/index.html')
    );
    
    if (panels.length === 0) {
      console.log('❌ No panels found\n');
      return;
    }
    
    console.log(`\n✅ Found ${panels.length} panel(s). Checking P2P status...\n`);
    
    for (const panel of panels) {
      const client = await CDP({ target: panel.id });
      const { Runtime } = client;
      
      try {
        await Runtime.enable();
        
        const p2pCheck = await Runtime.evaluate({
          expression: `JSON.stringify({
            exists: !!window.p2pManager,
            isStarted: window.p2pManager?.isStarted || false,
            peerId: window.p2pManager?.peerId || null,
            peerCount: window.p2pManager?.peers?.size || 0,
            hasNode: !!window.p2pManager?.node,
            nodeStarted: window.p2pManager?.node?.isStarted?.() || false
          })`
        });
        
        if (p2pCheck.result?.value) {
          const status = JSON.parse(p2pCheck.result.value);
          
          console.log(`Panel: ${panel.id.substring(0, 16)}...`);
          console.log(`  Manager Exists: ${status.exists ? '✅' : '❌'}`);
          console.log(`  Is Started: ${status.isStarted ? '✅ YES' : '⚠️  NO'}`);
          console.log(`  Has Node: ${status.hasNode ? '✅' : '❌'}`);
          console.log(`  Peer ID: ${status.peerId || '(none)'}`);
          console.log(`  Connected Peers: ${status.peerCount}\n`);
          
          if (!status.isStarted && status.exists) {
            console.log('⚠️  P2P Manager exists but is NOT started!');
            console.log('   Checking auto-start configuration...\n');
            
            const autoStartCheck = await Runtime.evaluate({
              expression: `JSON.stringify({
                bgPeerToggleExists: !!document.getElementById('toggleBackgroundPeer'),
                bgPeerToggleChecked: document.getElementById('toggleBackgroundPeer')?.checked || false,
                testFnAvailable: typeof window.testLibp2pStart === 'function'
              })`
            });
            
            if (autoStartCheck.result?.value) {
              const config = JSON.parse(autoStartCheck.result.value);
              console.log(`   Background Peer Toggle: ${config.bgPeerToggleExists ? '✅' : '❌'}`);
              console.log(`   Toggle Checked: ${config.bgPeerToggleChecked ? '✅' : '❌'}`);
              console.log(`   Test Function: ${config.testFnAvailable ? '✅' : '❌'}\n`);
              
              if (!config.bgPeerToggleChecked) {
                console.log('ℹ️  Auto-start is DISABLED in settings');
                console.log('   Enable "Background Peer Service" in Settings tab\n');
              } else {
                console.log('⚠️  Auto-start should have run but P2P is not started');
                console.log('   This may indicate a startup error. Check browser console.\n');
              }
            }
          } else if (status.isStarted) {
            console.log('🎉 P2P Manager is RUNNING!');
            console.log(`   ✅ Peer ID: ${status.peerId}`);
            console.log(`   ✅ Connected to ${status.peerCount} peer(s)\n`);
          }
        }
        
      } catch (error) {
        console.error(`  Error: ${error.message}`);
      } finally {
        await client.close();
      }
    }
    
  } catch (error) {
    console.error('Check failed:', error.message);
  }
}

checkP2PStarted();
