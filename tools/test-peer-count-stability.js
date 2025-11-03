#!/usr/bin/env node

/**
 * Simple Peer Count Stability Test
 * 
 * Verifies that peer count remains stable when a peer re-registers (refresh)
 */

import WebSocket from 'ws';

const SIGNALING_URL = 'ws://localhost:8787';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectAndRegister(peerId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SIGNALING_URL);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'register',
        peerId,
        capabilities: ['webrtc']
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'registered') {
        ws.peerId = peerId;
        resolve({ ws, peerCount: message.peers.length });
      }
    });
    
    ws.on('error', reject);
    
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

async function getPeerCount(ws) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'peer-list') {
        ws.off('message', handler);
        resolve(message.peers.length);
      }
    };
    
    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'peer-list-request' }));
    
    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Peer list timeout'));
    }, 5000);
  });
}

async function main() {
  console.log('🧪 Peer Count Stability Test');
  console.log('='.repeat(60));
  
  try {
    const testId = Date.now();
    const peer1Id = `peer1-${testId}`;
    const peer2Id = `peer2-${testId}`;
    
    // Step 1: Connect Peer 1
    console.log('\n📡 Step 1: Peer 1 connects...');
    const { ws: ws1, peerCount: initial1 } = await connectAndRegister(peer1Id);
    console.log(`   Connected. Sees ${initial1} other peer(s)`);
    
    // Step 2: Connect Peer 2
    console.log('\n📡 Step 2: Peer 2 connects...');
    const { ws: ws2, peerCount: initial2 } = await connectAndRegister(peer2Id);
    console.log(`   Connected. Sees ${initial2} other peer(s) (including Peer 1)`);
    
    // Wait for propagation
    await sleep(1000);
    
    // Step 3: Check Peer 1's view (should now see Peer 2)
    console.log('\n🔍 Step 3: Checking Peer 1\'s updated view...');
    const afterPeer2Join = await getPeerCount(ws1);
    console.log(`   Peer 1 now sees ${afterPeer2Join} other peer(s)`);
    
    // Step 4: Peer 1 refreshes (re-registers)
    console.log('\n🔄 Step 4: Peer 1 refreshes (re-registers)...');
    const { ws: ws1New, peerCount: afterRefresh1 } = await connectAndRegister(peer1Id);
    console.log(`   Re-registered. Sees ${afterRefresh1} other peer(s)`);
    
    // Wait for old connection cleanup
    await sleep(1000);
    
    // Step 5: Check Peer 2's view (should NOT increase)
    console.log('\n🔍 Step 5: Checking Peer 2\'s view after Peer 1 refresh...');
    const afterRefreshFromPeer2 = await getPeerCount(ws2);
    console.log(`   Peer 2 sees ${afterRefreshFromPeer2} other peer(s)`);
    
    // Analysis
    console.log('\n' + '='.repeat(60));
    console.log('📊 ANALYSIS:');
    console.log('─'.repeat(60));
    
    const expected = afterPeer2Join; // Should stay same
    const actual = afterRefreshFromPeer2;
    
    console.log(`   Before Peer 1 refresh: ${afterPeer2Join} peer(s)`);
    console.log(`   After Peer 1 refresh:  ${actual} peer(s)`);
    
    if (actual === expected) {
      console.log('\n✅ PASS: Peer count remained stable!');
      console.log('   No duplicate peers created on refresh');
    } else if (actual > expected) {
      console.log(`\n❌ FAIL: Peer count increased by ${actual - expected}`);
      console.log('   Old connections may not be closed properly');
    } else {
      console.log(`\n⚠️  UNEXPECTED: Peer count decreased by ${expected - actual}`);
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    ws1.close();
    ws1New.close();
    ws2.close();
    
    console.log('='.repeat(60));
    console.log('✅ Test complete\n');
    
    process.exit(actual === expected ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
    process.exit(1);
  }
}

main();
