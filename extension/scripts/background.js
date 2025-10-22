// Service worker for the DWeb Hosting Network extension.

import { WebRTCConnectionManager } from './webrtc/connectionManager.js';
import { ChunkManager } from './webrtc/chunkManager.js';
import { RegistryClient } from './api/registryClient.js';

const peerChunkQueue = [];
const pendingChunkResponses = new Map();
const REQUEST_TIMEOUT = 2000;

// Background peer service state
let backgroundPeerEnabled = false;
let connectionManager = null;
let chunkManager = null;
let registryClient = null;
let localPeerId = null;
const chunkCache = new Map();
let discoveredPeers = [];
const activePeerConnections = new Map(); // peerId -> { manager, status, connectedAt }
const connectionAttempts = new Map(); // peerId -> attemptCount

const DEFAULT_SIGNALING_URL = 'ws://34.107.74.70:8787';
const DEFAULT_REGISTRY_URL = 'http://34.107.74.70:8788';
const DEFAULT_SIGNALING_SECRET = 'choose-a-strong-secret';
const DEFAULT_REGISTRY_API_KEY = 'registry-test-key';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[DWeb] Extension installed');
  // Auto-enable background peer service
  chrome.storage.local.set({ 'dweb-background-peer-enabled': true }, () => {
    console.log('[DWeb] Background peer service enabled by default');
    initializeBackgroundPeer();
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[DWeb] Extension startup');
  initializeBackgroundPeer();
});

// Intercept .dweb navigation and redirect to resolver
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return; // Only main frame
    
    try {
      const url = new URL(details.url);
      const hostname = url.hostname.toLowerCase();
      
      // Check if it's a .dweb domain
      if (hostname.endsWith('.dweb')) {
        console.log('[DWeb] Intercepting navigation to:', hostname);
        
        // Redirect to resolver with domain parameter
        const resolverUrl = chrome.runtime.getURL(`resolver/index.html?domain=${encodeURIComponent(hostname)}`);
        
        chrome.tabs.update(details.tabId, { url: resolverUrl }, () => {
          if (chrome.runtime.lastError) {
            console.error('[DWeb] Failed to redirect:', chrome.runtime.lastError);
          }
        });
      }
    } catch (error) {
      console.error('[DWeb] Navigation interception error:', error);
    }
  },
  { url: [{ hostSuffix: '.dweb' }] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'ping') {
    sendResponse({ ok: true, time: Date.now() });
    return true;
  }

  if (message.type === 'peer-chunk-request') {
    const { manifestId, chunkIndex, replicas } = message;
    const requestId = `${manifestId}:${chunkIndex}:${Date.now()}`;

    console.log('[SW] Peer chunk request', { manifestId, chunkIndex, replicas, requestId });

    peerChunkQueue.push({ requestId, manifestId, chunkIndex, replicas, requestedAt: Date.now() });
    const timeout = setTimeout(() => {
      if (pendingChunkResponses.has(requestId)) {
        const responder = pendingChunkResponses.get(requestId);
        responder({ status: 'timeout' });
        pendingChunkResponses.delete(requestId);
      }
    }, REQUEST_TIMEOUT);

    pendingChunkResponses.set(requestId, (response) => {
      clearTimeout(timeout);
      sendResponse(response);
    });

    chrome.runtime.sendMessage(
      {
        type: 'peer-chunk-request-dispatch',
        requestId,
        manifestId,
        chunkIndex,
        replicas
      },
      () => {
        if (chrome.runtime.lastError) {
          const responder = pendingChunkResponses.get(requestId);
          if (responder) {
            responder({ status: 'unavailable' });
            pendingChunkResponses.delete(requestId);
          }
        }
      }
    );

    return true;
  }

  if (message.type === 'peer-chunk-response') {
    const { requestId, status, data, reason } = message;
    const responder = pendingChunkResponses.get(requestId);
    if (responder) {
      responder({ status: status ?? 'success', data, reason });
      pendingChunkResponses.delete(requestId);
    }
    return true;
  }

  if (message.type === 'background-peer-toggle') {
    const enabled = Boolean(message.enabled);
    chrome.storage.local.set({ 'dweb-background-peer-enabled': enabled }, () => {
      console.log('[DWeb] Background peer service', enabled ? 'enabled' : 'disabled');
      if (enabled) {
        initializeBackgroundPeer();
      } else {
        disconnectBackgroundPeer();
      }
      sendResponse({ ok: true, enabled });
    });
    return true;
  }

  if (message.type === 'background-peer-status') {
    sendResponse({
      connected: Boolean(connectionManager),
      peerId: localPeerId,
      peerCount: activePeerConnections.size,
      discoveredCount: discoveredPeers.length,
      relayMode: false // TODO: implement relay detection
    });
    return true;
  }

  return false;
});

// ============================================
// Background Peer Service Implementation
// ============================================

async function initializeBackgroundPeer() {
  try {
    const settings = await chrome.storage.local.get([
      'dweb-background-peer-enabled',
      'dweb-signaling-auth-token',
      'dweb-registry-api-key'
    ]);

    backgroundPeerEnabled = settings['dweb-background-peer-enabled'] !== false;

    if (!backgroundPeerEnabled) {
      console.log('[DWeb] Background peer service disabled in settings');
      return;
    }

    if (connectionManager) {
      console.log('[DWeb] Background peer already connected');
      return;
    }

    const signalingAuthToken = settings['dweb-signaling-auth-token'] || DEFAULT_SIGNALING_SECRET;
    const registryApiKey = settings['dweb-registry-api-key'] || DEFAULT_REGISTRY_API_KEY;

    // Initialize managers
    chunkManager = new ChunkManager();
    registryClient = new RegistryClient(DEFAULT_REGISTRY_URL, { apiKey: registryApiKey });

    // Generate peer ID
    localPeerId = `bg-peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Connect to signaling
    connectionManager = new WebRTCConnectionManager({
      signalingUrl: DEFAULT_SIGNALING_URL,
      peerId: localPeerId,
      authToken: signalingAuthToken
    });

    setupBackgroundPeerEventHandlers();

    await connectionManager.connect();
    console.log('[DWeb] Background peer connected:', localPeerId);

  } catch (error) {
    console.error('[DWeb] Background peer initialization failed:', error);
    connectionManager = null;
  }
}

function disconnectBackgroundPeer() {
  if (connectionManager) {
    try {
      connectionManager.disconnect?.();
    } catch (error) {
      console.error('[DWeb] Background peer disconnect error:', error);
    }
    connectionManager = null;
  }
  activePeerConnections.clear();
  connectionAttempts.clear();
  chunkCache.clear();
  localPeerId = null;
  console.log('[DWeb] Background peer disconnected');
}

function setupBackgroundPeerEventHandlers() {
  if (!connectionManager) return;

  connectionManager.addEventListener('registered', (event) => {
    console.log('[DWeb] Background peer registered:', event.detail.peerId);
    if (event.detail.peers && Array.isArray(event.detail.peers)) {
      discoveredPeers = event.detail.peers.filter(p => p.peerId !== localPeerId);
      console.log('[DWeb] Discovered peers:', discoveredPeers.length);
      // Auto-connect to discovered peers
      connectToDiscoveredPeers();
    }
  });

  connectionManager.addEventListener('signaling', (event) => {
    const message = event.detail;
    if (message.type === 'peer-list') {
      discoveredPeers = (message.peers || []).filter(p => p.peerId !== localPeerId);
      console.log('[DWeb] Peer list updated:', discoveredPeers.length);
      connectToDiscoveredPeers();
    } else if (message.type === 'peer-joined') {
      if (!discoveredPeers.find(p => p.peerId === message.peerId)) {
        discoveredPeers.push({ peerId: message.peerId });
        console.log('[DWeb] Peer joined:', message.peerId);
        // Auto-connect to new peer
        connectToPeer(message.peerId);
      }
    } else if (message.type === 'peer-left') {
      discoveredPeers = discoveredPeers.filter(p => p.peerId !== message.peerId);
      console.log('[DWeb] Peer left:', message.peerId);
      // Clean up connection
      activePeerConnections.delete(message.peerId);
    }
  });


  connectionManager.addEventListener('error', (event) => {
    console.error('[DWeb] Background peer error:', event.detail);
  });
}

async function handleBackgroundPeerMessage(message, manager = null, fromPeerId = null) {
  switch (message.type) {
    case 'chunk-upload':
      await handleChunkUpload(message);
      break;
    
    case 'chunk-request':
      await handleChunkRequest(message);
      break;
    
    case 'replication-request':
      console.log('[DWeb] Replication request received:', message.manifestId);
      // Auto-accept replication (user installed extension = consent)
      break;
    
    default:
      console.log('[DWeb] Unknown background message type:', message.type);
  }
}

async function handleChunkUpload(message) {
  const { manifestId, chunkIndex, data, hash } = message;
  
  if (!manifestId || typeof chunkIndex !== 'number' || !data) {
    console.error('[DWeb] Invalid chunk-upload payload');
    return;
  }

  try {
    // Validate hash if provided
    if (hash) {
      const chunkBytes = base64ToUint8Array(data);
      const computed = await chunkManager.computeHash(chunkBytes.buffer);
      if (computed !== hash) {
        const mgr = manager || connectionManager;
        mgr?.sendJson({
          type: 'chunk-upload-nack',
          manifestId,
          chunkIndex,
          peerId: localPeerId,
          reason: 'hash-mismatch'
        });
        return;
      }
    }

    // Cache chunk
    if (!chunkCache.has(manifestId)) {
      chunkCache.set(manifestId, []);
    }
    chunkCache.get(manifestId)[chunkIndex] = data;

    console.log(`[DWeb] Chunk ${chunkIndex} cached for manifest ${manifestId}`);

    // Send ACK
    const mgr = manager || connectionManager;
    mgr?.sendJson({
      type: 'chunk-upload-ack',
      manifestId,
      chunkIndex,
      peerId: localPeerId,
      status: 'ok'
    });

    // Notify registry
    try {
      await registryClient.updateChunkReplica(manifestId, {
        peerId: localPeerId,
        chunkIndexes: [chunkIndex],
        status: 'available'
      });
      console.log(`[DWeb] Registry notified for chunk ${chunkIndex}`);
    } catch (error) {
      console.warn('[DWeb] Registry update failed:', error.message);
    }

  } catch (error) {
    console.error('[DWeb] Chunk upload handling failed:', error);
    const mgr = manager || connectionManager;
    mgr?.sendJson({
      type: 'chunk-upload-nack',
      manifestId,
      chunkIndex,
      peerId: localPeerId,
      reason: error.message
    });
  }
}

async function handleChunkRequest(message) {
  const { requestId, manifestId, chunkIndex } = message;
  
  // Check cache
  const cached = chunkCache.get(manifestId)?.[chunkIndex];
  
  const mgr = manager || connectionManager;
  if (cached) {
    mgr?.sendJson({
      type: 'chunk-response',
      requestId,
      manifestId,
      chunkIndex,
      data: cached
    });
    console.log(`[DWeb] Served chunk ${chunkIndex} from cache`);
  } else {
    mgr?.sendJson({
      type: 'chunk-error',
      requestId,
      manifestId,
      chunkIndex,
      reason: 'chunk-not-found'
    });
    console.log(`[DWeb] Chunk ${chunkIndex} not found in cache`);
  }
}

// ============================================
// Peer Connection Management
// ============================================

async function connectToDiscoveredPeers() {
  for (const peer of discoveredPeers) {
    if (!activePeerConnections.has(peer.peerId)) {
      await connectToPeer(peer.peerId);
    }
  }
}

async function connectToPeer(targetPeerId) {
  if (!connectionManager || !targetPeerId || targetPeerId === localPeerId) {
    return;
  }

  // Check if already connected or attempting
  const existing = activePeerConnections.get(targetPeerId);
  if (existing) {
    console.log(`[DWeb] Already ${existing.status} to peer ${targetPeerId}`);
    return;
  }

  // Limit connection attempts
  const attempts = connectionAttempts.get(targetPeerId) || 0;
  if (attempts >= 3) {
    console.log(`[DWeb] Max connection attempts reached for ${targetPeerId}`);
    return;
  }

  connectionAttempts.set(targetPeerId, attempts + 1);

  try {
    console.log(`[DWeb] Initiating connection to peer ${targetPeerId}`);
    
    // Create a new connection manager for this peer
    const peerConnectionManager = new WebRTCConnectionManager({
      signalingUrl: DEFAULT_SIGNALING_URL,
      peerId: localPeerId,
      authToken: connectionManager.authToken
    });

    // Set up event handlers for this peer connection
    setupPeerConnectionHandlers(peerConnectionManager, targetPeerId);

    // Use existing signaling client from main connection manager
    peerConnectionManager.signalingClient = connectionManager.signalingClient;
    peerConnectionManager.iceServers = connectionManager.iceServers;

    // Mark as connecting
    activePeerConnections.set(targetPeerId, {
      manager: peerConnectionManager,
      status: 'connecting',
      connectedAt: Date.now()
    });

    // Initiate the connection
    await peerConnectionManager.initiateConnection(targetPeerId);
    console.log(`[DWeb] Connection initiated to ${targetPeerId}`);
  } catch (error) {
    console.error(`[DWeb] Failed to connect to peer ${targetPeerId}:`, error);
    activePeerConnections.delete(targetPeerId);
  }
}

function setupPeerConnectionHandlers(manager, targetPeerId) {
  manager.addEventListener('channel-open', () => {
    console.log(`[DWeb] Data channel opened with ${targetPeerId}`);
    const conn = activePeerConnections.get(targetPeerId);
    if (conn) {
      conn.status = 'connected';
      conn.connectedAt = Date.now();
      console.log(`[DWeb] Active connections: ${activePeerConnections.size}`);
    }
  });

  manager.addEventListener('channel-close', () => {
    console.log(`[DWeb] Data channel closed with ${targetPeerId}`);
    activePeerConnections.delete(targetPeerId);
  });

  manager.addEventListener('channel-message', async (event) => {
    if (event.detail.kind === 'text') {
      try {
        const message = JSON.parse(event.detail.data);
        await handleBackgroundPeerMessage(message, manager, targetPeerId);
      } catch (error) {
        console.error(`[DWeb] Message handling error from ${targetPeerId}:`, error);
      }
    }
  });

  manager.addEventListener('error', (event) => {
    console.error(`[DWeb] Peer connection error with ${targetPeerId}:`, event.detail);
  });
}

function base64ToUint8Array(base64) {
  try {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
