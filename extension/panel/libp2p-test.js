/**
 * Faz 0: libp2p Test Module
 * 
 * This module provides test functions for libp2p functionality
 */

import { P2PManager } from '../scripts/p2p/p2p-manager.js';

let p2pManager = null;

console.log('[Faz 0] libp2p test module loaded');

// Expose test functions to window for console debugging
window.testLibp2pStart = async (bootstrapMultiaddr = null) => {
  try {
    console.log('[Phase 1] Starting libp2p test...');
    
    p2pManager = new P2PManager({
      bootstrapMultiaddr: bootstrapMultiaddr // Pass bootstrap node multiaddr
    });
    
    // Listen to events
    p2pManager.addEventListener('started', (event) => {
      console.log('[Faz 0] ✓ libp2p node started!');
      console.log('[Faz 0] Peer ID:', event.detail.peerId);
      alert(`libp2p node started!\nPeer ID: ${event.detail.peerId}`);
    });
    
    p2pManager.addEventListener('error', (event) => {
      console.error('[Faz 0] ✗ libp2p error:', event.detail.error);
      alert(`libp2p error: ${event.detail.error}`);
    });
    
    p2pManager.addEventListener('peer:connected', (event) => {
      console.log('[Phase 1] Peer connected:', event.detail.peerId);
      alert(`Peer connected: ${event.detail.peerId}`);
    });
    
    p2pManager.addEventListener('bootstrap:connected', (event) => {
      console.log('[Phase 1] Bootstrap connected:', event.detail.peerId);
      console.log('[Phase 1] Multiaddr:', event.detail.multiaddr);
      alert(`Bootstrap connected!\nPeer ID: ${event.detail.peerId}`);
    });
    
    p2pManager.addEventListener('bootstrap:error', (event) => {
      console.error('[Phase 1] Bootstrap error:', event.detail.error);
      alert(`Bootstrap connection failed: ${event.detail.error}`);
    });
    
    await p2pManager.start();
    
  } catch (error) {
    console.error('[Faz 0] Test failed:', error);
    alert(`libp2p test failed: ${error.message}`);
  }
};

window.testLibp2pStop = async () => {
  if (!p2pManager) {
    alert('No libp2p node running');
    return;
  }
  
  try {
    await p2pManager.stop();
    console.log('[Faz 0] libp2p node stopped');
    alert('libp2p node stopped');
    p2pManager = null;
  } catch (error) {
    console.error('[Faz 0] Stop failed:', error);
    alert(`Stop failed: ${error.message}`);
  }
};

window.testLibp2pStatus = () => {
  if (!p2pManager) {
    console.log('[Faz 0] No libp2p node running');
    alert('No libp2p node running');
    return;
  }
  
  const status = p2pManager.getStatus();
  console.log('[Faz 0] Status:', status);
  alert(`Status:\n${JSON.stringify(status, null, 2)}`);
  return status;
};

window.debugP2PManager = () => p2pManager;

console.log('[Phase 1] Test functions ready:');
console.log('  - testLibp2pStart(bootstrapMultiaddr) - Pass full multiaddr with peer ID');
console.log('  - testLibp2pStop()');
console.log('  - testLibp2pStatus()');
console.log('  - debugP2PManager()');
console.log('');
console.log('Example: testLibp2pStart("/dns4/localhost/tcp/9091/ws/p2p/12D3KooW...")');
console.log('Get the multiaddr from bootstrap node console output');
