/**
 * P2P Manager - libp2p based peer-to-peer networking
 * 
 * Manages libp2p node lifecycle, peer discovery, and connections
 */

import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { bootstrap } from '@libp2p/bootstrap';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { identify } from '@libp2p/identify';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { peerIdFromString } from '@libp2p/peer-id';
import * as MultiaddrModule from '@multiformats/multiaddr';

export class P2PManager extends EventTarget {
  constructor(config = {}) {
    super();
    
    // Default bootstrap node multiaddr (must include peer ID)
    // Format: /dns4/host/tcp/port/ws/p2p/peer-id
    // For testing: get peer ID from bootstrap node console output
    const defaultBootstrap = config.bootstrapMultiaddr || null;
    
    this.config = {
      bootstrapMultiaddr: defaultBootstrap,
      bootstrapPeers: config.bootstrapPeers || [],
      ...config
    };
    
    this.node = null;
    this.peerId = null;
    this.peers = new Map(); // peerId -> peerInfo
    this.isStarted = false;
  }
  
  /**
   * Start the libp2p node
   */
  async start() {
    if (this.isStarted) {
      console.warn('[P2P] Node already started');
      return;
    }
    
    try {
      console.log('[P2P] Starting libp2p node...');
      
      // Create libp2p node with browser-compatible transports
      // Phase 1: WebRTC enabled with circuit relay support
      this.node = await createLibp2p({
        addresses: {
          listen: []
        },
        transports: [
          webRTC(),
          webSockets({
            filter: () => true // Accept all WebSocket addresses
          }),
          circuitRelayTransport({
            discoverRelays: 1
          })
        ],
        connectionEncryption: [noise()],
        streamMuxers: [mplex()],
        services: {
          identify: identify()
        },
        peerDiscovery: this.config.bootstrapPeers.length > 0 ? [
          bootstrap({
            list: this.config.bootstrapPeers
          })
        ] : [],
        connectionManager: {
          minConnections: 0,
          maxConnections: 50
        }
      });
      
      // Setup event listeners
      this.setupEventHandlers();
      
      // Start the node
      await this.node.start();
      
      this.peerId = this.node.peerId.toString();
      this.isStarted = true;
      
      console.log('[P2P] Node started successfully');
      console.log('[P2P] Peer ID:', this.peerId);
      
      this.dispatchEvent(new CustomEvent('started', {
        detail: { peerId: this.peerId }
      }));
      
      // Connect to bootstrap node if configured
      if (this.config.bootstrapMultiaddr) {
        await this.connectToBootstrap();
      }
      
    } catch (error) {
      console.error('[P2P] Failed to start node:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { error: error.message }
      }));
      throw error;
    }
  }
  
  /**
   * Stop the libp2p node
   */
  async stop() {
    if (!this.isStarted || !this.node) {
      console.warn('[P2P] Node not started');
      return;
    }
    
    try {
      console.log('[P2P] Stopping libp2p node...');
      
      await this.node.stop();
      
      this.node = null;
      this.peerId = null;
      this.peers.clear();
      this.isStarted = false;
      
      console.log('[P2P] Node stopped');
      
      this.dispatchEvent(new CustomEvent('stopped'));
      
    } catch (error) {
      console.error('[P2P] Failed to stop node:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { error: error.message }
      }));
      throw error;
    }
  }
  
  /**
   * Setup libp2p event handlers
   */
  setupEventHandlers() {
    if (!this.node) return;
    
    // Peer discovered
    this.node.addEventListener('peer:discovery', (event) => {
      const peerId = event.detail.id.toString();
      console.log('[P2P] Peer discovered:', peerId);
      
      this.dispatchEvent(new CustomEvent('peer:discovered', {
        detail: { peerId }
      }));
    });
    
    // Peer connected
    this.node.addEventListener('peer:connect', (event) => {
      const peerId = event.detail.toString();
      console.log('[P2P] Peer connected:', peerId);
      
      this.peers.set(peerId, {
        peerId,
        connectedAt: Date.now(),
        status: 'connected'
      });
      
      this.dispatchEvent(new CustomEvent('peer:connected', {
        detail: { peerId, peerCount: this.peers.size }
      }));
    });
    
    // Peer disconnected
    this.node.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString();
      console.log('[P2P] Peer disconnected:', peerId);
      
      this.peers.delete(peerId);
      
      this.dispatchEvent(new CustomEvent('peer:disconnected', {
        detail: { peerId, peerCount: this.peers.size }
      }));
    });
  }
  
  /**
   * Get connected peers
   */
  getPeers() {
    return Array.from(this.peers.values());
  }
  
  /**
   * Get connection status
   */
  getStatus() {
    return {
      isStarted: this.isStarted,
      peerId: this.peerId,
      peerCount: this.peers.size,
      peers: this.getPeers()
    };
  }
  
  /**
   * Connect to bootstrap node
   * @param {string} multiaddr - Full multiaddr with peer ID (e.g., /dns4/localhost/tcp/9091/ws/p2p/12D3Koo...)
   */
  async connectToBootstrap(multiaddr = null) {
    if (!this.node) {
      return;
    }
    
    const addr = multiaddr || this.config.bootstrapMultiaddr;
    if (!addr) {
      console.warn('[P2P] No bootstrap multiaddr configured');
      return;
    }
    
    try {
      console.log('[P2P] Connecting to bootstrap node:', addr);
      
      // Parse the full multiaddr (including peer ID)
      const ma = MultiaddrModule.multiaddr(addr);
      
      console.log('[P2P] Dialing multiaddr directly:', addr);
      
      // Dial using the full multiaddr directly
      // This should work better than extracting peer ID separately
      const connection = await this.node.dial(ma);
      console.log('[P2P] ✓ Connected to bootstrap node!');
      console.log('[P2P] Bootstrap peer ID:', connection.remotePeer.toString());
      
      this.dispatchEvent(new CustomEvent('bootstrap:connected', {
        detail: { 
          peerId: connection.remotePeer.toString(),
          multiaddr: addr
        }
      }));
      
    } catch (error) {
      console.error('[P2P] Failed to connect to bootstrap:', error);
      this.dispatchEvent(new CustomEvent('bootstrap:error', {
        detail: { error: error.message }
      }));
    }
  }
  
  /**
   * Connect to a specific peer
   */
  async connectToPeer(multiaddr) {
    if (!this.node) {
      throw new Error('Node not started');
    }
    
    try {
      console.log('[P2P] Connecting to peer:', multiaddr);
      await this.node.dial(multiaddr);
      console.log('[P2P] Successfully connected to peer');
    } catch (error) {
      console.error('[P2P] Failed to connect to peer:', error);
      throw error;
    }
  }
}
