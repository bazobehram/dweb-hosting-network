/**
 * DWeb Bootstrap Node
 *
 * A libp2p node for peer discovery and circuit relay over WebSockets.
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { kadDHT } from '@libp2p/kad-dht';
import { autoNAT } from '@libp2p/autonat';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import { ping } from '@libp2p/ping';

const WEBSOCKET_PORT = process.env.LIBP2P_WS_PORT || 9104;
const PEER_EXCHANGE_PROTOCOL = '/dweb/peer-exchange/1.0.0';

console.log('[Bootstrap] Starting DWeb Bootstrap Node...');

async function main () {
  const node = await createLibp2p({
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${WEBSOCKET_PORT}/ws`
      ],
      announce: [
        `/ip4/127.0.0.1/tcp/${WEBSOCKET_PORT}/ws`
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: { maxReservations: 100 }
      }),
      dht: kadDHT({ clientMode: false }),
      autoNAT: autoNAT(),
      ping: ping()
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
    const s = addr.toString();
    console.log('  -', s);
    try {
      if (s.includes('/ip4/127.0.0.1/') && s.includes('/ws/')) {
        console.log('  -', s.replace('/ip4/127.0.0.1/', '/dns4/localhost/'));
      }
    } catch {}
  });

  // Respond to peer-exchange requests from browsers
  console.log(`[Bootstrap] Registering protocol handler: ${PEER_EXCHANGE_PROTOCOL}`);
  
  await node.handle(PEER_EXCHANGE_PROTOCOL, async (stream) => {
    console.log('[Bootstrap] === PROTOCOL HANDLER CALLED ===');
    console.log('[Bootstrap] Stream:', stream.constructor?.name);
    console.log('[Bootstrap] Stream direction:', stream.direction);
    console.log('[Bootstrap] Stream status:', stream.status);
    
    try {
      // In libp2p v3, connection info is on stream.connection or stream metadata
      const requesterId = stream.connection?.remotePeer?.toString() || 'unknown';
      console.log(`[Bootstrap] Peer exchange request from ${requesterId}`);
      console.log('[Bootstrap] Stream type:', stream?.constructor?.name);
      console.log('[Bootstrap] Stream properties:', Object.keys(stream || {}));
      
      // Read the request
      let requestData = null;
      // Check if stream has source property (standard libp2p stream)
      if (stream.source) {
        console.log('[Bootstrap] Reading via stream.source');
        const decoder = lp.decode();
        for await (const msg of decoder(stream.source)) {
          requestData = JSON.parse(msg.toString());
          console.log(`[Bootstrap] Request data (via source):`, requestData);
          break;
        }
      } else {
        console.log('[Bootstrap] Reading via direct iteration');
        // Direct iteration for MplexStream
        for await (const msg of lp.decode(stream)) {
          // msg is a Uint8Array, need to decode it properly
          const textDecoder = new TextDecoder();
          const jsonStr = textDecoder.decode(msg.subarray ? msg.subarray() : msg);
          console.log('[Bootstrap] Decoded message:', jsonStr);
          requestData = JSON.parse(jsonStr);
          console.log(`[Bootstrap] Request data (direct):`, requestData);
          break;
        }
      }
      // Build relay addrs for other peers via this node's WS addr
      const wsAddr = node.getMultiaddrs().find(ma => ma.toString().includes('/ws'));
      const base = wsAddr ? wsAddr.toString() : null;
      const dnsBase = base && base.includes('/ip4/127.0.0.1/')
        ? base.replace('/ip4/127.0.0.1/', '/dns4/localhost/')
        : base;

      const records = [];
      if (dnsBase) {
        for (const p of node.getPeers()) {
          const pid = p.toString();
          if (pid === requesterId) continue;
          records.push({
            peerId: pid,
            multiaddrs: [ `${dnsBase}/p2p-circuit/p2p/${pid}` ]
          });
        }
      }

      const response = { type: 'response', once: true, peers: records };
      console.log(`[Bootstrap] Sending response to ${requesterId}:`, response);
      
      const payload = Buffer.from(JSON.stringify(response));
      
      // Send response
      if (stream.sink) {
        // Standard libp2p stream API
        await pipe([payload], lp.encode(), stream.sink);
      } else if (stream.sendData) {
        // MplexStream API
        const encoded = lp.encode.single(payload);
        stream.sendData(encoded);
      } else {
        throw new Error('Unknown stream API');
      }
      
      console.log(`[Bootstrap] Successfully responded to ${requesterId} with ${records.length} peer(s)`);
      
      // Close stream after successful write
      if (stream.close) {
        await stream.close();
      } else if (stream.sendCloseWrite) {
        stream.sendCloseWrite();
      }
    } catch (err) {
      console.log('[Bootstrap] Peer exchange error:', err.message, err.stack);
      try {
        const errorPayload = Buffer.from(JSON.stringify({ type: 'error', reason: err.message, once: true }));
        
        if (stream.sink) {
          await pipe([errorPayload], lp.encode(), stream.sink);
        } else if (stream.sendData) {
          const encoded = lp.encode.single(errorPayload);
          stream.sendData(encoded);
        }
        
        if (stream.close) {
          await stream.close();
        } else if (stream.sendCloseWrite) {
          stream.sendCloseWrite();
        }
      } catch (closeErr) {
        console.log('[Bootstrap] Error sending error response:', closeErr.message);
      }
    }
  });
  
  // Verify protocol was registered
  const protocols = node.getProtocols();
  console.log('[Bootstrap] All registered protocols:', protocols);
  if (protocols.includes(PEER_EXCHANGE_PROTOCOL)) {
    console.log('[Bootstrap] ✓ Peer exchange protocol successfully registered');
  } else {
    console.error('[Bootstrap] ✗ Peer exchange protocol NOT registered!');
  }

  node.addEventListener('peer:connect', (event) => {
    console.log('[Bootstrap] Peer connected:', event.detail.toString());
    console.log('[Bootstrap] Total peers:', node.getPeers().length);
    const conn = node.getConnections(event.detail)[0];
    if (conn) {
      console.log('[Bootstrap] Connection details:', {
        remotePeer: conn.remotePeer.toString(),
        remoteAddr: conn.remoteAddr.toString(),
        status: conn.status,
        direction: conn.direction,
        streams: conn.streams.length
      });
    }
  });

  node.addEventListener('peer:disconnect', (event) => {
    console.log('[Bootstrap] Peer disconnected:', event.detail.toString());
    console.log('[Bootstrap] Total peers:', node.getPeers().length);
  });

  setInterval(() => {
    console.log(`[Bootstrap] Status: ${node.getPeers().length} connected peer(s)`);
  }, 30000);

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
