#!/usr/bin/env node

import { createFromPrivKey } from '@libp2p/peer-id-factory';
import { unmarshalPrivateKey } from '@libp2p/crypto/keys';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';

// Same fixed key from bootstrap server
const FIXED_PRIVATE_KEY = 'CAESQI3vQ2LLqJKvVxJnqZnClw3N1j5s6n0KWfGPJmzOmTx8YLuXGOSfnl0M0BVJzPmKWJxd3xYBYbHlJQT3hKDMJEs=';

async function calculatePeerId() {
  try {
    const privateKeyBytes = uint8ArrayFromString(FIXED_PRIVATE_KEY, 'base64pad');
    const privateKey = unmarshalPrivateKey(privateKeyBytes);
    const peerId = await createFromPrivKey(privateKey);
    
    console.log('✅ Bootstrap Peer ID (FIXED):\n');
    console.log(`   ${peerId.toString()}`);
    console.log('\n📋 Full multiaddr:');
    console.log(`   /dns4/localhost/tcp/9104/ws/p2p/${peerId.toString()}`);
    console.log('\n💾 Save this for your tests - it will NEVER change!\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

calculatePeerId();
