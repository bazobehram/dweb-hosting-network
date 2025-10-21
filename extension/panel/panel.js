import { WebRTCConnectionManager } from '../scripts/webrtc/connectionManager.js';
import { ChunkManager } from '../scripts/webrtc/chunkManager.js';
import { RegistryClient } from '../scripts/api/registryClient.js';
import { TelemetryClient } from '../scripts/telemetry/telemetryClient.js';

const signalingInput = document.getElementById('signalingUrl');
const peerIdInput = document.getElementById('peerId');
const signalingAuthTokenInput = document.getElementById('signalingAuthToken');
const connectBtn = document.getElementById('connectBtn');
const statusLog = document.getElementById('statusLog');
const peerList = document.getElementById('peerList');
const peerSelect = document.getElementById('peerSelect');
const openChannelBtn = document.getElementById('openChannelBtn');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const sendFileBtn = document.getElementById('sendFileBtn');
const fileInput = document.getElementById('fileInput');
const channelStatus = document.getElementById('channelStatus');
const channelLog = document.getElementById('channelLog');
const downloadArea = document.getElementById('downloadArea');

const registryUrlInput = document.getElementById('registryUrl');
const registryApiKeyInput = document.getElementById('registryApiKey');
const domainInput = document.getElementById('domainInput');
const ownerInput = document.getElementById('ownerInput');
const registerDomainBtn = document.getElementById('registerDomainBtn');
const registryLog = document.getElementById('registryLog');
const autoReplicaToggle = document.getElementById('autoReplicaToggle');
const replicaTargetCountInput = document.getElementById('replicaTargetCount');
const manualReplicaContainer = document.getElementById('manualReplicaContainer');
const manualReplicaList = document.getElementById('manualReplicaList');
const replicationStatusContainer = document.getElementById('replicationStatus');
const clearManualReplicasBtn = document.getElementById('clearManualReplicasBtn');
const resetReplicationSettingsBtn = document.getElementById('resetReplicationSettingsBtn');
const storageServiceUrlInput = document.getElementById('storageServiceUrl');
const inlineRegistryDataToggle = document.getElementById('inlineRegistryDataToggle');
const storageFallbackToggle = document.getElementById('storageFallbackToggle');
const REPLICATION_STORAGE_KEY = 'dweb-replication-settings';
const REGISTRY_API_KEY_STORAGE_KEY = 'dweb-registry-api-key';
const SIGNALING_AUTH_STORAGE_KEY = 'dweb-signaling-auth-token';
const STORAGE_API_KEY_STORAGE_KEY = 'dweb-storage-api-key';
const STORAGE_SERVICE_URL_STORAGE_KEY = 'dweb-storage-service-url';
const PERSISTENCE_SETTINGS_STORAGE_KEY = 'dweb-persistence-settings';

const DEFAULT_SIGNALING_URL = 'ws://34.107.74.70:8787';
const DEFAULT_SIGNALING_SECRET = 'choose-a-strong-secret';
const DEFAULT_REGISTRY_URL = 'http://34.107.74.70:8788';
const DEFAULT_REGISTRY_API_KEY = 'registry-test-key';
const DEFAULT_STORAGE_SERVICE_URL = 'http://34.107.74.70:8789';
const DEFAULT_STORAGE_API_KEY = 'storage-test-key';

if (signalingInput && !signalingInput.value) {
  signalingInput.value = DEFAULT_SIGNALING_URL;
}
if (registryUrlInput && !registryUrlInput.value) {
  registryUrlInput.value = DEFAULT_REGISTRY_URL;
}

const chunkManager = new ChunkManager();
let storedRegistryApiKey = loadRegistryApiKey();
if (!storedRegistryApiKey && DEFAULT_REGISTRY_API_KEY) {
  storedRegistryApiKey = DEFAULT_REGISTRY_API_KEY;
  persistRegistryApiKey(storedRegistryApiKey);
}
let storedSignalingAuthToken = loadSignalingAuthToken();
if (!storedSignalingAuthToken && DEFAULT_SIGNALING_SECRET) {
  storedSignalingAuthToken = DEFAULT_SIGNALING_SECRET;
  persistSignalingAuthToken(storedSignalingAuthToken);
}
let storedStorageApiKey = loadStorageApiKey();
if (!storedStorageApiKey && DEFAULT_STORAGE_API_KEY) {
  storedStorageApiKey = DEFAULT_STORAGE_API_KEY;
  persistStorageApiKey(storedStorageApiKey);
}
const registryClient = new RegistryClient(registryUrlInput.value || DEFAULT_REGISTRY_URL, {
  apiKey: storedRegistryApiKey
});
const chunkCache = new Map();
const manifestReplicationState = new Map();
const rawStorageServiceUrl = loadStorageServiceUrl();
let storageServiceUrl =
  normaliseStorageServiceUrl(rawStorageServiceUrl) || DEFAULT_STORAGE_SERVICE_URL;
if (!rawStorageServiceUrl) {
  persistStorageServiceUrl(storageServiceUrl);
}
let storageServiceOrigin = computeOrigin(storageServiceUrl);
const telemetry = new TelemetryClient({ component: 'panel' });
const PERSISTENCE_DEFAULTS = {
  storeChunkData: false,
  uploadChunksToStorage: false
};
let persistenceSettings = {
  storeChunkData: PERSISTENCE_DEFAULTS.storeChunkData,
  uploadChunksToStorage: PERSISTENCE_DEFAULTS.uploadChunksToStorage
};
const storedPersistence = loadPersistenceSettings();
if (typeof storedPersistence.storeChunkData === 'boolean') {
  persistenceSettings.storeChunkData = storedPersistence.storeChunkData;
}
if (typeof storedPersistence.uploadChunksToStorage === 'boolean') {
  persistenceSettings.uploadChunksToStorage = storedPersistence.uploadChunksToStorage;
}
applyPersistenceToggleState();
const DEFAULT_MAX_REPLICA_TARGETS = 3;
const MAX_REPLICATION_RETRIES = 3;
const REPLICATION_ACK_TIMEOUT = 8_000;
const REPLICATION_MAX_INFLIGHT = 2;
const MANUAL_REPLICA_LIMIT = 5;
const REPLICATION_ACK_QUORUM = 2;
let replicationUpdateHandler = () => {};
function setReplicationUpdateHandler(handler) {
  replicationUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

function loadReplicationSettings() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REPLICATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const settings = {};
    if (typeof parsed.autoSelect === 'boolean') settings.autoSelect = parsed.autoSelect;
    if (Number.isFinite(parsed.limit)) settings.limit = parsed.limit;
    if (Array.isArray(parsed.manualPeers)) {
      settings.manualPeers = parsed.manualPeers
        .filter((entry) => entry && typeof entry.peerId === 'string')
        .map((entry) => ({ peerId: entry.peerId, ts: Number(entry.ts) || Date.now() }));
    }
    return settings;
  } catch {
    return {};
  }
}

function persistReplicationSettings() {
  if (typeof localStorage === 'undefined') return;
  try {
    const manualPeers = getManualReplicaEntries().map(({ peerId, ts }) => ({ peerId, ts }));
    const payload = {
      autoSelect: autoReplicaSelection,
      limit: maxReplicaTargets,
      manualPeers
    };
    localStorage.setItem(REPLICATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore persistence errors
  }
}

function getManualReplicaEntries() {
  return Array.from(manualReplicaPrefs.entries())
    .map(([peerId, ts]) => ({ peerId, ts: Number(ts) || 0 }))
    .sort((a, b) => a.ts - b.ts);
}

function loadRegistryApiKey() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(REGISTRY_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistRegistryApiKey(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(REGISTRY_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(REGISTRY_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore persistence errors
  }
}

function loadSignalingAuthToken() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SIGNALING_AUTH_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistSignalingAuthToken(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(SIGNALING_AUTH_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(SIGNALING_AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadStorageApiKey() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistStorageApiKey(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadStorageServiceUrl() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_SERVICE_URL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistStorageServiceUrl(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_SERVICE_URL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_SERVICE_URL_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadPersistenceSettings() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PERSISTENCE_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistPersistenceSettings() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      PERSISTENCE_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        storeChunkData: shouldStoreChunkDataInRegistry(),
        uploadChunksToStorage: shouldUploadChunksToStorage()
      })
    );
  } catch {
    // ignore persistence errors
  }
}

function applyPersistenceToggleState() {
  if (inlineRegistryDataToggle) {
    inlineRegistryDataToggle.checked = shouldStoreChunkDataInRegistry();
  }
  if (storageFallbackToggle) {
    storageFallbackToggle.checked = shouldUploadChunksToStorage();
  }
}

function shouldStoreChunkDataInRegistry() {
  return Boolean(persistenceSettings.storeChunkData);
}

function shouldUploadChunksToStorage() {
  return Boolean(persistenceSettings.uploadChunksToStorage);
}

function getReplicaTargetCapacity() {
  if (autoReplicaSelection) {
    return Math.max(1, maxReplicaTargets);
  }
  const selected = manualReplicaPrefs.size;
  return Math.max(1, selected || 0);
}

function getEffectiveAckQuorum() {
  return Math.max(1, Math.min(REPLICATION_ACK_QUORUM, getReplicaTargetCapacity()));
}

function resolveManifestId(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  return manifest.manifestId ?? manifest.transferId ?? null;
}

function resetManifestReplicationState(manifest) {
  const manifestId = resolveManifestId(manifest);
  if (!manifestId) return;
  manifestReplicationState.clear();
  manifestReplicationState.set(manifestId, {
    required: getEffectiveAckQuorum(),
    remoteAcks: new Set(),
    updatedAt: Date.now()
  });
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function clearManifestReplicationState(manifestId) {
  if (!manifestId) return;
  manifestReplicationState.delete(manifestId);
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function markManifestReplica(manifestId, peerId) {
  if (!manifestId || !peerId || peerId === localPeerId) return;
  const state = manifestReplicationState.get(manifestId);
  if (!state) return;
  if (!state.remoteAcks.has(peerId)) {
    state.remoteAcks.add(peerId);
    state.updatedAt = Date.now();
    appendRegistryLog(
      `Replica quorum progress: ${state.remoteAcks.size}/${state.required} remote peers confirmed (${peerId}).`
    );
  }
  const required = getEffectiveAckQuorum();
  if (state.required !== required) {
    state.required = required;
  }
  if (state.remoteAcks.size >= state.required) {
    appendRegistryLog('Replication quorum reached. Domain registration unlocked.');
  }
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function manifestHasReplicationQuorum(manifestId) {
  const state = manifestReplicationState.get(manifestId);
  if (!state) return false;
  return state.remoteAcks.size >= state.required;
}

function getManifestReplicationSummary(manifestId) {
  const state = manifestReplicationState.get(manifestId);
  if (!state) {
    return {
      required: getEffectiveAckQuorum(),
      remoteAckCount: 0,
      peers: [],
      updatedAt: null
    };
  }
  return {
    required: state.required,
    remoteAckCount: state.remoteAcks.size,
    peers: Array.from(state.remoteAcks),
    updatedAt: state.updatedAt ?? null
  };
}

function updateManifestQuorumTargets() {
  const required = getEffectiveAckQuorum();
  manifestReplicationState.forEach((state) => {
    state.required = required;
  });
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function computeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normaliseStorageServiceUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function applyStorageServiceUrl(value) {
  const normalised =
    normaliseStorageServiceUrl(value) || DEFAULT_STORAGE_SERVICE_URL;
  storageServiceUrl = normalised;
  storageServiceOrigin = computeOrigin(storageServiceUrl);
  persistStorageServiceUrl(storageServiceUrl);
  if (storageServiceUrlInput && storageServiceUrlInput.value.trim() !== storageServiceUrl) {
    storageServiceUrlInput.value = storageServiceUrl;
  }
  appendChannelLog(`Storage service URL set to ${storageServiceUrl}.`);
}

function buildStorageHeaders(extra = {}) {
  if (!storageApiKey) return { ...extra };
  const trimmed = storageApiKey.trim();
  const headers = {
    ...extra,
    'X-API-Key': trimmed
  };
  if (/^Bearer\s+/i.test(trimmed)) {
    headers.Authorization = trimmed;
  } else {
    headers.Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}

function shouldAttachStorageHeaders(targetUrl) {
  if (!storageApiKey) return false;
  if (!storageServiceOrigin) return false;
  try {
    const origin = new URL(targetUrl).origin;
    return origin === storageServiceOrigin;
  } catch {
    return false;
  }
}

let connectionManager = null;
let localPeerId = null;
let peers = [];
let outgoingTransfer = null;
let incomingTransfer = null;
let lastManifestRecord = null;
const pendingPeerRequests = new Map();
const replicationManager = createReplicationManager();
setReplicationUpdateHandler((snapshot) => renderReplicationStatus(snapshot));
let maxReplicaTargets = DEFAULT_MAX_REPLICA_TARGETS;
let autoReplicaSelection = true;
const manualReplicaPrefs = new Map();
let signalingAuthToken = storedSignalingAuthToken;
let storageApiKey = storedStorageApiKey;
initializeReplicationControls();

if (registryApiKeyInput) {
  registryApiKeyInput.value = storedRegistryApiKey;
  if (storedRegistryApiKey) {
    appendRegistryLog('Loaded registry API key from local storage.');
  }
  registryApiKeyInput.addEventListener('change', () => {
    const value = registryApiKeyInput.value.trim();
    registryClient.setApiKey(value);
    persistRegistryApiKey(value);
    appendRegistryLog(value ? 'Registry API key updated.' : 'Registry API key cleared.');
  });
}

if (signalingAuthTokenInput) {
  signalingAuthTokenInput.value = storedSignalingAuthToken;
  signalingAuthTokenInput.addEventListener('change', () => {
    signalingAuthToken = signalingAuthTokenInput.value.trim();
    persistSignalingAuthToken(signalingAuthToken);
    appendLog(
      signalingAuthToken
        ? 'Signaling shared secret stored locally.'
        : 'Signaling shared secret cleared.'
    );
  });
}

const storageApiKeyInput = document.getElementById('storageApiKey');
if (storageApiKeyInput) {
  storageApiKeyInput.value = storedStorageApiKey;
  storageApiKeyInput.addEventListener('change', () => {
    storageApiKey = storageApiKeyInput.value.trim();
    persistStorageApiKey(storageApiKey);
    appendChannelLog(
      storageApiKey ? 'Storage API key applied for uploads.' : 'Storage API key cleared.'
    );
  });
}

if (storageServiceUrlInput) {
  storageServiceUrlInput.value = storageServiceUrl;
  storageServiceUrlInput.addEventListener('change', () => {
    applyStorageServiceUrl(storageServiceUrlInput.value.trim());
  });
}

inlineRegistryDataToggle?.addEventListener('change', handleInlineRegistryToggle);
storageFallbackToggle?.addEventListener('change', handleStorageFallbackToggle);

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'peer-chunk-request-dispatch') {
    handlePeerChunkDispatch(message).catch((error) => {
      chrome.runtime.sendMessage({
        type: 'peer-chunk-response',
        requestId: message.requestId,
        status: 'error',
        reason: error.message
      });
    });
  }
});

registryUrlInput.addEventListener('change', () => {
  registryClient.setBaseUrl(registryUrlInput.value.trim());
  appendRegistryLog(`Registry URL set to ${registryUrlInput.value.trim()}`);
  refreshRegisterButtonState();
});

domainInput.addEventListener('input', refreshRegisterButtonState);
ownerInput.addEventListener('input', refreshRegisterButtonState);

autoReplicaToggle?.addEventListener('change', handleAutoReplicaToggle);
replicaTargetCountInput?.addEventListener('change', handleReplicaTargetChange);
clearManualReplicasBtn?.addEventListener('click', clearManualReplicaSelections);
resetReplicationSettingsBtn?.addEventListener('click', resetReplicationSettings);

connectBtn.addEventListener('click', async () => {
  if (connectionManager) {
    appendLog('Already connected.');
    return;
  }

  const url = signalingInput.value.trim();
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    appendLog('Please provide a ws:// or wss:// URL.');
    return;
  }

  signalingAuthToken = signalingAuthTokenInput?.value.trim() ?? signalingAuthToken ?? '';
  if (signalingAuthTokenInput) {
    persistSignalingAuthToken(signalingAuthToken);
  }

  const requestedPeerId = peerIdInput.value.trim() || generatePeerId();
  connectionManager = new WebRTCConnectionManager({
    signalingUrl: url,
    peerId: requestedPeerId,
    authToken: signalingAuthToken || null
  });

  registerManagerEvents(connectionManager);

  connectBtn.disabled = true;
  appendLog(`Connecting to ${url} ...`);
  const attemptStartIso = new Date();
  const attemptStartClock =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    await connectionManager.connect();
    if (connectionManager.updateRelayMode) {
      await connectionManager.updateRelayMode();
    }
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        attemptStartClock
    );
    telemetry.setContext('signalingUrl', url);
    telemetry.emit('connection.attempt', {
      role: 'panel',
      signalingUrl: url,
      iceTransport: connectionManager.getIcePolicy?.() ?? 'all',
      startTime: attemptStartIso.toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      result: 'success',
      relay: connectionManager.getRelayMode?.() === 'relay'
    });
  } catch (error) {
    appendLog(`Failed to connect: ${error.message ?? error}`);
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        attemptStartClock
    );
    telemetry.emit('connection.attempt', {
      role: 'panel',
      signalingUrl: url,
      iceTransport: connectionManager?.getIcePolicy?.() ?? 'all',
      startTime: attemptStartIso.toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      result: 'error',
      relay: false,
      errorCode: error?.code ?? error?.message ?? 'connect-error'
    });
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'connect',
      message: error?.message ?? String(error)
    });
    connectBtn.disabled = false;
    connectionManager = null;
  }
});

openChannelBtn.addEventListener('click', async () => {
  if (!connectionManager) {
    appendLog('Connect to signaling first.');
    return;
  }

  const targetPeerId = peerSelect.value;
  if (!targetPeerId) {
    appendLog('Select a peer to connect.');
    return;
  }

  appendLog(`Opening data channel to ${targetPeerId} ...`);
  try {
    await connectionManager.initiateConnection(targetPeerId);
  } catch (error) {
    appendLog(`Failed to initiate connection: ${error.message ?? error}`);
  }
});

sendMessageBtn.addEventListener('click', () => {
  if (!connectionManager) return;
  const text = messageInput.value.trim();
  if (!text) {
    appendLog('Type a message before sending.');
    return;
  }

  try {
    connectionManager.sendJson({
      type: 'chat',
      text,
      timestamp: Date.now(),
      peerId: localPeerId
    });
    appendChannelLog(`You -> ${text}`);
    messageInput.value = '';
  } catch (error) {
    appendLog(`Failed to send message: ${error.message ?? error}`);
  }
});

sendFileBtn.addEventListener('click', async () => {
  if (!connectionManager) {
    appendLog('Connect first before sending files.');
    return;
  }
  const file = fileInput.files?.[0];
  if (!file) {
    appendLog('Select a file to send.');
    return;
  }

  appendChannelLog(
    `Preparing transfer: ${file.name} (${formatBytes(file.size)})`
  );

  try {
    const { manifest, transfer } = await chunkManager.prepareTransfer(file);
    outgoingTransfer = { manifest, transfer, sentChunks: 0 };

    connectionManager.sendJson(manifest);
    appendChannelLog(
      `Manifest sent (${transfer.totalChunks} chunks, transferId: ${manifest.transferId})`
    );

    for (let i = 0; i < transfer.totalChunks; i += 1) {
      await waitForBufferDrain();
      const chunk = transfer.getChunk(i);
      const header = {
        type: 'chunk',
        transferId: manifest.transferId,
        chunkIndex: i,
        totalChunks: transfer.totalChunks,
        byteLength: chunk.byteLength
      };
      connectionManager.sendJson(header);
      connectionManager.sendBinary(chunk);
      outgoingTransfer.sentChunks = i + 1;
      appendChannelLog(`Sent chunk ${i + 1}/${transfer.totalChunks}`);
    }

    connectionManager.sendJson({
      type: 'transfer-complete',
      transferId: manifest.transferId,
      fileName: manifest.fileName
    });
    appendChannelLog(`Transfer complete: ${manifest.fileName}`);

    await registerManifestWithRegistry(manifest);
  } catch (error) {
    appendLog(`Failed to send file: ${error.message ?? error}`);
  }
});

registerDomainBtn.addEventListener('click', async () => {
  if (!lastManifestRecord) {
    appendRegistryLog('No manifest registered yet.');
    return;
  }
  const domain = domainInput.value.trim();
  const owner = ownerInput.value.trim();
  if (!domain) {
    appendRegistryLog('Domain name is required.');
    return;
  }
  if (!owner) {
    appendRegistryLog('Owner ID is required.');
    return;
  }

  try {
    const payload = {
      domain,
      owner,
      manifestId: lastManifestRecord.manifestId ?? lastManifestRecord.transferId,
      replicas: lastManifestRecord.replicas ?? []
    };
    appendRegistryLog(`Registering domain ${domain} ...`);
    const record = await registryClient.registerDomain(payload);
    appendRegistryLog(`Domain registered: ${record.domain} -> ${record.manifestId}`);
    telemetry.setContext('domain', record.domain);

    const lookup = await registryClient.getDomain(domain);
    if (lookup) {
      appendRegistryLog(`Domain lookup: ${lookup.domain} maps to manifest ${lookup.manifestId}`);
      if (lookup.replicas?.length) {
        appendRegistryLog(`Replicas: ${lookup.replicas.join(', ')}`);
      }
    }
  } catch (error) {
    appendRegistryLog(`Domain registration failed: ${error.message}`);
    console.error('Registry domain error', error);
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'registerDomain',
      message: error?.message ?? String(error)
    });
  }
});

function registerManagerEvents(manager) {
  manager.addEventListener('registered', (event) => {
    const payload = event.detail;
    localPeerId = payload.peerId;
    telemetry.setContext('peerId', localPeerId);
    telemetry.emit('peer.heartbeat', {
      peerId: localPeerId,
      lastSeen: new Date().toISOString(),
      capabilities: payload.capabilities ?? [],
      latencyMs: payload.metadata?.latencyMs ?? null,
      successRate: payload.metadata?.successRate ?? null
    });
    appendLog(`Registered as ${payload.peerId}`);
    updatePeerList(payload.peers ?? []);
    manager.requestPeerList();
  });

  manager.addEventListener('signaling', (event) => {
    const message = event.detail;
    if (message.type === 'peer-list') {
      appendLog(`Discovered ${message.peers.length} peers.`);
      updatePeerList(message.peers);
      return;
    }

    if (message.type === 'peer-joined') {
      appendLog(`Peer joined: ${message.peerId}`);
      upsertPeerEntry({
        peerId: message.peerId,
        capabilities: message.capabilities ?? [],
        metadata: message.metadata ?? {},
        lastSeen: message.lastSeen
      });
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen:
          typeof message.lastSeen === 'number'
            ? new Date(message.lastSeen).toISOString()
            : new Date().toISOString(),
        capabilities: message.capabilities ?? [],
        latencyMs: message.metadata?.latencyMs ?? null,
        successRate: message.metadata?.successRate ?? null
      });
      return;
    }

    if (message.type === 'peer-left') {
      appendLog(`Peer left: ${message.peerId}`);
      removePeer(message.peerId);
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen: new Date().toISOString(),
        capabilities: [],
        latencyMs: null,
        successRate: 0
      });
      return;
    }

    if (message.type === 'peer-metadata') {
      applyPeerMetadataUpdate(
        message.peerId,
        message.metadata ?? {},
        message.lastSeen
      );
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen:
          typeof message.lastSeen === 'number'
            ? new Date(message.lastSeen).toISOString()
            : new Date().toISOString(),
        capabilities: message.capabilities ?? [],
        latencyMs: message.metadata?.latencyMs ?? null,
        successRate: message.metadata?.successRate ?? null
      });
    }
  });

  manager.addEventListener('connectionstatechange', (event) => {
    appendLog(`Connection state: ${event.detail}`);
    channelStatus.textContent = `Connection: ${event.detail}`;
  });

  manager.addEventListener('icegatheringstatechange', (event) => {
    appendLog(`ICE gathering state: ${event.detail}`);
  });

  manager.addEventListener('iceconnectionstatechange', (event) => {
    appendLog(`ICE connection state: ${event.detail}`);
    if (event.detail === 'failed') {
      appendChannelLog('ICE connection reached failed state.');
    }
  });

  manager.addEventListener('icecandidateerror', (event) => {
    appendLog(`ICE candidate error: ${formatIceCandidateError(event.detail)}`);
    appendChannelLog(
      `ICE candidate error encountered: ${formatIceCandidateError(event.detail)}`
    );
  });

  manager.addEventListener('icefailure', () => {
    appendChannelLog('ICE negotiation failed; resetting peer connection.');
    channelStatus.textContent = 'Channel unavailable (ICE failure)';
    replicationManager.handleChannelClosed(connectionManager?.targetPeerId ?? null);
    connectionManager?.resetPeerConnection();
  });

  manager.addEventListener('channel-open', () => {
    channelStatus.textContent = 'Channel open';
    sendMessageBtn.disabled = false;
    messageInput.disabled = false;
    sendFileBtn.disabled = false;
    fileInput.disabled = false;
    messageInput.focus();
    appendChannelLog('Data channel opened.');
    replicationManager.handleChannelOpen();
  });

  manager.addEventListener('channel-close', () => {
    channelStatus.textContent = 'Channel closed';
    sendMessageBtn.disabled = true;
    sendFileBtn.disabled = true;
    fileInput.disabled = true;
    messageInput.disabled = true;
    messageInput.value = '';
    outgoingTransfer = null;
    incomingTransfer = null;
    registerDomainBtn.disabled = true;
    lastManifestRecord = null;
    appendChannelLog('Data channel closed.');
    refreshRegisterButtonState();
    if (connectionManager) {
      replicationManager.handleChannelClosed(connectionManager.targetPeerId ?? null);
    }
  });

  manager.addEventListener('channel-message', (event) => {
    handleChannelMessage(event.detail).catch((error) => {
      appendLog(`Failed to handle message: ${error.message ?? error}`);
    });
  });

  manager.addEventListener('error', (event) => {
    appendLog(`Error: ${event.detail?.message ?? event.detail}`);
  });
}

async function handleChannelMessage(detail) {
  if (detail.kind === 'text') {
    await handleTextMessage(detail.data);
    return;
  }

  if (detail.kind === 'binary') {
    await handleBinaryPayload(detail.data);
    return;
  }

  appendChannelLog('Received unknown data payload.');
}

async function handleTextMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    appendChannelLog(`Peer -> ${raw}`);
    return;
  }

  switch (message.type) {
    case 'chat':
      appendChannelLog(`${message.peerId ?? 'Peer'} -> ${message.text}`);
      break;

    case 'manifest':
      incomingTransfer = {
        manifest: message,
        chunks: new Array(message.chunkCount),
        received: 0,
        pendingChunk: null
      };
      downloadArea.innerHTML = '';
      appendChannelLog(
        `Manifest received: ${message.fileName} (${message.chunkCount} chunks)`
      );
      break;

    case 'chunk':
      if (!incomingTransfer || incomingTransfer.manifest.transferId !== message.transferId) {
        appendChannelLog('Unexpected chunk header received.');
        return;
      }
      incomingTransfer.pendingChunk = message;
      break;

    case 'chunk-response':
      if (message.requestId) {
        chrome.runtime.sendMessage({
          type: 'peer-chunk-response',
          requestId: message.requestId,
          status: 'success',
          data: message.data
        });
        appendChannelLog(`Peer chunk response received for request ${message.requestId}.`);
      }
      break;

    case 'chunk-request':
      respondToChunkRequest(message);
      break;

    case 'chunk-error':
      if (message.requestId) {
        chrome.runtime.sendMessage({
          type: 'peer-chunk-response',
          requestId: message.requestId,
          status: 'error',
          reason: message.reason ?? 'unknown'
        });
        appendChannelLog(`Peer reported error for request ${message.requestId}: ${message.reason ?? 'unknown'}`);
      }
      break;

    case 'chunk-upload-ack': {
      if (typeof message.chunkIndex === 'number') {
        replicationManager.handleAck({
          manifestId:
            message.manifestId ?? message.transferId ?? incomingTransfer?.manifest?.transferId ?? null,
          peerId: message.peerId ?? null,
          chunkIndex: message.chunkIndex
        });
      }
      break;
    }

    case 'chunk-upload-nack': {
      if (typeof message.chunkIndex === 'number') {
        replicationManager.handleNack({
          manifestId:
            message.manifestId ?? message.transferId ?? incomingTransfer?.manifest?.transferId ?? null,
          peerId: message.peerId ?? null,
          chunkIndex: message.chunkIndex,
          reason: message.reason ?? null
        });
      }
      break;
    }

    case 'transfer-complete':
      appendChannelLog(`Transfer complete signal for ${message.fileName ?? message.transferId}`);
      if (
        incomingTransfer &&
        incomingTransfer.manifest.transferId === message.transferId &&
        incomingTransfer.received === incomingTransfer.manifest.chunkCount
      ) {
        finalizeIncomingTransfer();
      }
      break;

    case 'chunk-ack':
      appendChannelLog(
        `Peer acknowledged chunk ${message.chunkIndex + 1} of ${message.transferId}`
      );
      break;

    default:
      appendChannelLog(`Peer -> ${raw}`);
  }
}

async function handleBinaryPayload(buffer) {
  if (!incomingTransfer || !incomingTransfer.pendingChunk) {
    appendChannelLog('Received binary data without pending chunk header.');
    return;
  }

  const chunkInfo = incomingTransfer.pendingChunk;
  incomingTransfer.pendingChunk = null;

  const expectedHash =
    incomingTransfer.manifest.chunkHashes[chunkInfo.chunkIndex];
  const actualHash = await chunkManager.computeHash(buffer);

  if (actualHash !== expectedHash) {
    appendChannelLog(
      `Hash mismatch on chunk ${chunkInfo.chunkIndex + 1}. Transfer aborted.`
    );
    incomingTransfer = null;
    return;
  }

  incomingTransfer.chunks[chunkInfo.chunkIndex] = new Uint8Array(buffer);
  incomingTransfer.received += 1;

  appendChannelLog(
    `Received chunk ${chunkInfo.chunkIndex + 1}/${incomingTransfer.manifest.chunkCount}`
  );

  if (
    incomingTransfer.received === incomingTransfer.manifest.chunkCount
  ) {
    finalizeIncomingTransfer();
  }
}

function handlePeerChunkDispatch({ requestId, manifestId, chunkIndex, replicas }) {
  if (!connectionManager || !connectionManager.isChannelReady()) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'unavailable',
      reason: 'data-channel-closed'
    });
    return;
  }

  try {
    pendingPeerRequests.set(requestId, { manifestId, chunkIndex, replicas });
    connectionManager.requestChunk({
      requestId,
      manifestId,
      chunkIndex
    });
    appendChannelLog(`Forwarded chunk request ${chunkIndex} (${requestId}) to peer.`);
  } catch (error) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'error',
      reason: error.message
    });
  }
}

function finalizeIncomingTransfer() {
  if (!incomingTransfer) return;

  const { manifest, chunks } = incomingTransfer;
  const blob = new Blob(chunks, { type: manifest.mimeType });
  const url = URL.createObjectURL(blob);

  downloadArea.innerHTML = '';
  const link = document.createElement('a');
  link.href = url;
  link.download = manifest.fileName || `download-${manifest.transferId}`;
  link.textContent = `Download ${manifest.fileName} (${formatBytes(manifest.fileSize)})`;
  downloadArea.appendChild(link);

  appendChannelLog(`File ready: ${manifest.fileName}`);
  incomingTransfer = null;
}

function updatePeerList(nextPeers) {
  peers = (nextPeers ?? [])
    .filter((peer) => peer && peer.peerId && peer.peerId !== localPeerId)
    .map((peer) => normalizePeer(peer));
  pruneManualReplicaPrefs();
  renderPeerList();
}

function upsertPeerEntry(peer) {
  if (!peer || !peer.peerId || peer.peerId === localPeerId) {
    return;
  }

  const capabilitiesProvided = Array.isArray(peer.capabilities);
  const lastSeenProvided = typeof peer.lastSeen === 'number';

  const updated = normalizePeer(peer);
  const index = peers.findIndex((existing) => existing.peerId === updated.peerId);
  if (index >= 0) {
    const current = peers[index];
    peers[index] = {
      peerId: current.peerId,
      capabilities: capabilitiesProvided ? updated.capabilities : current.capabilities,
      lastSeen: lastSeenProvided ? updated.lastSeen : current.lastSeen,
      metadata: { ...current.metadata, ...updated.metadata }
    };
  } else {
    peers.push(updated);
  }
  renderPeerList();
}

function applyPeerMetadataUpdate(peerId, metadata, lastSeen) {
  const index = peers.findIndex((peer) => peer.peerId === peerId);
  if (index === -1) return;

  const current = peers[index];
  const mergedMetadata =
    metadata && typeof metadata === 'object'
      ? { ...current.metadata, ...metadata }
      : current.metadata;

  peers[index] = {
    ...current,
    metadata: mergedMetadata,
    lastSeen: typeof lastSeen === 'number' ? lastSeen : current.lastSeen
  };
  renderPeerList();
}

function removePeer(peerId) {
  const nextPeers = peers.filter((peer) => peer.peerId !== peerId);
  if (nextPeers.length === peers.length) return;
  peers = nextPeers;
  renderPeerList();
}

function normalizePeer(peer) {
  const metadata =
    peer && typeof peer.metadata === 'object' && peer.metadata !== null
      ? { ...peer.metadata }
      : {};

  return {
    peerId: peer.peerId,
    capabilities: Array.isArray(peer.capabilities) ? [...peer.capabilities] : [],
    lastSeen: typeof peer.lastSeen === 'number' ? peer.lastSeen : Date.now(),
    metadata
  };
}

function renderPeerList() {
  peerList.innerHTML = '';
  peerSelect.innerHTML = '<option value="">-- choose peer --</option>';

  peers.forEach((peer) => {
    const item = document.createElement('li');
    item.textContent = formatPeerListEntry(peer);
    peerList.appendChild(item);

    const option = document.createElement('option');
    option.value = peer.peerId;
    option.textContent = formatPeerSelectEntry(peer);
    peerSelect.appendChild(option);
  });

  openChannelBtn.disabled = peers.length === 0;
  renderManualReplicaList();
}

function formatPeerListEntry(peer) {
  const metadata = peer.metadata ?? {};
  const details = [];

  if (typeof metadata.latencyMs === 'number') {
    details.push(`${metadata.latencyMs}ms`);
  }

  if (metadata.region && metadata.region !== 'unknown') {
    details.push(metadata.region);
  }

  if (typeof metadata.capacity === 'number' && metadata.capacity > 0) {
    details.push(`${metadata.capacity} cores`);
  }

  if (metadata.version) {
    details.push(`v${metadata.version}`);
  }

  if (metadata.platform) {
    details.push(metadata.platform);
  }

  const descriptor = details.length ? ` (${details.join(' | ')})` : '';
  return `${peer.peerId}${descriptor} - last seen ${timeAgo(peer.lastSeen)}`;
}

function formatPeerSelectEntry(peer) {
  const metadata = peer.metadata ?? {};
  if (typeof metadata.latencyMs === 'number') {
    return `${peer.peerId} (${metadata.latencyMs}ms)`;
  }
  return peer.peerId;
}

function createReplicationManager() {
  const jobs = new Map();
  let processing = false;
  const schedule =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (fn) => Promise.resolve().then(fn);

  function getSnapshot() {
    return Array.from(jobs.values()).map((job) => {
      const total = job.chunks.length;
      let acked = 0;
      let failed = 0;
      let inflight = 0;
      let pending = 0;

      for (const chunk of job.chunks) {
        switch (chunk.status) {
          case "acked":
            acked += 1;
            break;
          case "failed":
            failed += 1;
            break;
          case "in-flight":
            inflight += 1;
            break;
          default:
            pending += 1;
        }
      }

      let state = 'active';
      if (acked === total && total > 0) {
        state = "completed";
      } else if (failed === total && total > 0) {
        state = "failed";
      } else if (failed > 0) {
        state = "degraded";
      }

      return {
        jobId: job.id,
        manifestId: job.manifestId,
        peerId: job.targetPeerId,
        total,
        acked,
        failed,
        inflight,
        pending,
        createdAt: job.createdAt,
        state
      };
    });
  }

  function emit() {
    replicationUpdateHandler(getSnapshot());
  }


  function scheduleReplication(manifest, transfer) {
    if (!manifest || !transfer) {
      appendChannelLog('Replication skipped: manifest or transfer missing.');
      return;
    }

    const transferId = manifest.transferId ?? manifest.manifestId;
    if (!transferId) {
      appendChannelLog('Replication skipped: manifest transferId unavailable.');
      return;
    }

    const limit = getReplicaCandidateLimit();
    if (limit <= 0) {
      if (!autoReplicaSelection) {
        appendChannelLog('Replication skipped: select at least one replica peer in manual mode.');
      } else {
        appendChannelLog('Replication skipped: replica target limit is zero.');
      }
      return;
    }

    const candidates = selectReplicaCandidates(limit);
    if (!candidates.length) {
      appendChannelLog('Replication queue idle: no eligible peers discovered.');
      return;
    }

    let added = false;
    for (const target of candidates) {
      const jobId = `${transferId}:${target.peerId}`;
      if (jobs.has(jobId)) continue;

      const totalChunks = Number(transfer.totalChunks ?? manifest.chunkCount ?? 0);
      if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
        appendChannelLog('Replication skipped: transfer has no chunk metadata.');
        break;
      }

    const job = {
      id: jobId,
      transferId,
      manifest,
      manifestId: manifest.manifestId ?? manifest.transferId ?? transferId,
      transfer,
      targetPeerId: target.peerId,
      createdAt: Date.now(),
      startedAt: null,
      replicaTarget: limit,
      connectionRequested: false,
      chunks: Array.from({ length: totalChunks }, () => ({
        status: 'queued',
        attempts: 0,
        timeoutId: null,
          lastError: null,
          sentAt: null
        })),
        stats: {
          completed: 0,
          failed: 0
        }
      };

      jobs.set(jobId, job);
      added = true;
      telemetry.emit('replication.job', {
        manifestId: job.manifestId,
        targetPeerId: job.targetPeerId,
        state: 'scheduled',
        replicaCount: limit,
        totalChunks,
        ackedChunks: 0,
        retryCount: 0,
        quorumReached: manifestHasReplicationQuorum(job.manifestId)
      });
      appendChannelLog(
        `Replication job queued for ${target.peerId} (score ${target.score.toFixed(1)}).`
      );
    }

    if (added) {
      emit();
    }

    if (!added) {
      appendChannelLog('Replication queue unchanged: all candidate peers already pending.');
      return;
    }

    schedule(processQueue);
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      const iterator = jobs.values();
      const next = iterator.next();
      if (next.done) return;
      await processJob(next.value);
    } finally {
      processing = false;
    }
  }

  async function processJob(job) {
    if (!connectionManager) return;

    if (!job.startedAt) {
      job.startedAt = Date.now();
      telemetry.emit('replication.job', {
        manifestId: job.manifestId,
        targetPeerId: job.targetPeerId,
        state: 'in_progress',
        replicaCount: job.replicaTarget,
        totalChunks: job.chunks.length,
        ackedChunks: job.stats.completed,
        retryCount: job.stats.failed,
        quorumReached: manifestHasReplicationQuorum(job.manifestId)
      });
    }

    if (connectionManager.targetPeerId !== job.targetPeerId) {
      if (!job.connectionRequested) {
        job.connectionRequested = true;
        try {
          await connectionManager.initiateConnection(job.targetPeerId);
        } catch (error) {
          job.connectionRequested = false;
          appendChannelLog(
            `Failed to initiate replication connection to ${job.targetPeerId}: ${error.message ?? error}`
          );
        }
      }
      return;
    }

    if (!connectionManager.isChannelReady()) {
      return;
    }

    job.connectionRequested = false;

    let inflight = countInFlight(job);
    if (inflight >= REPLICATION_MAX_INFLIGHT) return;

    for (let index = 0; index < job.chunks.length; index += 1) {
      if (inflight >= REPLICATION_MAX_INFLIGHT) break;
      const chunkState = job.chunks[index];
      if (chunkState.status === 'queued' || chunkState.status === 'retry') {
        const dispatched = await sendChunk(job, index, chunkState);
        if (dispatched) {
          inflight += 1;
        }
      }
    }
  }

  async function sendChunk(job, chunkIndex, chunkState) {
    const base64Chunk = safeGetChunkBase64(job.transfer, chunkIndex);
    if (!base64Chunk) {
      chunkState.status = 'failed';
      chunkState.lastError = 'chunk-not-found';
      job.stats.failed += 1;
      appendChannelLog(
        `Replication skipped chunk ${chunkIndex + 1}: chunk data unavailable.`
      );
      maybeFinalize(job);
      return false;
    }

    if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
      chunkState.status = 'failed';
      chunkState.lastError = 'max-attempts';
      job.stats.failed += 1;
      appendChannelLog(
        `Replication aborted for chunk ${chunkIndex + 1}: retry budget exhausted.`
      );
      maybeFinalize(job);
      return false;
    }

    try {
      await waitForBufferDrain();
      connectionManager.sendJson({
        type: 'chunk-upload',
        manifestId: job.transferId,
        chunkIndex,
        data: base64Chunk,
        hash: job.transfer.getChunkHash(chunkIndex)
      });
      chunkState.status = 'in-flight';
      chunkState.attempts += 1;
      chunkState.sentAt = Date.now();
      if (chunkState.timeoutId) {
        clearTimeout(chunkState.timeoutId);
      }
      chunkState.timeoutId = setTimeout(
        () => handleTimeout(job.id, chunkIndex),
        REPLICATION_ACK_TIMEOUT
      );
      appendChannelLog(
        `Replication sent chunk ${chunkIndex + 1}/${job.chunks.length} to ${job.targetPeerId} (attempt ${chunkState.attempts}).`
      );
      emit();
      return true;
    } catch (error) {
      chunkState.lastError = error?.message ?? String(error);
      telemetry.emit('error.event', {
        component: 'panel',
        context: 'replication-send-chunk',
        message: chunkState.lastError ?? 'chunk-send-error'
      });
      if (chunkState.timeoutId) {
        clearTimeout(chunkState.timeoutId);
        chunkState.timeoutId = null;
      }
      if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
        chunkState.status = 'failed';
        job.stats.failed += 1;
        appendChannelLog(
          `Replication permanently failed for chunk ${chunkIndex + 1}: ${chunkState.lastError}`
        );
        maybeFinalize(job);
      } else {
        chunkState.status = 'retry';
        appendChannelLog(
          `Replication will retry chunk ${chunkIndex + 1} due to send error: ${chunkState.lastError}`
        );
        schedule(processQueue);
      }
      emit();
      return false;
    }
  }

function handleTimeout(jobId, chunkIndex) {
  const job = jobs.get(jobId);
  if (!job) return;
  const chunkState = job.chunks[chunkIndex];
  if (!chunkState || chunkState.status !== 'in-flight') return;

  chunkState.timeoutId = null;
  chunkState.lastError = 'ack-timeout';

  if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
    chunkState.status = 'failed';
    job.stats.failed += 1;
    appendChannelLog(
      `Replication timed out on chunk ${chunkIndex + 1}; giving up after ${chunkState.attempts} attempts.`
    );
    maybeFinalize(job);
  } else {
    chunkState.status = 'retry';
    appendChannelLog(
      `Replication timed out on chunk ${chunkIndex + 1}; retry scheduled.`
    );
    schedule(processQueue);
  }
  telemetry.emit('replication.chunk', {
    manifestId: job.manifestId,
    targetPeerId: job.targetPeerId,
    chunkIndex,
    status: 'timeout',
    attempt: chunkState.attempts,
    elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null,
    reason: chunkState.lastError
  });
  emit();
}

  function handleAck({ manifestId, peerId, chunkIndex }) {
    const job = findJob(manifestId, peerId);
    if (!job) return;
    const chunkState = job.chunks[chunkIndex];
    if (!chunkState) return;

    if (chunkState.timeoutId) {
      clearTimeout(chunkState.timeoutId);
      chunkState.timeoutId = null;
    }

    chunkState.status = 'acked';
    chunkState.lastError = null;
    if (!job.firstAckAt) {
      job.firstAckAt = Date.now();
      if (job.startedAt) {
        const ttfbMs = job.firstAckAt - job.startedAt;
        telemetry.emit('ttfb.measure', {
          flow: 'publish',
          ttfbMs,
          totalTimeMs: null,
          networkProfile: connectionManager?.getRelayMode?.() === 'relay' ? 'relay' : 'direct'
        });
      }
    }
    job.stats.completed += 1;
    appendChannelLog(
      `Replica ${peerId ?? job.targetPeerId} acknowledged chunk ${chunkIndex + 1}.`
    );
    telemetry.emit('replication.chunk', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      chunkIndex,
      status: 'ack',
      attempt: chunkState.attempts,
      elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null
    });
    emit();
    maybeFinalize(job);
    schedule(processQueue);
  }

  function handleNack({ manifestId, peerId, chunkIndex, reason }) {
    const job = findJob(manifestId, peerId);
    if (!job) return;
    const chunkState = job.chunks[chunkIndex];
    if (!chunkState) return;

    if (chunkState.timeoutId) {
      clearTimeout(chunkState.timeoutId);
      chunkState.timeoutId = null;
    }

    chunkState.lastError = reason ?? 'nack';
    if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
      chunkState.status = 'failed';
      job.stats.failed += 1;
      appendChannelLog(
        `Replica ${peerId ?? job.targetPeerId} rejected chunk ${chunkIndex + 1}; max retries reached.`
      );
      emit();
      maybeFinalize(job);
    } else {
      chunkState.status = 'retry';
      appendChannelLog(
        `Replica ${peerId ?? job.targetPeerId} rejected chunk ${chunkIndex + 1}; retry scheduled.`
      );
      emit();
      schedule(processQueue);
    }
    telemetry.emit('replication.chunk', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      chunkIndex,
      status: 'nack',
      attempt: chunkState.attempts,
      elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null,
      reason: chunkState.lastError
    });
  }

  function handleChannelOpen() {
    schedule(processQueue);
  }

  function handleChannelClosed(peerId) {
    for (const job of jobs.values()) {
      if (peerId && job.targetPeerId !== peerId) continue;
      job.connectionRequested = false;
      job.chunks.forEach((chunk) => {
        if (chunk.timeoutId) {
          clearTimeout(chunk.timeoutId);
          chunk.timeoutId = null;
        }
        if (chunk.status === 'in-flight') {
          chunk.status = 'retry';
          chunk.lastError = 'channel-closed';
        }
      });
    }
    emit();
    schedule(processQueue);
  }

  function syncManualTargets() {
    if (autoReplicaSelection) return;
    let removed = false;
    for (const [jobId, job] of Array.from(jobs.entries())) {
      if (!manualReplicaPrefs.has(job.targetPeerId)) {
        job.chunks.forEach((chunk) => {
          if (chunk.timeoutId) {
            clearTimeout(chunk.timeoutId);
            chunk.timeoutId = null;
          }
        });
        jobs.delete(jobId);
        removed = true;
        appendChannelLog(
          `Manual selection updated: cancelled replication job for ${job.targetPeerId}.`
        );
      }
    }
    if (removed) {
      emit();
      schedule(processQueue);
    }
  }

  function maybeFinalize(job) {
    const allAcknowledged = job.chunks.every((chunk) => chunk.status === 'acked');
    if (allAcknowledged) {
      finalizeJob(job, true);
      return true;
    }

    const anyPending = job.chunks.some((chunk) =>
      chunk.status === 'queued' || chunk.status === 'retry' || chunk.status === 'in-flight'
    );
    if (!anyPending) {
      finalizeJob(job, false);
      return true;
    }

    return false;
  }

  function finalizeJob(job, success) {
    jobs.delete(job.id);
    emit();
    const latencyMs =
      job.startedAt !== null ? Date.now() - job.startedAt : Date.now() - job.createdAt;
    telemetry.emit('replication.job', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      state: success ? 'completed' : 'failed',
      replicaCount: job.replicaTarget,
      totalChunks: job.chunks.length,
      ackedChunks: job.stats.completed,
      retryCount: job.stats.failed,
      quorumReached: manifestHasReplicationQuorum(job.manifestId),
      latencyMs,
      failureReason: success
        ? null
        : job.chunks.find((chunk) => chunk.status === 'failed')?.lastError ?? 'partial-failure'
    });

    if (success) {
      appendChannelLog(
        `Replication to ${job.targetPeerId} completed (${job.stats.completed}/${job.chunks.length} chunks).`
      );
      notifyRegistry(job).catch((error) => {
        appendRegistryLog(
          `Registry update failed for replica ${job.targetPeerId}: ${error.message ?? error}`
        );
      });
    } else {
      appendChannelLog(
        `Replication to ${job.targetPeerId} finished with partial success (${job.stats.completed}/${job.chunks.length}).`
      );
      attemptStorageFallback(job).catch((error) => {
        appendRegistryLog(
          `Storage fallback error for manifest ${job.manifestId}: ${error.message ?? error}`
        );
      });
    }

    schedule(processQueue);
  }

  async function notifyRegistry(job) {
    const manifestId = job.manifestId;
    if (!manifestId) return;
    const ackedIndexes = job.chunks
      .map((chunk, index) => (chunk.status === 'acked' ? index : null))
      .filter((index) => index !== null);
    if (!ackedIndexes.length) return;
    await registryClient.updateChunkReplica(manifestId, {
      peerId: job.targetPeerId,
      replicatedAt: Date.now(),
      chunkIndexes: ackedIndexes,
      status: 'available'
    });
    appendRegistryLog(
      `Registry updated: ${job.targetPeerId} now serves manifest ${manifestId}.`
    );
    markManifestReplica(manifestId, job.targetPeerId);
  }

  async function attemptStorageFallback(job) {
    if (!shouldUploadChunksToStorage()) {
      appendChannelLog('Storage fallback disabled; skipping pointer upload.');
      return;
    }

    const manifestId = job.manifestId;
    const transferId = job.transferId ?? manifestId;
    if (!manifestId || !transferId) {
      appendChannelLog('Storage fallback skipped: manifest identifiers unavailable.');
      return;
    }

    const degradedIndexes = job.chunks
      .map((chunk, index) => (chunk.status === 'acked' ? null : index))
      .filter((index) => index !== null);

    if (!degradedIndexes.length) {
      return;
    }

    appendChannelLog(
      `Attempting storage fallback for ${degradedIndexes.length} chunk${degradedIndexes.length === 1 ? '' : 's'} of manifest ${manifestId}.`
    );

    for (const index of degradedIndexes) {
      try {
        const existingPointer = getManifestPointer(manifestId, index);
        if (existingPointer) {
          appendChannelLog(
            `Storage fallback skipped for chunk ${index + 1}: pointer already exists.`
          );
          continue;
        }

        const base64Chunk = await getChunkBase64(transferId, index);
        if (!base64Chunk) {
          appendChannelLog(
            `Storage fallback failed for chunk ${index + 1}: chunk data unavailable.`
          );
          continue;
        }

        await uploadChunkToStorage(transferId, index, base64Chunk);
        const pointer = `${storageServiceUrl}/chunks/${transferId}/${index}`;
        updateManifestPointerCache(manifestId, index, pointer);
        if (manifestId !== transferId) {
          updateManifestPointerCache(transferId, index, pointer);
        }

        await registryClient.updateChunkPointer(manifestId, index, {
          pointer,
          removeData: !shouldStoreChunkDataInRegistry(),
          expiresAt: null
        });
        appendRegistryLog(
          `Storage fallback pointer registered for chunk ${index + 1} (manifest ${manifestId}).`
        );
      } catch (error) {
        appendRegistryLog(
          `Storage fallback failed for chunk ${index + 1} (manifest ${manifestId}): ${error.message ?? error}`
        );
      }
    }
  }

  function countInFlight(job) {
    return job.chunks.reduce(
      (count, chunk) => (chunk.status === 'in-flight' ? count + 1 : count),
      0
    );
  }

  function safeGetChunkBase64(transfer, index) {
    try {
      return transfer.getChunkBase64(index);
    } catch (error) {
      console.warn('Failed to retrieve chunk base64', error);
      return null;
    }
  }

  function findJob(manifestId, peerId) {
    if (!manifestId) return null;
    if (peerId) {
      const job = jobs.get(`${manifestId}:${peerId}`);
      if (job) return job;
    }
    for (const job of jobs.values()) {
      if (job.manifestId === manifestId) {
        return job;
      }
    }
    return null;
  }

  return {
    scheduleReplication,
    handleAck,
    handleNack,
    handleChannelOpen,
    handleChannelClosed,
    getSnapshot,
    syncManualTargets
  };
}

function selectReplicaCandidates(limit) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const now = Date.now();

  if (!autoReplicaSelection) {
    pruneManualReplicaPrefs();
    const manualPeers = peers
      .filter((peer) => manualReplicaPrefs.has(peer.peerId))
      .map((peer) => ({
        ...peer,
        score: manualReplicaPrefs.get(peer.peerId) ?? 0
      }))
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

    return manualPeers.slice(0, limit);
  }

  return peers
    .filter((peer) => isPeerEligibleForReplication(peer, now))
    .map((peer) => ({
      ...peer,
      score: scorePeerForReplication(peer, now)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

function handleInlineRegistryToggle(event) {
  const enabled = Boolean(event?.target?.checked);
  persistenceSettings.storeChunkData = enabled;
  persistPersistenceSettings();
  appendRegistryLog(
    enabled
      ? 'Registry inline chunk copies enabled for new uploads.'
      : 'Registry inline chunk copies disabled; relying on peer replicas.'
  );
}

function handleStorageFallbackToggle(event) {
  const enabled = Boolean(event?.target?.checked);
  persistenceSettings.uploadChunksToStorage = enabled;
  persistPersistenceSettings();
  appendChannelLog(
    enabled
      ? 'Storage fallback enabled for degraded replicas.'
      : 'Storage fallback disabled; degraded replicas will not upload to storage.'
  );
}

function handleAutoReplicaToggle() {
  autoReplicaSelection = Boolean(autoReplicaToggle?.checked);
  updateManualReplicaUI();
  replicationManager.syncManualTargets();
  persistReplicationSettings();
  updateManifestQuorumTargets();
  appendLog(
    `Replication mode set to ${autoReplicaSelection ? 'auto-select' : 'manual selection'}.`
  );
  if (!autoReplicaSelection && manualReplicaPrefs.size === 0) {
    appendLog('Manual replication enabled. Select peers below to replicate content.');
  }
  queueMicrotask(() => replicationManager.handleChannelOpen());
  renderReplicationStatus();
}

function handleReplicaTargetChange() {
  if (!replicaTargetCountInput) return;
  const clamped = clampReplicaTarget(replicaTargetCountInput.value);
  maxReplicaTargets = clamped;
  replicaTargetCountInput.value = String(clamped);
  appendLog(`Replication target limit set to ${clamped} peer${clamped === 1 ? '' : 's'}.`);
  persistReplicationSettings();
  updateManifestQuorumTargets();
  queueMicrotask(() => replicationManager.handleChannelOpen());
  renderReplicationStatus();
}

function updateManualActionButtons() {
  if (clearManualReplicasBtn) {
    clearManualReplicasBtn.disabled = autoReplicaSelection || manualReplicaPrefs.size === 0;
  }
  if (resetReplicationSettingsBtn) {
    resetReplicationSettingsBtn.disabled = false;
  }
}

function updateManualReplicaUI() {
  if (manualReplicaContainer) {
    manualReplicaContainer.classList.toggle('disabled', autoReplicaSelection);
  }
  updateManualActionButtons();
  renderManualReplicaList();
  renderReplicationStatus();
}

function renderManualReplicaList() {
  if (!manualReplicaList) return;
  manualReplicaList.innerHTML = '';

  const peerMap = new Map(peers.map((peer) => [peer.peerId, peer]));

  if (peers.length === 0 && manualReplicaPrefs.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No peers available.';
    manualReplicaList.appendChild(empty);
    return;
  }

  const sortedPeers = [...peers].sort((a, b) => {
    const aSelected = manualReplicaPrefs.has(a.peerId);
    const bSelected = manualReplicaPrefs.has(b.peerId);
    if (aSelected && bSelected) {
      return (manualReplicaPrefs.get(a.peerId) ?? 0) - (manualReplicaPrefs.get(b.peerId) ?? 0);
    }
    if (aSelected) return -1;
    if (bSelected) return 1;
    return a.peerId.localeCompare(b.peerId);
  });

  sortedPeers.forEach((peer) => {
    const option = document.createElement('label');
    option.className = 'manual-replica-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = peer.peerId;
    checkbox.checked = manualReplicaPrefs.has(peer.peerId);
    checkbox.disabled = autoReplicaSelection;
    checkbox.addEventListener('change', (event) => {
      setManualReplicaSelection(peer.peerId, event.target.checked);
    });

    const span = document.createElement('span');
    span.textContent = formatManualPeerDescriptor(peer);

    option.appendChild(checkbox);
    option.appendChild(span);
    manualReplicaList.appendChild(option);
  });

  const offlineSelections = getManualReplicaEntries().filter(({ peerId }) => !peerMap.has(peerId));
  offlineSelections.forEach(({ peerId }) => {
    const option = document.createElement('label');
    option.className = 'manual-replica-option offline';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = peerId;
    checkbox.checked = true;
    checkbox.disabled = autoReplicaSelection;
    checkbox.addEventListener('change', (event) => {
      setManualReplicaSelection(peerId, event.target.checked);
    });

    const span = document.createElement('span');
    span.textContent = `${peerId} (offline)`;

    option.appendChild(checkbox);
    option.appendChild(span);
    manualReplicaList.appendChild(option);
  });

  if (!autoReplicaSelection && manualReplicaPrefs.size === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Select peers above to enable manual replication.';
    manualReplicaList.appendChild(hint);
  }

  updateManualActionButtons();
}

function setManualReplicaSelection(peerId, selected) {
  if (!peerId) return;
  if (selected) {
    manualReplicaPrefs.set(peerId, Date.now());
  } else {
    manualReplicaPrefs.delete(peerId);
  }

  persistReplicationSettings();
  renderManualReplicaList();
  updateManifestQuorumTargets();

  if (!autoReplicaSelection) {
    if (manualReplicaPrefs.size === 0) {
      appendLog('Manual replication: no peers selected.');
    } else {
      appendLog(
        `Manual replication peers: ${Array.from(manualReplicaPrefs.keys()).join(', ')}.`
      );
    }
  }
  replicationManager.syncManualTargets();
  renderReplicationStatus();
}

function clearManualReplicaSelections() {
  if (manualReplicaPrefs.size === 0) return;
  manualReplicaPrefs.clear();
  persistReplicationSettings();
  updateManualReplicaUI();
  updateManifestQuorumTargets();
  if (!autoReplicaSelection) {
    replicationManager.syncManualTargets();
  }
  queueMicrotask(() => replicationManager.handleChannelOpen());
  appendLog('Manual replica selections cleared.');
}

function resetReplicationSettings() {
  manualReplicaPrefs.clear();
  maxReplicaTargets = DEFAULT_MAX_REPLICA_TARGETS;
  if (replicaTargetCountInput) {
    replicaTargetCountInput.value = String(maxReplicaTargets);
  }
  autoReplicaSelection = true;
  if (autoReplicaToggle) {
    autoReplicaToggle.checked = true;
  }
  persistReplicationSettings();
  updateManualReplicaUI();
  updateManifestQuorumTargets();
  replicationManager.syncManualTargets();
  queueMicrotask(() => replicationManager.handleChannelOpen());
  appendLog('Replication settings reset to defaults.');
}


function pruneManualReplicaPrefs() {
  let changed = false;
  for (const peerId of Array.from(manualReplicaPrefs.keys())) {
    if (!peerId || peerId === localPeerId) {
      manualReplicaPrefs.delete(peerId);
      changed = true;
    }
  }
  if (changed) {
    persistReplicationSettings();
    renderManualReplicaList();
    renderReplicationStatus();
    updateManifestQuorumTargets();
    if (!autoReplicaSelection) {
      replicationManager.syncManualTargets();
    }
  }
  return changed;
}

function getReplicaCandidateLimit() {
  if (autoReplicaSelection) {
    return maxReplicaTargets;
  }
  pruneManualReplicaPrefs();
  if (manualReplicaPrefs.size === 0) {
    return 0;
  }
  return Math.min(maxReplicaTargets, manualReplicaPrefs.size);
}

function clampReplicaTarget(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_REPLICA_TARGETS;
  return Math.min(MANUAL_REPLICA_LIMIT, Math.max(1, parsed));
}

function formatManualPeerDescriptor(peer) {
  const details = [];
  const metadata = peer.metadata ?? {};
  if (typeof metadata.latencyMs === 'number') {
    details.push(`${metadata.latencyMs}ms`);
  }
  if (metadata.region && metadata.region !== 'unknown') {
    details.push(metadata.region);
  }
  if (typeof metadata.capacity === 'number' && metadata.capacity > 0) {
    details.push(`${metadata.capacity} cores`);
  }
  return details.length ? `${peer.peerId} (${details.join(' | ')})` : peer.peerId;
}

function renderReplicationStatus(snapshot = (replicationManager?.getSnapshot?.() ?? [])) {
  if (!replicationStatusContainer) return;
  const list = Array.isArray(snapshot) ? [...snapshot] : [];
  replicationStatusContainer.innerHTML = '';

  const manifestId = resolveManifestId(lastManifestRecord);
  if (manifestId) {
    const summary = getManifestReplicationSummary(manifestId);
    const summaryItem = document.createElement('div');
    summaryItem.className = 'status-summary';
    const headline = document.createElement('div');
    headline.className = 'summary-heading';
    headline.textContent = `Remote replicas ${summary.remoteAckCount}/${summary.required}`;
    summaryItem.appendChild(headline);
    if (summary.peers.length) {
      const peerLine = document.createElement('div');
      peerLine.className = 'summary-detail';
      peerLine.textContent = `Peers: ${summary.peers.join(', ')}`;
      summaryItem.appendChild(peerLine);
    } else {
      const pendingLine = document.createElement('div');
      pendingLine.className = 'summary-detail';
      pendingLine.textContent = 'Waiting for remote replicas...';
      summaryItem.appendChild(pendingLine);
    }
    if (summary.updatedAt) {
      const updatedLine = document.createElement('div');
      updatedLine.className = 'summary-detail';
      updatedLine.textContent = `Updated ${timeAgo(summary.updatedAt)}.`;
      summaryItem.appendChild(updatedLine);
    }
    replicationStatusContainer.appendChild(summaryItem);
  }

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'status-empty';
    empty.textContent = 'No replication jobs pending.';
    replicationStatusContainer.appendChild(empty);
    return;
  }

  list
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .forEach((job) => {
      const item = document.createElement('div');
      item.className = 'status-item';

      const heading = document.createElement('div');
      heading.className = 'heading';
      const peerSpan = document.createElement('span');
      peerSpan.textContent = job.peerId ?? 'unknown-peer';
      const stateSpan = document.createElement('span');
      stateSpan.textContent = formatReplicationState(job.state);
      heading.append(peerSpan, stateSpan);

      const progress = document.createElement('div');
      progress.className = 'progress';
      progress.textContent = `Chunks ${job.acked}/${job.total} acked | ${job.inflight} in-flight | ${job.pending} pending | ${job.failed} failed`;

      item.append(heading, progress);
      if (job.manifestId) {
        const manifestLine = document.createElement('div');
        manifestLine.className = 'progress';
        manifestLine.textContent = `Manifest ${job.manifestId}`;
        item.appendChild(manifestLine);
      }

      replicationStatusContainer.appendChild(item);
    });
}

function formatReplicationState(state) {
  switch (state) {
    case "completed":
      return 'Completed';
    case "failed":
      return 'Failed';
    case "degraded":
      return 'Degraded';
    case "active":
    default:
      return 'Active';
  }
}

function initializeReplicationControls() {
  const stored = loadReplicationSettings();

  if (replicaTargetCountInput) {
    const limit = stored.limit;
    if (Number.isFinite(limit)) {
      maxReplicaTargets = clampReplicaTarget(limit);
      replicaTargetCountInput.value = String(maxReplicaTargets);
    } else {
      maxReplicaTargets = clampReplicaTarget(replicaTargetCountInput.value);
      replicaTargetCountInput.value = String(maxReplicaTargets);
    }
  } else {
    maxReplicaTargets = clampReplicaTarget(maxReplicaTargets);
  }

  if (autoReplicaToggle) {
    if (typeof stored.autoSelect === 'boolean') {
      autoReplicaToggle.checked = stored.autoSelect;
      autoReplicaSelection = stored.autoSelect;
    } else {
      autoReplicaSelection = Boolean(autoReplicaToggle.checked);
    }
  } else if (typeof stored.autoSelect === 'boolean') {
    autoReplicaSelection = stored.autoSelect;
  }

  manualReplicaPrefs.clear();
  if (Array.isArray(stored.manualPeers)) {
    stored.manualPeers.forEach(({ peerId, ts }, index) => {
      if (typeof peerId === 'string' && peerId) {
        manualReplicaPrefs.set(peerId, Number(ts) || Date.now() + index);
      }
    });
  }

  updateManifestQuorumTargets();
  updateManualReplicaUI();
  renderReplicationStatus();
  queueMicrotask(() => replicationManager.syncManualTargets());
  queueMicrotask(() => replicationManager.handleChannelOpen());
}

function isPeerEligibleForReplication(peer, now = Date.now()) {
  if (!peer || peer.peerId === localPeerId) {
    return false;
  }

  const lastSeen = typeof peer.lastSeen === 'number' ? peer.lastSeen : null;
  if (lastSeen && now - lastSeen > 60_000) {
    return false;
  }

  if (Array.isArray(peer.capabilities) && peer.capabilities.length > 0) {
    return peer.capabilities.includes('store');
  }
  return true;
}

function scorePeerForReplication(peer, now = Date.now()) {
  const metadata = peer.metadata ?? {};
  let score = 0;

  if (Array.isArray(peer.capabilities) && peer.capabilities.includes('store')) {
    score += 40;
  } else {
    score += 10;
  }

  if (typeof metadata.latencyMs === 'number') {
    const latencyScore = Math.max(0, 200 - metadata.latencyMs);
    score += latencyScore / 5;
  }

  if (typeof metadata.capacity === 'number') {
    score += Math.min(metadata.capacity, 16) * 2;
  }

  if (typeof metadata.deviceMemoryGb === 'number') {
    score += Math.min(metadata.deviceMemoryGb, 16);
  }

  if (metadata.region && metadata.region !== 'unknown') {
    score += 5;
  }

  if (typeof metadata.uptimeMs === 'number') {
    score += Math.min(metadata.uptimeMs / 60_000, 10);
  }

  if (typeof peer.lastSeen === 'number') {
    const stalenessMs = now - peer.lastSeen;
    score -= Math.min(stalenessMs / 1_000, 120) / 2;
  }

  return score;
}

function formatIceCandidateError(detail) {
  if (!detail) {
    return 'unknown';
  }
  const parts = [];
  if (detail.errorCode !== null && detail.errorCode !== undefined) {
    parts.push(`code ${detail.errorCode}`);
  }
  if (detail.errorDetail) {
    parts.push(detail.errorDetail);
  } else if (detail.errorText) {
    parts.push(detail.errorText);
  }
  if (detail.url) {
    parts.push(`url=${detail.url}`);
  }
  if (detail.address) {
    parts.push(
      `address=${detail.address}${detail.port ? `:${detail.port}` : ''}`
    );
  } else if (detail.port) {
    parts.push(`port=${detail.port}`);
  }
  if (detail.protocol) {
    parts.push(`protocol=${detail.protocol}`);
  }
  if (detail.relatedAddress) {
    parts.push(
      `related=${detail.relatedAddress}${
        detail.relatedPort ? `:${detail.relatedPort}` : ''
      }`
    );
  }

  return parts.length ? parts.join(' | ') : 'unknown';
}

function appendLog(text) {
  const time = new Date().toLocaleTimeString();
  statusLog.textContent += `[${time}] ${text}\n`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

function appendChannelLog(text) {
  const time = new Date().toLocaleTimeString();
  channelLog.textContent += `[${time}] ${text}\n`;
  channelLog.scrollTop = channelLog.scrollHeight;
}

function appendRegistryLog(text) {
  const time = new Date().toLocaleTimeString();
  registryLog.textContent += `[${time}] ${text}\n`;
  registryLog.scrollTop = registryLog.scrollHeight;
}

async function respondToChunkRequest(message) {
  const { requestId, manifestId, chunkIndex } = message;
  const base64Chunk = await getChunkBase64(manifestId, chunkIndex);

  if (!connectionManager || !connectionManager.isChannelReady()) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'unavailable',
      reason: 'data-channel-closed'
    });
    return;
  }

  if (!base64Chunk) {
    connectionManager.sendJson({
      type: 'chunk-error',
      requestId,
      manifestId,
      chunkIndex,
      reason: 'chunk-not-found'
    });
    appendChannelLog(`Chunk ${chunkIndex} not found for manifest ${manifestId}.`);
    return;
  }

  connectionManager.sendJson({
    type: 'chunk-response',
    requestId,
    manifestId,
    chunkIndex,
    data: base64Chunk
  });
  appendChannelLog(`Served chunk ${chunkIndex} for request ${requestId}.`);
}

async function handleChunkUpload(message) {
  const { manifestId, chunkIndex, data, hash } = message;
  if (typeof manifestId !== 'string' || typeof chunkIndex !== 'number' || !data) {
    throw new Error('invalid chunk-upload payload');
  }

  const chunkBytes = base64ToUint8Array(data);
  if (!chunkBytes) {
    throw new Error('invalid chunk data');
  }

  if (hash) {
    const computed = await chunkManager.computeHash(chunkBytes.buffer);
    if (computed !== hash) {
      connectionManager?.sendJson({
        type: 'chunk-upload-nack',
        manifestId,
        chunkIndex,
        peerId: localPeerId,
        reason: 'hash-mismatch'
      });
      throw new Error('hash mismatch');
    }
  }

  cacheChunk(manifestId, chunkIndex, data);
  appendChannelLog(`Stored replicated chunk ${chunkIndex} for manifest ${manifestId}.`);

  connectionManager?.sendJson({
    type: 'chunk-upload-ack',
    manifestId,
    chunkIndex,
    peerId: localPeerId,
    status: 'ok'
  });
}

function cacheChunk(manifestId, chunkIndex, base64Data) {
  if (!manifestId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return;
  }
  if (!chunkCache.has(manifestId)) {
    chunkCache.set(manifestId, []);
  }
  const arr = chunkCache.get(manifestId);
  arr[chunkIndex] = base64Data;
}

function getCachedChunk(manifestId, chunkIndex) {
  const arr = chunkCache.get(manifestId);
  if (!arr) return null;
  return arr[chunkIndex] ?? null;
}

function recordMatchesManifest(manifestId) {
  if (!lastManifestRecord) return false;
  const ids = [
    lastManifestRecord.manifestId,
    lastManifestRecord.transferId
  ].filter(Boolean);
  return ids.includes(manifestId);
}

function getManifestPointer(manifestId, chunkIndex) {
  if (
    !recordMatchesManifest(manifestId) ||
    !Array.isArray(lastManifestRecord.chunkPointers)
  ) {
    return null;
  }
  return lastManifestRecord.chunkPointers[chunkIndex] ?? null;
}

function updateManifestPointerCache(manifestId, chunkIndex, pointer) {
  if (!recordMatchesManifest(manifestId)) {
    return;
  }
  if (!Array.isArray(lastManifestRecord.chunkPointers)) {
    lastManifestRecord.chunkPointers = [];
  }
  lastManifestRecord.chunkPointers[chunkIndex] = pointer;
  if (Array.isArray(lastManifestRecord.chunkData)) {
    lastManifestRecord.chunkData[chunkIndex] = null;
  }
}

async function getChunkBase64(manifestId, chunkIndex) {
  const cached = getCachedChunk(manifestId, chunkIndex);
  if (cached) {
    return cached;
  }

  const transfer = chunkManager.getTransfer(manifestId);
  if (transfer) {
    if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
      return null;
    }
    const chunk = transfer.getChunkBase64(chunkIndex);
    cacheChunk(manifestId, chunkIndex, chunk);
    return chunk;
  }

  if (lastManifestRecord && lastManifestRecord.manifestId === manifestId) {
    const manifestChunk = lastManifestRecord.chunkData?.[chunkIndex] ?? null;
    if (manifestChunk) {
      cacheChunk(manifestId, chunkIndex, manifestChunk);
      return manifestChunk;
    }

    const pointer = lastManifestRecord.chunkPointers?.[chunkIndex];
    if (pointer) {
      try {
        const headers = shouldAttachStorageHeaders(pointer)
          ? buildStorageHeaders({ Accept: 'application/json' })
          : { Accept: 'application/json' };
        const response = await fetch(pointer, { headers });
        if (response.ok) {
          const payload = await response.json();
          if (payload?.data) {
            cacheChunk(manifestId, chunkIndex, payload.data);
            return payload.data;
          }
        }
      } catch (error) {
        appendChannelLog(`Storage fetch failed for chunk ${chunkIndex}: ${error.message}`);
      }
    }
  }

  return null;
}

async function uploadChunkToStorage(manifestId, chunkIndex, base64Data) {
  const response = await fetch(`${storageServiceUrl}/chunks`, {
    method: 'POST',
    headers: buildStorageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ manifestId, chunkIndex, data: base64Data })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? `storage returned ${response.status}`);
  }
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

function uint8ToBase64(uint8Array) {
  if (!uint8Array) return null;
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i += 1) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}
async function registerManifestWithRegistry(manifest) {
  try {
    const transfer = chunkManager.getTransfer(manifest.transferId);
    const chunkData = [];
    const chunkReplicas = [];
    const chunkPointers = [];
    const storeInline = shouldStoreChunkDataInRegistry();
    const uploadToStorage = shouldUploadChunksToStorage();
    if (transfer) {
      for (let i = 0; i < transfer.totalChunks; i += 1) {
        const base64Chunk = transfer.getChunkBase64(i);

        if (storeInline && base64Chunk) {
          chunkData.push(base64Chunk);
        } else {
          chunkData.push(null);
        }

        if (uploadToStorage && base64Chunk) {
          try {
            await uploadChunkToStorage(manifest.transferId, i, base64Chunk);
            chunkPointers.push(`${storageServiceUrl}/chunks/${manifest.transferId}/${i}`);
          } catch (error) {
            appendRegistryLog(`Storage upload failed for chunk ${i}: ${error.message}`);
            chunkPointers.push(null);
          }
        } else {
          chunkPointers.push(null);
        }

        cacheChunk(manifest.transferId, i, base64Chunk);
        chunkReplicas.push([localPeerId]);
      }
    }

    const record = await registryClient.registerManifest({
      ...manifest,
      chunkData,
      chunkReplicas,
      chunkPointers,
      replicas: [localPeerId, ...(incomingTransfer?.manifest?.replicas ?? [])]
    });
    lastManifestRecord = record;
    telemetry.setContext(
      'manifestId',
      record.manifestId ?? record.transferId ?? manifest.transferId
    );
    resetManifestReplicationState(record);
    const quorum = getEffectiveAckQuorum();
    appendRegistryLog(
      `Awaiting remote replicas: need ${quorum} confirmation${quorum === 1 ? '' : 's'} before binding domain.`
    );
    appendRegistryLog(`Manifest registered: ${record.manifestId ?? record.transferId}`);
    replicationManager.scheduleReplication(record, transfer);
    refreshRegisterButtonState();
  } catch (error) {
    appendRegistryLog(`Manifest registration failed: ${error.message}`);
    console.error('Registry manifest error', error);
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'registerManifestWithRegistry',
      message: error?.message ?? String(error)
    });
    telemetry.setContext('manifestId', null);
    clearManifestReplicationState(resolveManifestId(manifest));
    lastManifestRecord = null;
    refreshRegisterButtonState();
  }
}

function generatePeerId() {
  const randomSegment = () => Math.random().toString(36).slice(2, 6);
  return `peer-${randomSegment()}${randomSegment()}`;
}

function timeAgo(timestamp) {
  const delta = Date.now() - Number(timestamp ?? 0);
  if (Number.isNaN(delta) || delta < 0) return 'just now';
  if (delta < 5_000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1_000)}s ago`;
  const minutes = Math.round(delta / 60_000);
  return `${minutes}m ago`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function waitForBufferDrain() {
  while (connectionManager && connectionManager.getBufferedAmount() > 512_000) {
    await delay(25);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refreshRegisterButtonState() {
  const manifestId = resolveManifestId(lastManifestRecord);
  const hasManifest = Boolean(manifestId);
  const hasDomain = Boolean(domainInput.value.trim());
  const hasOwner = Boolean(ownerInput.value.trim());
  const hasQuorum = manifestId ? manifestHasReplicationQuorum(manifestId) : false;
  const enabled = hasManifest && hasDomain && hasOwner && hasQuorum;
  registerDomainBtn.disabled = !enabled;
  if (!enabled && hasManifest && hasDomain && hasOwner && manifestId) {
    const summary = getManifestReplicationSummary(manifestId);
    const remaining = Math.max(0, summary.required - summary.remoteAckCount);
    registerDomainBtn.title =
      remaining > 0
        ? `Waiting for ${remaining} more remote replica${remaining === 1 ? '' : 's'} before binding domain.`
        : '';
  } else {
    registerDomainBtn.title = '';
  }
}
















