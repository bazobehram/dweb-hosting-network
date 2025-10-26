/**
 * Test peer exchange manually from browser console
 * 
 * Usage:
 * 1. Open browser console
 * 2. Copy and paste this file's contents
 * 3. Run: testPeerExchange()
 */

async function testPeerExchange() {
  console.log('=== Testing Peer Exchange ===');
  
  if (!window.p2pManager) {
    console.error('❌ P2P Manager not found. Make sure extension is loaded.');
    return;
  }
  
  const status = window.p2pManager.getStatus();
  console.log('P2P Status:', status);
  
  if (!status.isStarted) {
    console.error('❌ P2P node not started');
    return;
  }
  
  console.log('My Peer ID:', status.peerId);
  console.log('Connected peers:', status.peerCount);
  
  const bootstrapPeerId = window.p2pManager.getBootstrapPeerId();
  if (!bootstrapPeerId) {
    console.warn('⚠️  No bootstrap peer ID found');
    console.log('Connected peer IDs:', Array.from(window.p2pManager.peers.keys()));
  } else {
    console.log('Bootstrap Peer ID:', bootstrapPeerId);
  }
  
  try {
    console.log('Requesting peer exchange...');
    await window.p2pManager.requestPeerExchange(undefined, { 
      reason: 'manual-test', 
      force: true 
    });
    console.log('✓ Peer exchange completed');
    
    // Check status again
    const newStatus = window.p2pManager.getStatus();
    console.log('After exchange - Connected peers:', newStatus.peerCount);
    console.log('Peer list:', newStatus.peers);
  } catch (error) {
    console.error('❌ Peer exchange failed:', error);
  }
}

async function testLibp2pStatus() {
  console.log('=== Libp2p Node Status ===');
  
  if (!window.p2pManager?.node) {
    console.error('❌ Node not available');
    return;
  }
  
  const node = window.p2pManager.node;
  
  console.log('Peer ID:', node.peerId.toString());
  console.log('Started:', node.isStarted());
  
  const connections = node.getConnections();
  console.log('Active connections:', connections.length);
  connections.forEach(conn => {
    console.log(`  - ${conn.remotePeer.toString()} [${conn.status}] via ${conn.remoteAddr.toString()}`);
  });
  
  const peers = node.getPeers();
  console.log('Known peers:', peers.length);
  peers.forEach(peerId => {
    console.log(`  - ${peerId.toString()}`);
  });
  
  const multiaddrs = node.getMultiaddrs();
  console.log('My multiaddrs:', multiaddrs.length);
  multiaddrs.forEach(ma => {
    console.log(`  - ${ma.toString()}`);
  });
  
  // Check protocols
  const protocols = await node.peerStore.all();
  console.log('Peer store size:', protocols.length);
}

console.log('✓ Test functions loaded:');
console.log('  - testPeerExchange()');
console.log('  - testLibp2pStatus()');
