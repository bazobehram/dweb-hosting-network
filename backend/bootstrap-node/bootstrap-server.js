/**
 * DWeb Bootstrap Node
 * 
 * A libp2p node that runs on VPS to facilitate peer discovery
 * and provide WebRTC signaling via circuit relay.
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';

const LISTEN_PORT = process.env.LIBP2P_PORT || 9090;
const WEBSOCKET_PORT = process.env.LIBP2P_WS_PORT || 9091;

console.log('[Bootstrap] Starting DWeb Bootstrap Node...');

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${LISTEN_PORT}`,
        `/ip4/0.0.0.0/tcp/${WEBSOCKET_PORT}/ws`
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 100
        }
      })
    },
    connectionManager: {
      minConnections: 0,
      maxConnections: 100
    }
  });

  await node.start();
  
  console.log('[Bootstrap] Node started successfully!');
  console.log('[Bootstrap] Peer ID:', node.peerId.toString());
  console.log('[Bootstrap] Listening on:');
  
  node.getMultiaddrs().forEach((addr) => {
    console.log('  -', addr.toString());
  });

  // Log peer connections
  node.addEventListener('peer:connect', (event) => {
    console.log('[Bootstrap] Peer connected:', event.detail.toString());
    console.log('[Bootstrap] Total peers:', node.getPeers().length);
  });

  node.addEventListener('peer:disconnect', (event) => {
    console.log('[Bootstrap] Peer disconnected:', event.detail.toString());
    console.log('[Bootstrap] Total peers:', node.getPeers().length);
  });

  // Periodic status log
  setInterval(() => {
    const peers = node.getPeers();
    console.log(`[Bootstrap] Status: ${peers.length} connected peer(s)`);
  }, 30000); // Every 30 seconds

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Bootstrap] Shutting down...');
    await node.stop();
    console.log('[Bootstrap] Node stopped');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[Bootstrap] Fatal error:', error);
  process.exit(1);
});
