#!/usr/bin/env node

/**
 * Test two browsers discovering each other via bootstrap
 * 
 * Requirements:
 * 1. Bootstrap server running (monitor-bootstrap.js)
 * 2. Two browser instances with extension loaded
 * 3. Both panels open at panel/index.html
 */

import CDP from 'chrome-remote-interface';

async function testTwoBrowsers() {
  console.log('🧪 Two Browser Peer Discovery Test\n');
  console.log('Prerequisites:');
  console.log('  ✓ Bootstrap server running (check monitor window)');
  console.log('  ✓ Extension loaded in Chrome AND another browser');
  console.log('  ✓ Panel open in both browsers\n');
  console.log('─'.repeat(60));
  
  try {
    // Find all available tabs
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    
    // Find all panel tabs
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html'));
    
    console.log(`\n📍 Found ${panelTabs.length} panel tab(s):\n`);
    panelTabs.forEach((tab, i) => {
      console.log(`  [${i}] ${tab.title}`);
      console.log(`      ${tab.url}`);
    });
    
    if (panelTabs.length < 2) {
      console.log('\n❌ Need at least 2 panel tabs open!');
      console.log('\nHow to fix:');
      console.log('  1. Open Chrome with extension');
      console.log('  2. Open panel: chrome-extension://<id>/panel/index.html');
      console.log('  3. Open Brave/Edge with same extension');
      console.log('  4. Open panel in second browser too');
      console.log('  5. Run this test again\n');
      process.exit(1);
    }
    
    console.log('\n✓ Found 2+ panels, proceeding...\n');
    console.log('─'.repeat(60));
    
    // Connect to both panels
    const clients = [];
    for (let i = 0; i < Math.min(2, panelTabs.length); i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[i] });
      await client.Runtime.enable();
      clients.push({ client, tab: panelTabs[i], index: i });
    }
    
    console.log('\n📡 Step 1: Starting libp2p on both browsers...\n');
    
    // Current bootstrap peer ID (check bootstrap-server.log for updates)
    const BOOTSTRAP_PEER_ID = '12D3KooWDXTE4tnLNrJ7vCkHkpk9SKwnBocBpcCWwKqU3s36YKkH';
    const bootstrapAddr = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP_PEER_ID}`;
    
    for (const { client, index } of clients) {
      console.log(`  Browser ${index + 1}: Starting libp2p...`);
      
      // Stop if already running
      await client.Runtime.evaluate({
        expression: 'window.testLibp2pStop && window.testLibp2pStop()',
        awaitPromise: true
      });
      
      await new Promise(r => setTimeout(r, 500));
      
      // Start with bootstrap
      const result = await client.Runtime.evaluate({
        expression: `
          (async () => {
            try {
              await window.testLibp2pStart('${bootstrapAddr}');
              return { success: true };
            } catch (error) {
              return { error: error.message };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      if (result.result?.value?.error) {
        console.log(`  ❌ Failed: ${result.result.value.error}`);
      } else {
        console.log(`  ✓ Started`);
      }
    }
    
    console.log('\n⏳ Waiting 5 seconds for bootstrap connections...\n');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('📊 Step 2: Checking connection status...\n');
    
    const statuses = [];
    for (const { client, index } of clients) {
      const statusResult = await client.Runtime.evaluate({
        expression: `
          (() => {
            if (!window.p2pManager) return { error: 'Not started' };
            
            const status = window.p2pManager.getStatus();
            const node = window.p2pManager.node;
            const connections = node ? node.getConnections() : [];
            
            return {
              peerId: status.peerId,
              isStarted: status.isStarted,
              peerCount: status.peerCount,
              connectionCount: connections.length,
              connections: connections.map(c => ({
                peer: c.remotePeer.toString(),
                status: c.status
              }))
            };
          })()
        `,
        returnByValue: true
      });
      
      const status = statusResult.result?.value;
      statuses.push(status);
      
      console.log(`  Browser ${index + 1}:`);
      console.log(`    Peer ID: ${status?.peerId || 'N/A'}`);
      console.log(`    Connections: ${status?.connectionCount || 0}`);
      if (status?.connections?.length > 0) {
        status.connections.forEach(c => {
          console.log(`      → ${c.peer} [${c.status}]`);
        });
      }
    }
    
    console.log('\n🔄 Step 3: Forcing peer exchange on both...\n');
    
    for (const { client, index } of clients) {
      console.log(`  Browser ${index + 1}: Requesting peer exchange...`);
      
      const exchangeResult = await client.Runtime.evaluate({
        expression: `
          (async () => {
            try {
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'two-browser-test', 
                force: true 
              });
              return { success: true };
            } catch (error) {
              return { error: error.message };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      if (exchangeResult.result?.value?.success) {
        console.log(`  ✓ Exchange completed`);
      } else {
        console.log(`  ⚠️  ${exchangeResult.result?.value?.error || 'Unknown error'}`);
      }
    }
    
    console.log('\n⏳ Waiting 3 seconds for peer discovery...\n');
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('🎯 Step 4: Final status check...\n');
    
    for (const { client, index } of clients) {
      const finalResult = await client.Runtime.evaluate({
        expression: `
          (() => {
            if (!window.p2pManager) return { error: 'Not started' };
            
            const status = window.p2pManager.getStatus();
            const node = window.p2pManager.node;
            const connections = node ? node.getConnections() : [];
            const allPeers = Array.from(node ? node.getPeers() : []).map(p => p.toString());
            
            return {
              peerId: status.peerId,
              peerCount: status.peerCount,
              connectionCount: connections.length,
              allPeers: allPeers,
              connections: connections.map(c => ({
                peer: c.remotePeer.toString(),
                status: c.status
              }))
            };
          })()
        `,
        returnByValue: true
      });
      
      const final = finalResult.result?.value;
      
      console.log(`  Browser ${index + 1} (${final?.peerId?.slice(0, 20)}...):`);
      console.log(`    Known peers: ${final?.allPeers?.length || 0}`);
      console.log(`    Active connections: ${final?.connectionCount || 0}`);
      
      if (final?.connections?.length > 0) {
        console.log(`    Connections:`);
        final.connections.forEach(c => {
          const isBootstrap = c.peer.includes('12D3KooWGjn6xyp4p7Ks5MY5uQA6eEGhBv3sKby3BQwoDmPkqvDD');
          const emoji = isBootstrap ? '🔷' : '👤';
          console.log(`      ${emoji} ${c.peer.slice(0, 30)}... [${c.status}]`);
        });
      }
      
      if (final?.allPeers?.length > 0) {
        console.log(`    Known peer IDs:`);
        final.allPeers.forEach(p => {
          const isBootstrap = p.includes('12D3KooWGjn6xyp4p7Ks5MY5uQA6eEGhBv3sKby3BQwoDmPkqvDD');
          const emoji = isBootstrap ? '🔷' : '👤';
          console.log(`      ${emoji} ${p}`);
        });
      }
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log('\n📊 Test Results:\n');
    
    // Check if browsers see each other
    const browser1Peers = statuses[0]?.peerId;
    const browser2Peers = statuses[1]?.peerId;
    
    if (statuses[0]?.peerCount > 1 || statuses[1]?.peerCount > 1) {
      console.log('✅ SUCCESS: Browsers discovered each other!');
      console.log('   Browser 1 sees:', statuses[0]?.peerCount, 'peer(s)');
      console.log('   Browser 2 sees:', statuses[1]?.peerCount, 'peer(s)');
    } else if (statuses[0]?.connectionCount > 0 && statuses[1]?.connectionCount > 0) {
      console.log('⚠️  PARTIAL: Both connected to bootstrap');
      console.log('   But not discovering each other yet');
      console.log('   Check bootstrap monitor for peer exchange logs');
    } else {
      console.log('❌ FAILED: Browsers not connecting properly');
    }
    
    console.log('\n💡 Check bootstrap monitor window for peer exchange activity!');
    console.log('   Look for:');
    console.log('   🔄 [Bootstrap] Peer exchange request from...');
    console.log('   📊 [Bootstrap] Stream type: ...');
    console.log('   💬 [Bootstrap] Sending response to...\n');
    
    // Close clients
    for (const { client } of clients) {
      await client.close();
    }
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

testTwoBrowsers();
