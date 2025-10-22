// Offscreen document for background peer with WebRTC support
import { WebRTCConnectionManager } from '../scripts/webrtc/connectionManager.js';
import { ChunkManager } from '../scripts/webrtc/chunkManager.js';
import { RegistryClient } from '../scripts/api/registryClient.js';

const DEFAULT_SIGNALING_URL = 'ws://34.107.74.70:8787';
const DEFAULT_REGISTRY_URL = 'http://34.107.74.70:8788';
const DEFAULT_SIGNALING_SECRET = 'choose-a-strong-secret';
const DEFAULT_REGISTRY_API_KEY = 'registry-test-key';

let connectionManager = null;
let chunkManager = null;
let registryClient = null;
let localPeerId = null;
const chunkCache = new Map();
let discoveredPeers = [];
const activePeerConnections = new Map();
const connectionAttempts = new Map();

console.log('[Offscreen] Background peer service initialized');

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type);
  
  if (message.type === 'start-background-peer') {
    startBackgroundPeer(message.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'stop-background-peer') {
    stopBackgroundPeer();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'get-peer-status') {
    sendResponse({
      connected: Boolean(connectionManager),
      peerId: localPeerId,
      peerCount: activePeerConnections.size,
      discoveredCount: discoveredPeers.length
    });
    return true;
  }
  
  return false;
});

async function startBackgroundPeer(config = {}) {
  if (connectionManager) {
    console.log('[Offscreen] Background peer already running');
    return;
  }
  
  const signalingAuthToken = config.signalingAuthToken || DEFAULT_SIGNALING_SECRET;
  const registryApiKey = config.registryApiKey || DEFAULT_REGISTRY_API_KEY;
  
  chunkManager = new ChunkManager();
  registryClient = new RegistryClient(DEFAULT_REGISTRY_URL, { apiKey: registryApiKey });
  
  localPeerId = `bg-peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  
  connectionManager = new WebRTCConnectionManager({
    signalingUrl: DEFAULT_SIGNALING_URL,
    peerId: localPeerId,
    authToken: signalingAuthToken
  });
  
  setupMainConnectionHandlers();
  
  await connectionManager.connect();
  console.log('[Offscreen] Background peer connected:', localPeerId);
  
  // Notify service worker
  chrome.runtime.sendMessage({
    type: 'background-peer-connected',
    peerId: localPeerId
  });
}

function stopBackgroundPeer() {
  if (connectionManager) {
    connectionManager.disconnect();
    connectionManager = null;
  }
  
  activePeerConnections.forEach(conn => {
    conn.manager?.disconnect();
  });
  activePeerConnections.clear();
  connectionAttempts.clear();
  chunkCache.clear();
  localPeerId = null;
  
  console.log('[Offscreen] Background peer stopped');
}

function setupMainConnectionHandlers() {
  connectionManager.addEventListener('registered', (event) => {
    console.log('[Offscreen] Registered as peer:', event.detail.peerId);
    if (event.detail.peers && Array.isArray(event.detail.peers)) {
      discoveredPeers = event.detail.peers.filter(p => p.peerId !== localPeerId);
      console.log('[Offscreen] Discovered peers:', discoveredPeers.length);
      console.log('[Offscreen] Waiting for incoming connections (passive mode)');
      // Don't initiate connections - wait for others to connect to us
      // This simplifies the architecture and avoids the multi-peer connection issue
    }
  });
  
  connectionManager.addEventListener('signaling', (event) => {
    const message = event.detail;
    if (message.type === 'peer-list') {
      discoveredPeers = (message.peers || []).filter(p => p.peerId !== localPeerId);
      console.log('[Offscreen] Peer list updated:', discoveredPeers.length);
    } else if (message.type === 'peer-joined') {
      if (!discoveredPeers.find(p => p.peerId === message.peerId)) {
        discoveredPeers.push({ peerId: message.peerId });
        console.log('[Offscreen] Peer joined:', message.peerId, '(waiting for their connection)');
      }
    } else if (message.type === 'peer-left') {
      discoveredPeers = discoveredPeers.filter(p => p.peerId !== message.peerId);
      console.log('[Offscreen] Peer left:', message.peerId);
    }
  });
  
  connectionManager.addEventListener('channel-open', (event) => {
    console.log('[Offscreen] Incoming peer connection opened');
    // Track incoming connection
    if (connectionManager.targetPeerId) {
      activePeerConnections.set(connectionManager.targetPeerId, {
        manager: connectionManager,
        status: 'connected',
        connectedAt: Date.now()
      });
      console.log(`[Offscreen] Active connections: ${activePeerConnections.size}`);
      
      // Notify service worker
      chrome.runtime.sendMessage({
        type: 'peer-connected',
        peerId: connectionManager.targetPeerId,
        totalConnections: activePeerConnections.size
      });
    }
  });

  connectionManager.addEventListener('channel-message', async (event) => {
    if (event.detail.kind === 'text') {
      try {
        const message = JSON.parse(event.detail.data);
        await handlePeerMessage(message, connectionManager, connectionManager.targetPeerId);
      } catch (error) {
        console.error('[Offscreen] Message handling error:', error);
      }
    }
  });

  connectionManager.addEventListener('error', (event) => {
    console.error('[Offscreen] Connection error:', event.detail);
  });
}

// Passive mode: We only accept incoming connections from other peers
// This simplifies the architecture - no need to manage multiple connection managers

async function handlePeerMessage(message, manager, fromPeerId) {
  switch (message.type) {
    case 'chunk-upload':
      await handleChunkUpload(message, manager);
      break;
    
    case 'chunk-request':
      await handleChunkRequest(message, manager);
      break;
    
    case 'replication-request':
      console.log('[Offscreen] Replication request received:', message.manifestId);
      break;
    
    default:
      console.log('[Offscreen] Unknown message type:', message.type);
  }
}

async function handleChunkUpload(message, manager) {
  const { manifestId, chunkIndex, data, hash } = message;
  
  if (!manifestId || typeof chunkIndex !== 'number' || !data) {
    console.error('[Offscreen] Invalid chunk-upload payload');
    return;
  }
  
  try {
    if (hash) {
      const chunkBytes = base64ToUint8Array(data);
      const computed = await chunkManager.computeHash(chunkBytes.buffer);
      if (computed !== hash) {
        manager?.sendJson({
          type: 'chunk-upload-nack',
          manifestId,
          chunkIndex,
          peerId: localPeerId,
          reason: 'hash-mismatch'
        });
        return;
      }
    }
    
    if (!chunkCache.has(manifestId)) {
      chunkCache.set(manifestId, []);
    }
    chunkCache.get(manifestId)[chunkIndex] = data;
    
    console.log(`[Offscreen] Chunk ${chunkIndex} cached for manifest ${manifestId}`);
    
    manager?.sendJson({
      type: 'chunk-upload-ack',
      manifestId,
      chunkIndex,
      peerId: localPeerId,
      status: 'ok'
    });
    
    try {
      await registryClient.updateChunkReplica(manifestId, {
        peerId: localPeerId,
        chunkIndexes: [chunkIndex],
        status: 'available'
      });
      console.log(`[Offscreen] Registry notified for chunk ${chunkIndex}`);
    } catch (error) {
      console.warn('[Offscreen] Registry update failed:', error.message);
    }
  } catch (error) {
    console.error('[Offscreen] Chunk upload handling failed:', error);
    manager?.sendJson({
      type: 'chunk-upload-nack',
      manifestId,
      chunkIndex,
      peerId: localPeerId,
      reason: error.message
    });
  }
}

async function handleChunkRequest(message, manager) {
  const { requestId, manifestId, chunkIndex } = message;
  
  const cached = chunkCache.get(manifestId)?.[chunkIndex];
  
  if (cached) {
    manager?.sendJson({
      type: 'chunk-response',
      requestId,
      manifestId,
      chunkIndex,
      data: cached
    });
    console.log(`[Offscreen] Served chunk ${chunkIndex} from cache`);
  } else {
    manager?.sendJson({
      type: 'chunk-error',
      requestId,
      manifestId,
      chunkIndex,
      reason: 'chunk-not-found'
    });
    console.log(`[Offscreen] Chunk ${chunkIndex} not found in cache`);
  }
}

function base64ToUint8Array(base64) {
  try {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
