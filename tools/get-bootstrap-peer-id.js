#!/usr/bin/env node

/**
 * Get the bootstrap server's Peer ID
 * Makes a simple connection to see what peer ID responds
 */

import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';

async function getBootstrapPeerId() {
  console.log('🔍 Detecting Bootstrap Peer ID...\n');
  
  try {
    // Create minimal libp2p node
    const node = await createLibp2p({
      addresses: { listen: [] },
      transports: [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [mplex()]
    });
    
    await node.start();
    console.log('✓ Temporary node started\n');
    
    // Try to connect to bootstrap
    const bootstrapAddr = '/dns4/localhost/tcp/9104/ws';
    console.log(`Connecting to: ${bootstrapAddr}`);
    
    try {
      const connection = await node.dial(bootstrapAddr);
      const peerId = connection.remotePeer.toString();
      
      console.log('\n✅ Bootstrap Peer ID:', peerId);
      console.log('\n📋 Full multiaddr:');
      console.log(`   ${bootstrapAddr}/p2p/${peerId}`);
      
      console.log('\n💡 Use this in your code:');
      console.log(`   const BOOTSTRAP_PEER_ID = '${peerId}';`);
      console.log(`   const BOOTSTRAP_ADDR = '/dns4/localhost/tcp/9104/ws/p2p/${peerId}';`);
      
      await connection.close();
    } catch (dialError) {
      console.error('\n❌ Could not connect to bootstrap:', dialError.message);
      console.error('\nMake sure bootstrap server is running!');
    }
    
    await node.stop();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

getBootstrapPeerId();
