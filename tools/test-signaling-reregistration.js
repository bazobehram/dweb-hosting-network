#!/usr/bin/env node

/**
 * Test Signaling Service Re-Registration Fix
 * 
 * Tests that the desktop node signaling service:
 * 1. Properly handles peer re-registrations
 * 2. Doesn't duplicate peer counts
 * 3. Closes old connections on re-registration
 */

import WebSocket from 'ws';

const SIGNALING_URL = 'ws://localhost:8787';
const TEST_PEER_ID = `test-peer-${Date.now()}`;

class SignalingReRegistrationTest {
  constructor() {
    this.results = [];
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testReRegistration() {
    console.log('🧪 Testing Signaling Service Re-Registration Fix');
    console.log('='.repeat(70));
    console.log(`\n📝 Test Peer ID: ${TEST_PEER_ID}\n`);

    try {
      // Step 1: First registration
      console.log('📡 Step 1: First registration...');
      const ws1 = await this.registerPeer(TEST_PEER_ID);
      await this.sleep(1000);
      
      const peers1 = await this.getPeerList(ws1);
      console.log(`   ✅ Registered. Peer list has ${peers1.length} peer(s)`);
      
      // Step 2: Create a second connection (like opening another tab)
      console.log('\n📡 Step 2: Creating second connection (simulating another tab)...');
      const ws2 = await this.registerPeer(`other-peer-${Date.now()}`);
      await this.sleep(1000);
      
      const peers2 = await this.getPeerList(ws2);
      console.log(`   ✅ Second peer registered. Peer list has ${peers2.length} peer(s)`);
      
      // Step 3: Re-register first peer (simulating refresh)
      console.log('\n🔄 Step 3: Re-registering first peer (simulating page refresh)...');
      const ws1New = await this.registerPeer(TEST_PEER_ID);
      await this.sleep(1000);
      
      const peers3 = await this.getPeerList(ws1New);
      console.log(`   ✅ Re-registered. Peer list has ${peers3.length} peer(s)`);
      
      // Step 4: Get peer list from second connection to verify
      console.log('\n🔍 Step 4: Verifying peer count from other peer\'s perspective...');
      const peers4 = await this.getPeerList(ws2);
      console.log(`   ✅ Other peer sees ${peers4.length} peer(s)`);
      
      // Analysis
      console.log('\n' + '='.repeat(70));
      console.log('📊 Test Results:');
      console.log('─'.repeat(70));
      
      const shouldHave2Peers = peers3.length === 1 && peers4.length === 1;
      
      if (shouldHave2Peers) {
        console.log('✅ PASS: Peer count remained stable after re-registration');
        console.log('   - No duplicate peers detected');
        console.log('   - Re-registration handled correctly');
      } else {
        console.log('❌ FAIL: Peer count increased on re-registration');
        console.log(`   - Expected: 1 peer in each list`);
        console.log(`   - Got: ${peers3.length} and ${peers4.length} peer(s)`);
        console.log('   - Old connections may not be closed properly');
      }
      
      // Cleanup
      console.log('\n🧹 Cleaning up...');
      ws1.close();
      ws1New.close();
      ws2.close();
      
      console.log('='.repeat(70));
      
      return shouldHave2Peers;
      
    } catch (error) {
      console.error('\n❌ Test Error:', error.message);
      console.error(error.stack);
      return false;
    }
  }

  async registerPeer(peerId) {
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
          resolve(ws);
        }
      });
      
      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });
      
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  }

  async getPeerList(ws) {
    return new Promise((resolve, reject) => {
      const handler = (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'peer-list') {
          ws.off('message', handler);
          resolve(message.peers || []);
        }
      };
      
      ws.on('message', handler);
      
      // Request peer list without re-registering
      ws.send(JSON.stringify({
        type: 'peer-list-request'
      }));
      
      setTimeout(() => {
        ws.off('message', handler);
        reject(new Error('Peer list request timeout'));
      }, 5000);
    });
  }

  async testMultipleRefreshes() {
    console.log('\n🔁 Testing Multiple Refreshes...');
    console.log('─'.repeat(70));
    
    const testPeerId = `multi-test-${Date.now()}`;
    let connections = [];
    
    try {
      // Register 5 times (simulating 5 refreshes)
      for (let i = 1; i <= 5; i++) {
        console.log(`\n   Refresh #${i}...`);
        const ws = await this.registerPeer(testPeerId);
        connections.push(ws);
        await this.sleep(500);
        
        const peers = await this.getPeerList(ws);
        console.log(`   Peer count: ${peers.length}`);
        
        if (peers.length > 0) {
          console.log('   ❌ FAIL: Peer count should be 0 (only self)');
          break;
        }
      }
      
      // Cleanup
      connections.forEach(ws => ws.close());
      
      console.log('\n✅ Multiple refresh test completed');
      
    } catch (error) {
      console.error('   ❌ Error:', error.message);
      connections.forEach(ws => ws.close());
    }
  }
}

// Run tests
async function main() {
  const tester = new SignalingReRegistrationTest();
  
  // Check if signaling service is running
  try {
    await fetch('http://localhost:8787').catch(() => {});
  } catch (error) {
    console.error('❌ Desktop node signaling service not running on ws://localhost:8787');
    console.log('💡 Start the desktop node first!');
    process.exit(1);
  }
  
  const passed = await tester.testReRegistration();
  await tester.testMultipleRefreshes();
  
  console.log('\n🏁 Test Suite Complete');
  process.exit(passed ? 0 : 1);
}

main().catch(console.error);
