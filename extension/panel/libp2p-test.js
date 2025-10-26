/**
 * Faz 0: libp2p Test Module
 * 
 * This module provides test functions for libp2p functionality
 */

import { P2PManager } from '../scripts/p2p/p2p-manager.js';
import { P2PChunkTransfer } from '../scripts/p2p/chunkTransfer.js';
import { ChunkManager } from '../scripts/webrtc/chunkManager.js';
import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';

let p2pManager = null;
let chunkManager = null;
let chunkTransfer = null;

// Detect browser for easier debugging
const browserName = (() => {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
    return ua.includes('Brave') ? 'BRAVE' : 'CHROME';
  }
  if (ua.includes('Firefox')) return 'FIREFOX';
  if (ua.includes('Edg')) return 'EDGE';
  return 'UNKNOWN';
})();

console.log(`[${browserName}] [Faz 0] libp2p test module loaded`);

// Expose test functions to window for console debugging
window.testLibp2pStart = async (bootstrapMultiaddr = null) => {
  try {
    console.log(`[${browserName}] [Phase 1] Starting libp2p test...`);
    
    p2pManager = new P2PManager({
      bootstrapMultiaddr: bootstrapMultiaddr // Pass bootstrap node multiaddr
    });
    
    // Expose to window for testing
    window.p2pManager = p2pManager;
    
    // Listen to events
    p2pManager.addEventListener('started', (event) => {
      console.log(`[${browserName}] [Faz 0] ✓ libp2p node started!`);
      console.log(`[${browserName}] [Faz 0] Peer ID:`, event.detail.peerId);
    });
    
    p2pManager.addEventListener('error', (event) => {
      console.error('[Faz 0] ✗ libp2p error:', event.detail.error);
    });
    
    p2pManager.addEventListener('peer:connected', (event) => {
      console.log(`[${browserName}] [Phase 1] Peer connected:`, event.detail.peerId);
    });
    
    p2pManager.addEventListener('bootstrap:connected', (event) => {
      console.log('[Phase 1] Bootstrap connected:', event.detail.peerId);
      console.log('[Phase 1] Multiaddr:', event.detail.multiaddr);
    });
    
    p2pManager.addEventListener('bootstrap:error', (event) => {
      console.error('[Phase 1] Bootstrap error:', event.detail.error);
    });
    
    await p2pManager.start();
    
    // Phase 2: Initialize chunk transfer
    if (!chunkManager) {
      chunkManager = new ChunkManager();
    }
    chunkTransfer = new P2PChunkTransfer(p2pManager, chunkManager);
    console.log(`[${browserName}] [Phase 2] Chunk transfer initialized`);
    
  } catch (error) {
    console.error('[Faz 0] Test failed:', error);
    throw error;
  }
};

window.testLibp2pStop = async () => {
  if (!p2pManager) {
    console.log('No libp2p node running');
    return;
  }
  
  try {
    await p2pManager.stop();
    console.log('[Faz 0] libp2p node stopped');
    p2pManager = null;
    window.p2pManager = null;
  } catch (error) {
    console.error('[Faz 0] Stop failed:', error);
    throw error;
  }
};

window.testLibp2pStatus = () => {
  if (!p2pManager) {
    console.log('[Faz 0] No libp2p node running');
    return null;
  }
  
  const status = p2pManager.getStatus();
  console.log(`[${browserName}] [Faz 0] Status:`, status);
  return status;
};

window.debugP2PManager = () => p2pManager;
window.peerIdFromString = peerIdFromString;
window.multiaddr = multiaddr;

// Phase 2: Chunk transfer test functions
window.testPrepareFile = async (file) => {
  if (!chunkManager) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    const { manifest, transfer } = await chunkManager.prepareTransfer(file);
    console.log(`[${browserName}] [Phase 2] File prepared:`, manifest);
    console.log(`[${browserName}] [Phase 2] Chunks:`, transfer.totalChunks);
    return manifest;
  } catch (error) {
    console.error('[Phase 2] Prepare failed:', error);
    throw error;
  }
};

window.testRequestChunk = async (peerId, manifestId, chunkIndex) => {
  if (!chunkTransfer) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    console.log(`[${browserName}] [Phase 2] Requesting chunk...`, { peerId, manifestId, chunkIndex });
    const data = await chunkTransfer.requestChunkFromPeer(peerId, manifestId, chunkIndex);
    console.log(`[${browserName}] [Phase 2] ✓ Chunk received (${data.length} bytes)`);
    return data;
  } catch (error) {
    console.error('[Phase 2] Request failed:', error);
    throw error;
  }
};

window.testReplicateToPeer = async (peerId, manifestId) => {
  if (!chunkTransfer) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    console.log(`[${browserName}] [Phase 2] Starting replication...`, { peerId, manifestId });
    
    const results = await chunkTransfer.replicateToPeer(peerId, manifestId, (progress) => {
      console.log(`[${browserName}] [Phase 2] Progress:`, progress);
    });
    
    console.log(`[${browserName}] [Phase 2] ✓ Replication complete:`, results);
    return results;
  } catch (error) {
    console.error('[Phase 2] Replication failed:', error);
    throw error;
  }
};

window.getChunkManager = () => chunkManager;
window.getChunkTransfer = () => chunkTransfer;

// Debug stream properties
window.testDebugStream = async (peerId, protocol) => {
  if (!p2pManager || !p2pManager.node) {
    console.log('Start libp2p first!');
    return;
  }
  
  try {
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const peerIdObj = peerIdFromString(peerId);
    const stream = await p2pManager.node.dialProtocol(peerIdObj, protocol || '/dweb/peer-exchange/1.0.0');
    
    console.log('Stream keys:', Object.keys(stream));
    console.log('Has sink?', !!stream.sink);
    console.log('Has source?', !!stream.source);
    console.log('Stream type:', stream.constructor?.name);
    console.log('Full stream:', stream);
    
    try { await stream.close?.(); } catch {}
    return stream;
  } catch (error) {
    console.error('Debug stream failed:', error);
  }
};

// Helper to manually add peer relay addresses
window.testAddPeerRelayAddr = async (targetPeerId, relayAddr) => {
  if (!p2pManager || !p2pManager.node) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    const peerId = peerIdFromString(targetPeerId);
    const fullAddr = multiaddr(`${relayAddr}/p2p-circuit/p2p/${targetPeerId}`);
    
    await p2pManager.node.peerStore.merge(peerId, {
      multiaddrs: [fullAddr]
    });
    
    console.log(`[${browserName}] ✓ Added relay address for peer:`, targetPeerId);
    console.log(`[${browserName}]   Address:`, fullAddr.toString());
    return true;
  } catch (error) {
    console.error(`[${browserName}] Failed to add relay address:`, error);
    return false;
  }
};

// Phase 3: DHT test functions
window.testRegisterDomain = async (domain, manifestId, metadata = {}) => {
  if (!p2pManager) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    console.log(`[${browserName}] [Phase 3] Registering domain in DHT...`, { domain, manifestId });
    const result = await p2pManager.registerDomainInDHT(domain, manifestId, metadata);
    console.log(`[${browserName}] [Phase 3] ✅ Domain registered:`, result);
    return result;
  } catch (error) {
    console.error('[Phase 3] Domain registration failed:', error);
    throw error;
  }
};

window.testResolveDomain = async (domain, timeout = 10000) => {
  if (!p2pManager) {
    console.error('Start libp2p first!');
    return;
  }
  
  try {
    console.log(`[${browserName}] [Phase 3] Resolving domain from DHT...`, domain);
    const result = await p2pManager.resolveDomainFromDHT(domain, timeout);
    console.log(`[${browserName}] [Phase 3] ✅ Domain resolved:`, result);
    return result;
  } catch (error) {
    console.error('[Phase 3] Domain resolution failed:', error);
    throw error;
  }
};

window.testDHTStatus = async () => {
  if (!p2pManager) {
    console.error('Start libp2p first!');
    return;
  }
  
  const enabled = p2pManager.isDHTEnabled();
  const peerCount = enabled ? await p2pManager.getDHTPeerCount() : 0;
  
  console.log(`[${browserName}] [Phase 3] DHT Status:`);
  console.log('  DHT Enabled:', enabled);
  console.log('  DHT Peers:', peerCount);
  
  return { enabled, peerCount };
};

console.log(`[${browserName}] [Phase 1] Test functions ready:`);
console.log('  - testLibp2pStart(bootstrapMultiaddr) - Pass full multiaddr with peer ID');
console.log('  - testLibp2pStop()');
console.log('  - testLibp2pStatus()');
console.log('  - debugP2PManager()');
console.log('');
console.log(`[${browserName}] [Phase 2] Chunk transfer functions:`);
console.log('  - testPrepareFile(file) - Prepare a file for transfer');
console.log('  - testRequestChunk(peerId, manifestId, chunkIndex) - Request chunk from peer');
console.log('  - testReplicateToPeer(peerId, manifestId) - Replicate all chunks to peer');
console.log('  - getChunkManager() - Get chunk manager instance');
console.log('  - getChunkTransfer() - Get chunk transfer instance');
console.log('');
console.log(`[${browserName}] [Phase 3] DHT domain registry functions:`);
console.log('  - testRegisterDomain(domain, manifestId, metadata) - Register domain in DHT');
console.log('  - testResolveDomain(domain, timeout) - Resolve domain from DHT');
console.log('  - testDHTStatus() - Check DHT status');
console.log('');
console.log('Example: testLibp2pStart("/dns4/localhost/tcp/9091/ws/p2p/12D3KooW...")');
console.log('Get the multiaddr from bootstrap node console output');
