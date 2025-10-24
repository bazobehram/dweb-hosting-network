/**
 * P2P Manager - libp2p based peer-to-peer networking
 * 
 * Manages libp2p node lifecycle, peer discovery, and connections
 */

import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
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
    
    const normalizeAddr = (addr) => {
      if (!addr || typeof addr !== 'string') return null;
      // Normalize 127.0.0.1 to dns4/localhost for browser WS compat
      return addr.replace(/^\/ip4\/127\.0\.0\.1\//, '/dns4/localhost/');
    };

    this.config = {
      bootstrapMultiaddr: normalizeAddr(defaultBootstrap),
      bootstrapPeers: (config.bootstrapPeers || []).map(normalizeAddr).filter(Boolean),
      ...config
    };
    
    this.node = null;
    this.peerId = null;
    this.peers = new Map(); // peerId -> peerInfo
    this.isStarted = false;
    this.dialAttempts = new Set();
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
            filter: filters.all // Accept all WebSocket addresses (including ws://)
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
        peerDiscovery: (() => {
          const discoveries = [];
          if (this.config.bootstrapPeers && this.config.bootstrapPeers.length > 0) {
            discoveries.push(bootstrap({ list: this.config.bootstrapPeers }));
          }
          if (this.config.bootstrapMultiaddr) {
            discoveries.push(bootstrap({ list: [this.config.bootstrapMultiaddr] }));
          }
          return discoveries;
        })(),
        connectionManager: {
          autoDial: true,
          minConnections: 0,
          maxConnections: 50
        },
        connectionGater: {
          // Allow dialing private/local addresses (for development)
          denyDialMultiaddr: async () => false
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
      
      // Bootstrap discovery will handle connecting if configured
      
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
    this.node.addEventListener('peer:discovery', async (event) => {
      const peerIdObj = event.detail.id; // PeerId object
      const peerId = peerIdObj?.toString?.() || String(peerIdObj || 'unknown');
      console.log('[P2P] Peer discovered:', peerId);
      console.log('[P2P] Discovered multiaddrs:', event.detail.multiaddrs?.map(ma => ma.toString()));

      // Auto-dial discovered peers using PeerId (correct v1.x API)
      try {
        if (!this.dialAttempts.has(peerId)) {
          this.dialAttempts.add(peerId);
          // Dial the PeerId - libp2p will find addresses in peer store
          await new Promise(r => setTimeout(r, 100));
          console.log('[P2P] Auto-dialing peer:', peerId);
          this.node.dial(peerIdObj).catch(err => {
            console.log('[P2P] Auto-dial failed for', peerId, ':', err.message);
          });
        }
      } catch (err) {
        console.log('[P2P] Auto-dial exception:', err.message);
      }
      
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
  
  // Dial bootstrap node using PeerId from peer store (correct libp2p v1.x API)
  async connectToBootstrap(_multiaddr = null) {
    if (!this.node) return;

    const addr = _multiaddr || this.config.bootstrapMultiaddr;
    if (!addr) {
      console.warn('[P2P] No bootstrap multiaddr configured');
      return;
    }

    try {
      console.log('[P2P] Connecting to bootstrap:', addr);

      // Extract PeerId from multiaddr string
      const parts = addr.split('/p2p/');
      if (parts.length < 2) {
        throw new Error('Multiaddr missing /p2p/<peerid> component');
      }
      const peerIdStr = parts[parts.length - 1];
      console.log('[P2P] Bootstrap PeerId:', peerIdStr);
      
      // Wait for peer to be discovered and added to peer store
      console.log('[P2P] Waiting for bootstrap peer to be discovered...');
      await new Promise(resolve => {
        const checkPeer = () => {
          const peers = Array.from(this.node.getPeers());
          const found = peers.find(p => p.toString() === peerIdStr);
          if (found) {
            console.log('[P2P] Bootstrap peer found in peer store');
            resolve();
          } else {
            setTimeout(checkPeer, 100);
          }
        };
        checkPeer();
      });

      // Get PeerId object from peer store
      const peers = Array.from(this.node.getPeers());
      const peerIdObj = peers.find(p => p.toString() === peerIdStr);
      
      if (!peerIdObj) {
        throw new Error('Bootstrap peer not found in peer store');
      }

      // Dial using PeerId object (libp2p finds addresses automatically)
      console.log('[P2P] Dialing bootstrap peer...');
      const conn = await this.node.dial(peerIdObj);

      console.log('[P2P] ✓ Connected to bootstrap node! Peer:', conn.remotePeer.toString());
      this.dispatchEvent(new CustomEvent('bootstrap:connected', {
        detail: { peerId: conn.remotePeer.toString(), multiaddr: addr }
      }));
    } catch (error) {
      console.error('[P2P] Failed to connect to bootstrap:', error);
      this.dispatchEvent(new CustomEvent('bootstrap:error', { detail: { error: error.message } }));
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
