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
import { kadDHT } from '@libp2p/kad-dht';
import { autoNAT } from '@libp2p/autonat';
import { ping } from '@libp2p/ping';
import { peerIdFromString } from '@libp2p/peer-id';
import * as MultiaddrModule from '@multiformats/multiaddr';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';

// Protocol identifiers
const CHUNK_PROTOCOL = '/dweb/chunk/1.0.0';
const PEER_EXCHANGE_PROTOCOL = '/dweb/peer-exchange/1.0.0';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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
    
    this.bootstrapPeerIds = new Set();
    const collectBootstrapPeerId = (addr) => {
      const peerId = this.extractPeerIdFromMultiaddr(addr);
      if (peerId) {
        this.bootstrapPeerIds.add(peerId);
      }
    };
    if (this.config.bootstrapMultiaddr) {
      collectBootstrapPeerId(this.config.bootstrapMultiaddr);
    }
    this.config.bootstrapPeers.forEach(collectBootstrapPeerId);

    console.log('[P2P] Bootstrap peer IDs:', Array.from(this.bootstrapPeerIds));

    this.node = null;
    this.peerId = null;
    this.peers = new Map(); // peerId -> peerInfo
    this.isStarted = false;
    this.dialAttempts = new Set();
    this.lastPeerSync = new Map(); // peerId -> timestamp
    this.peerSyncInterval = null;
    
    // Chunk request handling
    this.chunkRequestHandler = null; // Function to handle chunk requests
    this.pendingChunkRequests = new Map(); // requestId -> { resolve, reject, timeout }
  }
  
  /**
   * Encode and send a JSON message over an LP framed stream
   */
  async writeJsonMessage(stream, message, { close = false } = {}) {
    if (!stream) {
      throw new Error('Invalid stream');
    }

    const payload = textEncoder.encode(JSON.stringify(message));
    const encoded = lp.encode.single(payload);
    stream.sendData(encoded);
    
    // Small delay to ensure data is flushed before continuing
    await new Promise(resolve => setTimeout(resolve, 10));

    if (close) {
      try {
        stream.sendCloseWrite?.();
      } catch {}
    }
  }
  
  /**
   * Read a single JSON message from an LP framed stream
   */
  async readJsonMessage(stream) {
    if (!stream) {
      throw new Error('Stream unavailable');
    }

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream read timeout'));
      }, 10000);

      try {
        // MplexStream is directly async iterable
        for await (const chunk of lp.decode(stream)) {
          clearTimeout(timeout);
          const result = JSON.parse(textDecoder.decode(chunk.subarray ? chunk.subarray() : chunk));
          resolve(result);
          return;
        }
        clearTimeout(timeout);
        resolve(null);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  extractPeerIdFromMultiaddr(addr) {
    if (!addr || typeof addr !== 'string') {
      return null;
    }
    try {
      const ma = MultiaddrModule.multiaddr(addr);
      const peerId = ma.getPeerId?.();
      if (peerId) {
        return peerId;
      }
    } catch (err) {
      // Ignore invalid multiaddr formats
    }
    const match = addr.match(/\/p2p\/([^/]+)/);
    return match ? match[1] : null;
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
          listen: [],
          announce: [] // Empty initially, relay addresses will be added by transport
        },
        transports: [
          webRTC(),
          webSockets(),
          circuitRelayTransport({
            reservationConcurrency: 1, // Reserve 1 relay slot at a time
            maxReservationQueueLength: 10,
            reservationCompletionTimeout: 10000
          })
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [mplex()],
        services: {
          identify: identify(),
          ping: ping(), // Required by DHT
          dht: kadDHT({
            clientMode: true, // Browser peers in client mode (don't accept DHT queries)
            validators: {}, // No validators for now
            selectors: {} // No selectors for now
          }),
          autoNAT: autoNAT() // Auto-detect NAT status for relay usage
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
      
      // Register protocol handlers
      this.registerProtocolHandlers();
      
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
      if (this.peerSyncInterval) {
        clearInterval(this.peerSyncInterval);
      }
      this.peerSyncInterval = setInterval(() => {
        this.requestPeerExchange(undefined, { reason: 'periodic' }).catch(() => {});
      }, 30000);

      setTimeout(() => {
        // Only do startup exchange if we have bootstrap peers configured
        if (this.bootstrapPeerIds.size > 0) {
          this.requestPeerExchange(undefined, { reason: 'startup', force: true }).catch(() => {});
        }
      }, 1500);
      
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
      
      if (this.peerSyncInterval) {
        clearInterval(this.peerSyncInterval);
        this.peerSyncInterval = null;
      }
      this.lastPeerSync.clear();
      
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
          
          // Add retry logic for auto-dialing
          let retries = 3;
          while (retries > 0) {
            try {
              await this.node.dial(peerIdObj);
              break;
            } catch (err) {
              retries--;
              if (retries === 0) {
                console.log('[P2P] Auto-dial failed for', peerId, ':', err.message);
                // Log more details about the error
                if (err.code) {
                  console.log('[P2P] Error code:', err.code);
                }
                break;
              }
              console.log(`[P2P] Auto-dial attempt failed for ${peerId}, ${retries} retries left:`, err.message);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (err) {
        console.log('[P2P] Auto-dial exception:', err.message);
      }
      
      this.dispatchEvent(new CustomEvent('peer:discovered', {
        detail: { peerId }
      }));
    });
    
    // Peer connected
    this.node.addEventListener('peer:connect', async (event) => {
      const peerId = event.detail.toString();
      console.log('[P2P] Peer connected:', peerId);
      
      this.peers.set(peerId, {
        peerId,
        connectedAt: Date.now(),
        status: 'connected'
      });

      // If this is a bootstrap peer, request exchange immediately AND make relay reservation
      if (this.bootstrapPeerIds.has(peerId)) {
        console.log('[P2P] 🎯 Bootstrap peer connected; requesting exchange AND making relay reservation');
        setTimeout(() => {
          this.requestPeerExchange(peerId, { reason: 'connected', force: true }).catch(() => {});
        }, 500); // Small delay to ensure connection is fully established
        
        // Try to make relay reservation on this bootstrap peer
        console.log('[P2P] 🔄 Scheduling relay reservation in 1 second...');
        setTimeout(async () => {
          console.log('[P2P] ⏰ Relay reservation timeout triggered, calling makeRelayReservation...');
          try {
            await this.makeRelayReservation(event.detail);
            console.log('[P2P] ✅ makeRelayReservation completed successfully');
          } catch (err) {
            console.error('[P2P] ❌ Relay reservation failed:', err.message);
            console.error('[P2P] Error stack:', err.stack);
          }
        }, 1000); // Wait a bit longer for connection to stabilize
      }
      // If we don't have any bootstrap peers configured, try peer exchange with this peer
      else if (this.bootstrapPeerIds.size === 0 && peerId !== this.peerId) {
        console.log('[P2P] Non-bootstrap peer connected; requesting exchange');
        setTimeout(() => {
          this.requestPeerExchange(peerId, { reason: 'connected', force: true }).catch(() => {});
        }, 500); // Small delay to ensure connection is fully established
      }
      
      this.dispatchEvent(new CustomEvent('peer:connected', {
        detail: { peerId, peerCount: this.peers.size }
      }));
    });
    
    // Peer disconnected
    this.node.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString();
      console.log('[P2P] Peer disconnected:', peerId);
      
      this.peers.delete(peerId);
      this.lastPeerSync.delete(peerId);
      
      this.dispatchEvent(new CustomEvent('peer:disconnected', {
        detail: { peerId, peerCount: this.peers.size }
      }));
    });
    
    // Self multiaddrs updated (relay addresses)
    this.node.addEventListener('self:peer:update', (event) => {
      const addrs = this.node.getMultiaddrs();
      console.log('[P2P] Self addresses updated:', addrs.map(a => a.toString()));
      
      // Check for relay addresses
      const relayAddrs = addrs.filter(a => a.toString().includes('/p2p-circuit'));
      if (relayAddrs.length > 0) {
        console.log('[P2P] ✓ Relay addresses available:', relayAddrs.map(a => a.toString()));
      } else {
        console.log('[P2P] No relay addresses yet');
      }
    });
    
    // Listen for transport events (relay-related)
    try {
      // Try to access circuit relay transport events
      this.node.addEventListener('transport:listening', (event) => {
        console.log('[P2P] Transport listening:', event.detail);
      });
    } catch (err) {
      console.log('[P2P] Could not register transport events:', err.message);
    }
    
    // Listen for relay reservation events
    try {
      this.node.addEventListener('relay:created-reservation', (event) => {
        console.log('[P2P] ✅ Relay reservation created!', event.detail);
        // Check self addresses after reservation
        const addrs = this.node.getMultiaddrs();
        const relayAddrs = addrs.filter(a => a.toString().includes('/p2p-circuit'));
        console.log('[P2P] Relay addresses after reservation:', relayAddrs.map(a => a.toString()));
      });
      
      this.node.addEventListener('relay:removed', (event) => {
        console.log('[P2P] ⚠️  Relay reservation removed:', event.detail);
      });
      
      this.node.addEventListener('relay:not-enough-relays', (event) => {
        console.log('[P2P] ⚠️  Not enough relays available');
      });
    } catch (err) {
      console.log('[P2P] Could not register relay events:', err.message);
    }
  }
  
  /**
   * Make a relay reservation on a bootstrap/relay peer
   */
  async makeRelayReservation(peerIdObj) {
    if (!this.node) {
      throw new Error('Node not started');
    }
    
    const peerId = peerIdObj.toString();
    console.log('[P2P] Attempting to make relay reservation on:', peerId);
    
    try {
      // Access the circuit relay transport
      const transports = this.node.components.transportManager.getTransports();
      console.log('[P2P] Available transports:', transports.map(t => t.constructor.name));
      
      // Find circuit relay transport
      const relayTransport = transports.find(t => 
        t.constructor.name.includes('Circuit') || 
        t.constructor.name.includes('Relay')
      );
      
      if (!relayTransport) {
        throw new Error('Circuit relay transport not found');
      }
      
      console.log('[P2P] Found relay transport:', relayTransport.constructor.name);
      
      // Access reservation store
      if (!relayTransport.reservationStore) {
        throw new Error('Reservation store not available on transport');
      }
      
      console.log('[P2P] Calling addRelay() on reservation store...');
      
      // Make the reservation (type: 'configured' for manually configured relays)
      const reservation = await relayTransport.reservationStore.addRelay(peerIdObj, 'configured');
      
      console.log('[P2P] ✅ Relay reservation successful!', {
        relay: reservation.relay.toString(),
        hasReservation: relayTransport.reservationStore.hasReservation(peerIdObj)
      });
      
      // Log self addresses
      const addrs = this.node.getMultiaddrs();
      console.log('[P2P] Self addresses after reservation:', addrs.map(a => a.toString()));
      
      return reservation;
    } catch (error) {
      console.error('[P2P] ❌ Failed to make relay reservation:', error.message);
      console.error('[P2P] Error details:', error);
      throw error;
    }
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
      this.bootstrapPeerIds.add(peerIdStr);
      
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
      // Add retry logic for dialing
      let conn;
      let retries = 3;
      while (retries > 0) {
        try {
          conn = await this.node.dial(peerIdObj);
          break;
        } catch (error) {
          retries--;
          if (retries === 0) {
            throw error;
          }
          console.log(`[P2P] Dial attempt failed, ${retries} retries left:`, error.message);
          // Add a delay before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

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
  
  /**
   * Register libp2p protocol handlers
   */
  registerProtocolHandlers() {
    if (!this.node) return;
    
    // Peer exchange protocol (discovery updates)
    this.node.handle(PEER_EXCHANGE_PROTOCOL, async ({ stream, connection }) => {
      const sourcePeerId = connection.remotePeer.toString();
      // Add timeout handling
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        console.log('[P2P] Peer exchange handler timeout for', sourcePeerId);
      }, 10000); // 10 second timeout
      
      try {
        await this.consumePeerExchangeStream(stream, sourcePeerId);
      } finally {
        clearTimeout(timeout);
      }
    });
    
    // Register chunk request/response protocol
    this.node.handle(CHUNK_PROTOCOL, async ({ stream, connection }) => {
      try {
        const peerId = connection.remotePeer.toString();
        console.log('[P2P] Handling chunk request from:', peerId);
        console.log('[P2P] Chunk stream keys:', Object.keys(stream || {}));
        
        // Add timeout for chunk protocol
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
          console.log('[P2P] Chunk protocol timeout for', peerId);
        }, 30000); // 30 second timeout for chunk operations
        
        for await (const msg of lp.decode(stream)) {
          clearTimeout(timeout);
          const message = JSON.parse(textDecoder.decode(msg.subarray ? msg.subarray() : msg));
          console.log('[P2P] Chunk protocol message:', message.type, message);
          
          let response;
          
          if (message.type === 'chunk-request') {
            if (this.chunkRequestHandler) {
              try {
                const chunkData = await this.chunkRequestHandler(message);
                response = {
                  type: 'chunk-response',
                  requestId: message.requestId,
                  manifestId: message.manifestId,
                  chunkIndex: message.chunkIndex,
                  data: chunkData,
                  status: 'success'
                };
              } catch (error) {
                response = {
                  type: 'chunk-error',
                  requestId: message.requestId,
                  manifestId: message.manifestId,
                  chunkIndex: message.chunkIndex,
                  reason: error.message || 'chunk-not-found',
                  status: 'error'
                };
              }
            } else {
              response = {
                type: 'chunk-error',
                requestId: message.requestId,
                reason: 'no-handler',
                status: 'error'
              };
            }
          } else if (message.type === 'chunk-upload') {
            try {
              if (message.hash && window.chunkManager) {
                const bytes = this.base64ToUint8Array(message.data);
                const computed = await window.chunkManager.computeHash(bytes.buffer);
                if (computed !== message.hash) {
                  throw new Error('hash-mismatch');
                }
              }
              
              if (window.cacheChunk) {
                window.cacheChunk(message.manifestId, message.chunkIndex, message.data);
              }
              
              response = {
                type: 'chunk-upload-ack',
                manifestId: message.manifestId,
                chunkIndex: message.chunkIndex,
                peerId: this.peerId,
                status: 'ok'
              };
              
              console.log('[P2P] Chunk uploaded and cached:', message.manifestId, message.chunkIndex);
            } catch (error) {
              response = {
                type: 'chunk-upload-nack',
                manifestId: message.manifestId,
                chunkIndex: message.chunkIndex,
                peerId: this.peerId,
                reason: error.message,
                status: 'error'
              };
              console.error('[P2P] Chunk upload failed:', error);
            }
          } else {
            response = {
              type: 'error',
              reason: 'unknown-message-type',
              status: 'error'
            };
          }
          
          try {
            await this.writeJsonMessage(stream, response, { close: false });
          } catch (error) {
            console.error('[P2P] Failed to write chunk response:', error);
          }
          
          break;
        }
        clearTimeout(timeout);
      } catch (error) {
        console.error('[P2P] Error handling chunk protocol:', error);
      } finally {
        try {
          await stream.close?.();
        } catch (err) {
          console.log('[P2P] Failed to close chunk stream:', err.message);
        }
      }
    });
  }
  
  getBootstrapPeerId() {
    const iterator = this.bootstrapPeerIds.values();
    const result = iterator.next();
    if (result.done) {
      console.log('[P2P] No bootstrap peer ID available for exchange');
    }
    return result.done ? null : result.value;
  }
  
  async consumePeerExchangeStream(stream, sourcePeerId) {
    if (!this.node) {
      return;
    }
    if (sourcePeerId) {
      this.bootstrapPeerIds.add(sourcePeerId);
    }
    try {
      // Use a timeout to prevent hanging indefinitely
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        console.log('[P2P] Peer exchange stream timeout');
      }, 10000); // 10 second timeout
      
      for await (const msg of lp.decode(stream)) {
        clearTimeout(timeout);
        let payload;
        try {
          payload = JSON.parse(textDecoder.decode(msg.subarray ? msg.subarray() : msg));
        } catch (err) {
          console.log('[P2P] Peer exchange decode error:', err.message);
          continue;
        }
        
        console.log('[P2P] Peer exchange payload received:', payload);
        
        const peers = payload?.peers;
        if (Array.isArray(peers) && peers.length > 0) {
          await this.ingestPeerRecords(peers, sourcePeerId);
        }
        
        if (payload?.type === 'response' || payload?.once === true) {
          break;
        }
      }
      clearTimeout(timeout);
    } catch (error) {
      console.log('[P2P] Peer exchange handler error:', error.message);
    } finally {
      try {
        await stream.close?.();
      } catch (err) {
        console.log('[P2P] Failed to close peer exchange stream:', err.message);
      }
    }
  }
  
  async sendPeerExchangeRequest(stream, options = {}) {
    console.log('[P2P] sendPeerExchangeRequest called with stream:', {
      streamExists: !!stream,
      streamType: typeof stream,
      streamStatus: stream?.status,
      hasSendMethod: typeof stream?.send === 'function'
    });
    
    const payload = {
      type: 'request',
      reason: options.reason || 'manual',
      knownPeers: Array.from(this.peers.keys())
    };
    
    try {
      // Add a check to ensure stream is still open before writing
      if (!stream || stream.status === 'closed') {
        console.error('[P2P] Stream is closed in sendPeerExchangeRequest');
        throw new Error('Stream is closed');
      }
      
      console.log('[P2P] Sending peer exchange request with payload:', payload);
      await this.writeJsonMessage(stream, payload, { close: false });
      console.log('[P2P] Peer exchange request sent successfully');
    } catch (error) {
      console.log('[P2P] Peer exchange request write failed:', error.message);
      console.error('[P2P] Full error in sendPeerExchangeRequest:', error);
      throw error;
    }
  }
  
  async readPeerExchangeMessage(stream) {
    let message = null;
    try {
      // Add a check to ensure stream is still open before reading
      if (!stream || stream.status === 'closed') {
        throw new Error('Stream is closed');
      }
      
      console.log('[P2P] Reading peer exchange response with stream status:', {
        status: stream.status,
        writeStatus: stream.writeStatus,
        readStatus: stream.readStatus
      });
      
      message = await this.readJsonMessage(stream);
    } catch (error) {
      console.log('[P2P] Peer exchange response read failed:', error.message);
      // Don't reject the promise, just return null
    }
    return message;
  }
  
  async requestPeerExchange(preferredPeerId, options = {}) {
    console.log('[P2P] requestPeerExchange called with:', { preferredPeerId, options });
    
    if (!this.node) {
      console.log('[P2P] Node not started, returning');
      return;
    }
    
    // If no preferred peer ID and no bootstrap peers, try to find any connected peer
    const targetPeerId = preferredPeerId || this.getBootstrapPeerId();
    if (!targetPeerId) {
      // Try to find any connected peer that's not ourselves
      const connectedPeers = Array.from(this.peers.keys()).filter(peerId => peerId !== this.peerId);
      if (connectedPeers.length > 0) {
        // Use the first connected peer for exchange
        const fallbackPeerId = connectedPeers[0];
        console.log('[P2P] Using fallback peer for exchange:', fallbackPeerId);
      } else {
        console.log('[P2P] Skipping peer exchange; no target peer ID');
        return;
      }
    }
    
    if (!options.force) {
      const last = this.lastPeerSync.get(targetPeerId) || 0;
      if (Date.now() - last < 5000) {
        console.log('[P2P] Skipping peer exchange, last sync was less than 5 seconds ago');
        return;
      }
    }
    this.lastPeerSync.set(targetPeerId, Date.now());
    
    let stream;
    try {
      const peerIdObj = peerIdFromString(targetPeerId);
      console.log('[P2P] Dialing peer exchange:', targetPeerId, options.reason || 'manual');
      console.log('[P2P] Using protocol:', PEER_EXCHANGE_PROTOCOL);
      console.log('[P2P] Target PeerId object:', peerIdObj);
      console.log('[P2P] Node protocols available:', this.node.getProtocols());
      
      stream = await this.node.dialProtocol(peerIdObj, PEER_EXCHANGE_PROTOCOL);
      
      console.log('[P2P] Stream opened successfully');
      console.log('[P2P] Stream details:', JSON.stringify({
        protocol: stream.protocol,
        direction: stream.direction,
        status: stream.status,
        id: stream.id,
        type: stream.constructor?.name,
        timeline: stream.timeline
      }, null, 2));
      
      if (!stream) {
        throw new Error('Failed to create stream');
      }
      
      // Send the request immediately
      await this.sendPeerExchangeRequest(stream, options);
      
      // Read the response
      const response = await this.readPeerExchangeMessage(stream);
      
      if (response?.peers?.length) {
        await this.ingestPeerRecords(response.peers, targetPeerId);
      }
      console.log('[P2P] Peer exchange response:', response);
    } catch (error) {
      console.log('[P2P] Peer exchange request failed:', error.message);
      // Log more details about the error
      if (error.code) {
        console.log('[P2P] Error code:', error.code);
      }
      console.error('[P2P] Full error:', error);
    } finally {
      if (stream) {
        try {
          await stream.close?.();
        } catch {}
      }
    }
  }
  
  async ingestPeerRecords(records = [], sourcePeerId) {
    if (!this.node || !Array.isArray(records)) {
      return;
    }
    
    if (sourcePeerId) {
      this.bootstrapPeerIds.add(sourcePeerId);
    }
    
    if (records.length > 0) {
      console.log('[P2P] Peer exchange received', records.length, 'record(s) from', sourcePeerId || 'unknown');
      console.log('[P2P] Peer records:', JSON.stringify(records, null, 2));
    }
    
    for (const record of records) {
      const peerId = record?.peerId;
      const multiaddrs = Array.isArray(record?.multiaddrs) ? record.multiaddrs : [];
      console.log('[P2P] Processing peer record:', peerId, 'addrs:', multiaddrs);
      
      if (!peerId || peerId === this.peerId) {
        continue;
      }
      
      let peerIdObj;
      try {
        peerIdObj = peerIdFromString(peerId);
      } catch (err) {
        console.log('[P2P] Ignoring peer record with invalid PeerId:', peerId);
        continue;
      }
      
      const resolvedAddrs = [];
      for (const addr of multiaddrs) {
        if (typeof addr !== 'string') continue;
        try {
          resolvedAddrs.push(MultiaddrModule.multiaddr(addr));
        } catch (err) {
          console.log('[P2P] Ignoring invalid multiaddr for peer', peerId, ':', addr);
        }
      }
      
      if (resolvedAddrs.length === 0) {
        continue;
      }
      
      console.log('[P2P] Adding', resolvedAddrs.length, 'address(es) to peer store for', peerId);
      try {
        await this.node.peerStore.merge(peerIdObj, {
          multiaddrs: resolvedAddrs
        });
        console.log('[P2P] ✓ Successfully added addresses to peer store');
      } catch (err) {
        console.log('[P2P] ✗ Failed to add peer addresses for', peerId, ':', err.message);
      }
      
      if (!this.dialAttempts.has(peerId)) {
        this.dialAttempts.add(peerId);
        console.log('[P2P] Scheduling dial attempt for peer:', peerId);
        setTimeout(() => {
          console.log('[P2P] Attempting to dial peer:', peerId);
          this.node?.dial(peerIdObj).then(() => {
            console.log('[P2P] ✓ Successfully dialed peer:', peerId);
          }).catch((err) => {
            console.log('[P2P] ✗ Dial failed for', peerId, ':', err.message);
          });
        }, 200);
      } else {
        console.log('[P2P] Skipping dial for', peerId, '- already attempted');
      }
    }
  }
  
  /**
   * Set chunk request handler
   * Handler should be an async function that takes { manifestId, chunkIndex }
   * and returns base64 chunk data or throws error
   */
  setChunkRequestHandler(handler) {
    this.chunkRequestHandler = handler;
  }
  
  /**
   * Request a chunk from a peer
   * @param {string} peerId - Target peer ID
   * @param {string} manifestId - Manifest ID
   * @param {number} chunkIndex - Chunk index
   * @param {number} timeout - Request timeout in ms (default 30000)
   * @returns {Promise<{data: string, status: string}>} Chunk data (base64) or error
   */
  async requestChunk(peerId, manifestId, chunkIndex, timeout = 30000) {
    if (!this.node) {
      throw new Error('Node not started');
    }
    
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    console.log('[P2P] Requesting chunk:', { peerId, manifestId, chunkIndex, requestId });
    
    let stream;
    try {
      // Get peer ID object
      const peerIdObj = peerIdFromString(peerId);
      
      // Open stream to peer
      stream = await this.node.dialProtocol(peerIdObj, CHUNK_PROTOCOL);
      
      // Create request message
      const request = {
        type: 'chunk-request',
        requestId,
        manifestId,
        chunkIndex,
        timestamp: Date.now()
      };
      
      // Send request and wait for response
      const response = await new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Request timeout')), timeout);
        try {
          await this.writeJsonMessage(stream, request);
          const message = await this.readJsonMessage(stream);
          clearTimeout(timer);
          if (!message) {
            reject(new Error('No response received'));
            return;
          }
          console.log('[P2P] Chunk response received:', message);
          resolve(message);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      
      if (response.status === 'error') {
        throw new Error(response.reason || 'Chunk request failed');
      }
      
      return response;
      
    } catch (error) {
      console.error('[P2P] Chunk request failed:', error);
      throw error;
    } finally {
      // Ensure stream is properly closed
      if (stream) {
        try {
          await stream.close?.();
        } catch (err) {
          console.log('[P2P] Failed to close chunk request stream:', err.message);
        }
      }
    }
  }
  
  /**
   * Send chunk to peer (for replication)
   * @param {string} peerId - Target peer ID
   * @param {string} manifestId - Manifest ID
   * @param {number} chunkIndex - Chunk index
   * @param {string} data - Base64 chunk data
   * @param {string} hash - Chunk hash
   * @returns {Promise<{status: string}>} Upload result
   */
  async sendChunk(peerId, manifestId, chunkIndex, data, hash) {
    if (!this.node) {
      throw new Error('Node not started');
    }
    
    console.log('[P2P] Sending chunk:', { peerId, manifestId, chunkIndex });
    
    let stream;
    try {
      const peerIdObj = peerIdFromString(peerId);
      stream = await this.node.dialProtocol(peerIdObj, CHUNK_PROTOCOL);
      
      const message = {
        type: 'chunk-upload',
        manifestId,
        chunkIndex,
        data,
        hash,
        timestamp: Date.now()
      };
      
      const response = await new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Upload timeout')), 30000);
        try {
          await this.writeJsonMessage(stream, message);
          const reply = await this.readJsonMessage(stream);
          clearTimeout(timer);
          if (!reply) {
            reject(new Error('No response'));
            return;
          }
          resolve(reply);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      
      return response;
      
    } catch (error) {
      console.error('[P2P] Chunk send failed:', error);
      throw error;
    } finally {
      // Ensure stream is properly closed
      if (stream) {
        try {
          await stream.close?.();
        } catch (err) {
          console.log('[P2P] Failed to close chunk send stream:', err.message);
        }
      }
    }
  }
  
  /**
   * Helper to convert base64 to Uint8Array
   */
  base64ToUint8Array(base64) {
    try {
      const binary = atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      throw new Error('Invalid base64 data');
    }
  }
  
  /**
   * Phase 3: DHT Operations for Domain Registry
   */
  
  /**
   * Register a domain name in the DHT
   * Maps domain -> manifestId
   * @param {string} domain - Domain name (e.g., "example.dweb")
   * @param {string} manifestId - Manifest ID to associate with domain
   * @param {Object} metadata - Optional metadata (owner, timestamp, etc.)
   * @returns {Promise<void>}
   */
  async registerDomainInDHT(domain, manifestId, metadata = {}) {
    if (!this.node || !this.isStarted) {
      throw new Error('Node not started');
    }
    
    if (!this.node.services.dht) {
      throw new Error('DHT service not available');
    }
    
    console.log('[P2P] [DHT] Registering domain:', { domain, manifestId });
    
    try {
      // Create key from domain name
      const key = new TextEncoder().encode(`/dweb/domain/${domain}`);
      
      // Create value with manifest ID and metadata
      const value = {
        manifestId,
        domain,
        timestamp: Date.now(),
        registeredBy: this.peerId,
        ...metadata
      };
      
      const valueBytes = new TextEncoder().encode(JSON.stringify(value));
      
      // Put value in DHT
      await this.node.services.dht.put(key, valueBytes);
      
      console.log('[P2P] [DHT] ✅ Domain registered successfully:', domain);
      
      return value;
      
    } catch (error) {
      console.error('[P2P] [DHT] ❌ Domain registration failed:', error);
      throw error;
    }
  }
  
  /**
   * Resolve a domain name from the DHT
   * @param {string} domain - Domain name to resolve
   * @param {number} timeout - Timeout in ms (default 10000)
   * @returns {Promise<{manifestId: string, ...metadata}>}
   */
  async resolveDomainFromDHT(domain, timeout = 10000) {
    if (!this.node || !this.isStarted) {
      throw new Error('Node not started');
    }
    
    if (!this.node.services.dht) {
      throw new Error('DHT service not available');
    }
    
    console.log('[P2P] [DHT] Resolving domain:', domain);
    
    try {
      // Create key from domain name
      const key = new TextEncoder().encode(`/dweb/domain/${domain}`);
      
      // Get value from DHT with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DHT lookup timeout')), timeout)
      );
      
      let valueBytes;
      try {
        valueBytes = await Promise.race([
          this.node.services.dht.get(key),
          timeoutPromise
        ]);
      } catch (err) {
        // If get fails, try using findProviders as fallback
        console.log('[P2P] [DHT] Direct get failed, trying findProviders...');
        throw new Error('Domain not found in DHT');
      }
      
      if (!valueBytes || valueBytes.length === 0) {
        throw new Error('Domain not found');
      }
      
      // Ensure valueBytes is Uint8Array
      let bytes = valueBytes;
      if (!(valueBytes instanceof Uint8Array)) {
        // If it's an array of bytes, convert to Uint8Array
        if (Array.isArray(valueBytes)) {
          bytes = new Uint8Array(valueBytes);
        } else if (valueBytes.value && Array.isArray(valueBytes.value)) {
          bytes = new Uint8Array(valueBytes.value);
        } else {
          console.error('[P2P] [DHT] Unexpected valueBytes format:', typeof valueBytes);
          throw new Error('Invalid DHT value format');
        }
      }
      
      // Decode value
      const valueStr = new TextDecoder().decode(bytes);
      const value = JSON.parse(valueStr);
      
      console.log('[P2P] [DHT] ✅ Domain resolved:', { domain, manifestId: value.manifestId });
      
      return value;
      
    } catch (error) {
      console.error('[P2P] [DHT] ❌ Domain resolution failed:', error);
      throw error;
    }
  }
  
  /**
   * Check if DHT is enabled and ready
   */
  isDHTEnabled() {
    return !!(this.node && this.node.services && this.node.services.dht);
  }
  
  /**
   * Get DHT peer count (connected to DHT)
   */
  async getDHTPeerCount() {
    if (!this.isDHTEnabled()) {
      return 0;
    }
    
    try {
      // Get routing table info if available
      const routingTable = this.node.services.dht.routingTable;
      if (routingTable) {
        return routingTable.size;
      }
      return 0;
    } catch (error) {
      console.warn('[P2P] [DHT] Could not get DHT peer count:', error.message);
      return 0;
    }
  }
}
