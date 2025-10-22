// Service worker for the DWeb Hosting Network extension.
// Uses offscreen documents for WebRTC (service workers don't support WebRTC APIs)

const peerChunkQueue = [];
const pendingChunkResponses = new Map();
const REQUEST_TIMEOUT = 2000;

// Background peer service state
let backgroundPeerEnabled = false;
let offscreenDocumentReady = false;
let offscreenCreationInProgress = false;
let localPeerId = null;
let peerCount = 0;

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/peer-offscreen.html';
const DEFAULT_SIGNALING_SECRET = 'choose-a-strong-secret';
const DEFAULT_REGISTRY_API_KEY = 'registry-test-key';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[DWeb] Extension installed');
  chrome.storage.local.set({ 'dweb-background-peer-enabled': true }, () => {
    console.log('[DWeb] Background peer service enabled by default');
    setupOffscreenDocument();
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[DWeb] Extension startup');
  setupOffscreenDocument();
});

// Auto-start on service worker activation (handles browser restarts, incognito, etc.)
self.addEventListener('activate', (event) => {
  console.log('[DWeb] Service worker activated');
  event.waitUntil(
    setupOffscreenDocument().catch(err => console.error('[DWeb] Auto-start failed:', err))
  );
});

// Ensure offscreen document starts even if no events fired
setTimeout(() => {
  if (!offscreenDocumentReady) {
    console.log('[DWeb] Starting offscreen document via timeout fallback');
    setupOffscreenDocument();
  }
}, 1000);

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
        setupOffscreenDocument();
      } else {
        stopBackgroundPeer();
      }
      sendResponse({ ok: true, enabled });
    });
    return true;
  }

  if (message.type === 'background-peer-status') {
    // Forward to offscreen document
    if (offscreenDocumentReady) {
      chrome.runtime.sendMessage({ type: 'get-peer-status' }, (response) => {
        sendResponse(response || {
          connected: false,
          peerId: null,
          peerCount: 0,
          discoveredCount: 0
        });
      });
      return true;
    } else {
      sendResponse({
        connected: false,
        peerId: null,
        peerCount: 0,
        discoveredCount: 0
      });
      return true;
    }
  }

  // Handle messages from offscreen document
  if (message.type === 'background-peer-connected') {
    localPeerId = message.peerId;
    console.log('[SW] Background peer connected:', localPeerId);
    return false;
  }

  if (message.type === 'peer-connected') {
    peerCount = message.totalConnections || 0;
    console.log('[SW] Peer connected, total:', peerCount);
    return false;
  }

  return false;
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-panel') {
    chrome.tabs.create({ url: chrome.runtime.getURL('panel/index.html') });
  }
});

// ============================================
// Offscreen Document Management
// ============================================

async function setupOffscreenDocument() {
  // Prevent multiple simultaneous creation attempts
  if (offscreenDocumentReady) {
    console.log('[SW] Offscreen document already ready');
    return;
  }
  
  if (offscreenCreationInProgress) {
    console.log('[SW] Offscreen document creation already in progress');
    return;
  }
  
  offscreenCreationInProgress = true;
  
  try {
    const settings = await chrome.storage.local.get([
      'dweb-background-peer-enabled',
      'dweb-signaling-auth-token',
      'dweb-registry-api-key'
    ]);

    backgroundPeerEnabled = settings['dweb-background-peer-enabled'] !== false;

    if (!backgroundPeerEnabled) {
      console.log('[SW] Background peer service disabled in settings');
      offscreenCreationInProgress = false;
      return;
    }

    // Double-check if offscreen document exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    if (existingContexts.length > 0) {
      console.log('[SW] Offscreen document already exists');
      offscreenDocumentReady = true;
      offscreenCreationInProgress = false;
      return;
    }

    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['WEB_RTC'],
      justification: 'Background peer-to-peer networking for decentralized hosting'
    });

    console.log('[SW] Offscreen document created');
    offscreenDocumentReady = true;

    // Start background peer in offscreen document
    const signalingAuthToken = settings['dweb-signaling-auth-token'] || DEFAULT_SIGNALING_SECRET;
    const registryApiKey = settings['dweb-registry-api-key'] || DEFAULT_REGISTRY_API_KEY;

    chrome.runtime.sendMessage({
      type: 'start-background-peer',
      config: {
        signalingAuthToken,
        registryApiKey
      }
    });

  } catch (error) {
    console.error('[SW] Failed to setup offscreen document:', error);
    offscreenDocumentReady = false;
  } finally {
    offscreenCreationInProgress = false;
  }
}

async function stopBackgroundPeer() {
  try {
    if (offscreenDocumentReady) {
      chrome.runtime.sendMessage({ type: 'stop-background-peer' });
    }
    
    await chrome.offscreen.closeDocument();
    offscreenDocumentReady = false;
    localPeerId = null;
    peerCount = 0;
    console.log('[SW] Background peer stopped');
  } catch (error) {
    console.error('[SW] Error stopping background peer:', error);
  }
}
