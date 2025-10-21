import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { emitTelemetry } from '../../common/telemetry.js';

const PORT = Number(process.env.SIGNALING_PORT ?? 8787);
const HEARTBEAT_INTERVAL = 30_000;
const PEER_TIMEOUT = 90_000;
const SHARED_SECRET = process.env.SIGNALING_SHARED_SECRET ?? null;
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
  // TURN sunuculari SIGNALING_ICE_SERVERS degiskeniyle tanimlanir
];
const ICE_SERVERS = parseIceServers(process.env.SIGNALING_ICE_SERVERS);

/**
 * In-memory peer registry. For production we will move this into Redis or a
 * dedicated state store, but for the MVP we keep connections in memory.
 */
const peers = new Map();
const COMPONENT_NAME = 'signaling';

const DEFAULT_METADATA = {
  region: 'unknown',
  capacity: 0,
  latencyMs: null,
  version: null,
  platform: null,
  userAgent: null,
  language: null,
  lastHeartbeat: null,
  uptimeMs: null,
  deviceMemoryGb: null,
  successRate: null
};

function emitPeerHeartbeatEvent(peerId, overrides = {}) {
  const entry = peers.get(peerId);
  if (!entry) return;
  const payload = {
    peerId,
    lastSeen: new Date(entry.lastSeen ?? Date.now()).toISOString(),
    capabilities: Array.isArray(entry.capabilities) ? entry.capabilities : [],
    latencyMs: entry.metadata?.latencyMs ?? null,
    uptimeMs: entry.metadata?.uptimeMs ?? null,
    successRate: entry.metadata?.successRate ?? null
  };
  if (overrides && typeof overrides === 'object') {
    Object.assign(payload, overrides);
    payload.peerId = peerId;
  }
  emitTelemetry(COMPONENT_NAME, 'peer.heartbeat', payload);
}


const server = new WebSocketServer({ port: PORT });

server.on('connection', (socket) => {
  let peerId = null;

  socket.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      sendError(socket, 'invalid_json', 'Messages must be JSON objects', {
        context: 'parse_message'
      });
      return;
    }

    const validationError = validateMessage(message);
    if (validationError) {
      sendError(socket, 'invalid_message', validationError, {
        peerId,
        context: `validate:${message?.type ?? 'unknown'}`
      });
      return;
    }

    const { type } = message;
    switch (type) {
      case 'register': {
        if (!authorize(message.authToken)) {
          sendError(socket, 'unauthorized', 'Missing or invalid auth token', {
            peerId: message.peerId ?? null,
            context: 'register'
          });
          return;
        }
        peerId = registerPeer(socket, message);
        break;
      }
      case 'discover': {
        if (!peerId) return;
        sendPeerList(socket);
        break;
      }
      case 'signal': {
        if (!peerId) return;
        forwardSignal(peerId, message);
        break;
      }
      case 'heartbeat': {
        if (!peerId) return;
        refreshPeer(peerId, message);
        break;
      }
      default: {
        console.warn(`⚠️  Unknown message type: ${type}`);
      }
    }
  });

  socket.on('close', () => {
    if (peerId) {
      emitPeerHeartbeatEvent(peerId, { lastSeen: new Date().toISOString() });
      emitTelemetry(COMPONENT_NAME, 'error.event', {
        message: `Peer ${peerId} disconnected`,
        code: 'peer_disconnect',
        peerId,
        context: 'socket-close'
      });
      peers.delete(peerId);
      broadcastPeerUpdate({ type: 'peer-left', peerId });
      console.log(`?? Peer disconnected: ${peerId}`);
    }
  });
server.on('listening', () => {
  console.log(`🚀 Signaling service listening on ws://localhost:${PORT}`);
});

/**
 * Registers a peer connection and broadcasts presence to others.
 */
function registerPeer(socket, message) {
  const peerId = message.peerId ?? nanoid(10);

  const sanitizedMetadata = sanitizePeerMetadata(message.metadata);

  peers.set(peerId, {
    socket,
    capabilities: message.capabilities ?? [],
    lastSeen: Date.now(),
    metadata: sanitizedMetadata
  });

  console.log(`✅ Peer registered: ${peerId}`);

  socket.send(
    JSON.stringify({
      type: 'registered',
      peerId,
      peers: getPeerSnapshot(peerId),
      iceServers: ICE_SERVERS
    })
  );

  broadcastPeerUpdate({
    type: 'peer-joined',
    peerId,
    capabilities: message.capabilities ?? [],
    lastSeen: peers.get(peerId).lastSeen,
    metadata: { ...sanitizedMetadata }
  }, peerId);

  broadcastPeerUpdate({
    type: 'peer-metadata',
    peerId,
    metadata: peers.get(peerId).metadata,
    lastSeen: peers.get(peerId).lastSeen
  }, peerId);

  emitPeerHeartbeatEvent(peerId);

  return peerId;
}

/**
 * Sends a snapshot of currently connected peers (excluding requester).
 */
function sendPeerList(socket) {
  socket.send(
    JSON.stringify({
      type: 'peer-list',
      peers: getPeerSnapshot(),
      iceServers: ICE_SERVERS
    })
  );
}

/**
 * Forwards signaling payloads (offer/answer/ICE) to the intended target.
 */
function forwardSignal(fromPeerId, message) {
  const targetPeerId = message.targetPeerId;
  if (!targetPeerId || !peers.has(targetPeerId)) {
    const origin = peers.get(fromPeerId);
    if (origin) {
      sendError(origin.socket, 'unknown_peer', `Peer ${targetPeerId} not connected`, {
        peerId: fromPeerId,
        context: `forward-signal:${targetPeerId ?? 'unknown'}`
      });
    }
    return;
  }

  const target = peers.get(targetPeerId);
  target.socket.send(
    JSON.stringify({
      type: 'signal',
      fromPeerId,
      payload: message.payload
    })
  );
}

/**
 * Updates heartbeat information for a peer.
 */
function refreshPeer(peerId, message) {
  const entry = peers.get(peerId);
  if (!entry) return;

  entry.lastSeen = Date.now();
  let metadataChanged = false;

  if (message.metadata) {
    metadataChanged = applyPeerMetadata(entry, message.metadata) || metadataChanged;
  }

  if (typeof message.latencyMs === 'number' && Number.isFinite(message.latencyMs)) {
    metadataChanged = assignIfChanged(entry.metadata, 'latencyMs', Math.max(0, message.latencyMs)) || metadataChanged;
  }

  if (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
    const computedLatency = entry.lastSeen - message.timestamp;
    if (computedLatency >= 0) {
      metadataChanged = assignIfChanged(entry.metadata, 'latencyMs', computedLatency) || metadataChanged;
    }
  }

  if (metadataChanged) {
    broadcastPeerUpdate({
      type: 'peer-metadata',
      peerId,
      metadata: entry.metadata,
      lastSeen: entry.lastSeen
    }, peerId);
  }

  emitPeerHeartbeatEvent(peerId);
}

/**
 * Broadcasts a shallow event to all peers except optional omitPeerId.
 */
function broadcastPeerUpdate(event, omitPeerId = null) {
  const raw = JSON.stringify(event);
  for (const [peerId, peer] of peers.entries()) {
    if (peerId === omitPeerId) continue;
    try {
      peer.socket.send(raw);
    } catch (error) {
      console.warn(`⚠️  Failed to notify peer ${peerId}`, error);
    }
  }
}

/**
 * Returns a snapshot of peers that are currently available.
 */
function getPeerSnapshot(excludePeerId = null) {
  return Array.from(peers.entries())
    .filter(([peerId]) => peerId !== excludePeerId)
    .map(([peerId, entry]) => ({
      peerId,
      capabilities: entry.capabilities,
      lastSeen: entry.lastSeen,
      metadata: { ...entry.metadata }
    }));
}

/**
 * Periodically evict peers that have stopped sending heartbeats.
 */
setInterval(() => {
  const now = Date.now();
  for (const [peerId, entry] of peers.entries()) {
    if (now - entry.lastSeen > PEER_TIMEOUT) {
      try {
        entry.socket.terminate();
      } catch {
        // ignore termination errors
      }
      emitPeerHeartbeatEvent(peerId, {
        lastSeen: new Date(entry.lastSeen).toISOString()
      });
      emitTelemetry(COMPONENT_NAME, 'error.event', {
        message: `Peer ${peerId} timed out`,
        code: 'peer_timeout',
        peerId,
        context: 'heartbeat-monitor'
      });
      peers.delete(peerId);
      console.log(`? Peer timed out: ${peerId}`);
      broadcastPeerUpdate({ type: 'peer-left', peerId });
    }
  }
}, HEARTBEAT_INTERVAL);
function validateMessage(message) {
  if (typeof message !== 'object' || message === null) {
    return 'Payload must be an object';
  }
  if (typeof message.type !== 'string') {
    return 'Missing "type" field';
  }

  switch (message.type) {
    case 'register': {
      if (message.peerId && typeof message.peerId !== 'string') {
        return '"peerId" must be a string';
      }
      if (message.capabilities && !Array.isArray(message.capabilities)) {
        return '"capabilities" must be an array';
      }
      if (message.metadata && typeof message.metadata !== 'object') {
        return '"metadata" must be an object';
      }
      if (SHARED_SECRET && typeof message.authToken !== 'string') {
        return '"authToken" is required when server enforces auth';
      }
      return null;
    }
    case 'discover':
    case 'heartbeat': {
      if (message.metadata && typeof message.metadata !== 'object') {
        return '"metadata" must be an object';
      }
      if (message.latencyMs !== undefined && !Number.isFinite(message.latencyMs)) {
        return '"latencyMs" must be a finite number';
      }
      if (message.timestamp !== undefined && !Number.isFinite(message.timestamp)) {
        return '"timestamp" must be a finite number';
      }
      return null;
    }
    case 'signal': {
      if (typeof message.targetPeerId !== 'string') {
        return '"targetPeerId" must be a string';
      }
      if (typeof message.payload !== 'object' || message.payload === null) {
        return '"payload" must be an object';
      }
      if (typeof message.payload.type !== 'string') {
        return '"payload.type" must be a string';
      }
      if (['offer', 'answer'].includes(message.payload.type)) {
        if (typeof message.payload.sdp !== 'string') {
          return '"payload.sdp" must be provided for offer/answer';
        }
      }
      if (message.payload.type === 'ice-candidate') {
        if (
          typeof message.payload.candidate !== 'object' ||
          message.payload.candidate === null
        ) {
          return '"payload.candidate" must be an object';
        }
      }
      return null;
    }
    default:
      return `Unsupported message type "${message.type}"`;
  }
}

function sendError(socket, code, message, { peerId = null, context = null } = {}) {
  try {
    socket.send(JSON.stringify({ type: 'error', error: { code, message } }));
  } catch {
    // ignore send failures
  }
  const payload = {
    message: typeof message === 'string' ? message : String(message),
    code
  };
  if (peerId) {
    payload.peerId = peerId;
  }
  if (context) {
    payload.context = context;
  }
  emitTelemetry(COMPONENT_NAME, 'error.event', payload);
}

function authorize(authToken) {
  if (!SHARED_SECRET) return true;
  return authToken === SHARED_SECRET;
}

function parseIceServers(value) {
  if (!value) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(isValidIceServer)) {
      return parsed;
    }
    console.warn('⚠️  SIGNALING_ICE_SERVERS ignored: must be a JSON array of RTCIceServer objects');
    return DEFAULT_ICE_SERVERS;
  } catch (error) {
    console.warn('⚠️  Failed to parse SIGNALING_ICE_SERVERS, falling back to default', error);
    return DEFAULT_ICE_SERVERS;
  }
}

function isValidIceServer(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.urls !== 'string' && !Array.isArray(entry.urls)) return false;
  if (entry.username && typeof entry.username !== 'string') return false;
  if (entry.credential && typeof entry.credential !== 'string') return false;
  return true;
}

function sanitizePeerMetadata(metadata, { mergeWithDefaults = true } = {}) {
  const base = mergeWithDefaults ? { ...DEFAULT_METADATA } : {};
  if (!metadata || typeof metadata !== 'object') {
    return base;
  }

  if ('region' in metadata) {
    const region = extractString(metadata.region, 64);
    if (region) {
      base.region = region;
    } else if (metadata.region === null) {
      base.region = DEFAULT_METADATA.region;
    } else if (!mergeWithDefaults) {
      delete base.region;
    }
  }

  if ('capacity' in metadata) {
    const capacity = extractNumber(metadata.capacity, { min: 0, max: 10_000, round: true });
    if (capacity !== undefined) {
      base.capacity = capacity;
    } else if (metadata.capacity === null) {
      base.capacity = DEFAULT_METADATA.capacity;
    } else if (!mergeWithDefaults) {
      delete base.capacity;
    }
  }

  if ('latencyMs' in metadata) {
    const latency = extractNumber(metadata.latencyMs, { min: 0, max: 120_000, round: true });
    if (latency !== undefined) {
      base.latencyMs = latency;
    } else if (metadata.latencyMs === null) {
      base.latencyMs = DEFAULT_METADATA.latencyMs;
    } else if (!mergeWithDefaults) {
      delete base.latencyMs;
    }
  }

  if ('version' in metadata) {
    const version = extractString(metadata.version, 32);
    if (version) {
      base.version = version;
    } else if (metadata.version === null) {
      base.version = DEFAULT_METADATA.version;
    } else if (!mergeWithDefaults) {
      delete base.version;
    }
  }

  if ('platform' in metadata) {
    const platform = extractString(metadata.platform, 64);
    if (platform) {
      base.platform = platform;
    } else if (metadata.platform === null) {
      base.platform = DEFAULT_METADATA.platform;
    } else if (!mergeWithDefaults) {
      delete base.platform;
    }
  }

  if ('userAgent' in metadata) {
    const userAgent = extractString(metadata.userAgent, 256);
    if (userAgent) {
      base.userAgent = userAgent;
    } else if (metadata.userAgent === null) {
      base.userAgent = DEFAULT_METADATA.userAgent;
    } else if (!mergeWithDefaults) {
      delete base.userAgent;
    }
  }

  if ('language' in metadata) {
    const language = extractString(metadata.language, 32);
    if (language) {
      base.language = language;
    } else if (metadata.language === null) {
      base.language = DEFAULT_METADATA.language;
    } else if (!mergeWithDefaults) {
      delete base.language;
    }
  }

  if ('lastHeartbeat' in metadata) {
    const lastHeartbeat = extractNumber(metadata.lastHeartbeat, { min: 0, max: Number.MAX_SAFE_INTEGER, round: true });
    if (lastHeartbeat !== undefined) {
      base.lastHeartbeat = lastHeartbeat;
    } else if (metadata.lastHeartbeat === null) {
      base.lastHeartbeat = DEFAULT_METADATA.lastHeartbeat;
    } else if (!mergeWithDefaults) {
      delete base.lastHeartbeat;
    }
  }

  if ('uptimeMs' in metadata) {
    const uptimeMs = extractNumber(metadata.uptimeMs, { min: 0, max: Number.MAX_SAFE_INTEGER, round: true });
    if (uptimeMs !== undefined) {
      base.uptimeMs = uptimeMs;
    } else if (metadata.uptimeMs === null) {
      base.uptimeMs = DEFAULT_METADATA.uptimeMs;
    } else if (!mergeWithDefaults) {
      delete base.uptimeMs;
    }
  }

  if ('deviceMemoryGb' in metadata) {
    const deviceMemory = extractNumber(metadata.deviceMemoryGb, { min: 0, max: 1024 });
    if (deviceMemory !== undefined) {
      base.deviceMemoryGb = deviceMemory;
    } else if (metadata.deviceMemoryGb === null) {
      base.deviceMemoryGb = DEFAULT_METADATA.deviceMemoryGb;
    } else if (!mergeWithDefaults) {
      delete base.deviceMemoryGb;
    }
  }

  if ('successRate' in metadata) {
    const successRate = extractNumber(metadata.successRate, { min: 0, max: 1 });
    if (successRate !== undefined) {
      base.successRate = successRate;
    } else if (metadata.successRate === null) {
      base.successRate = DEFAULT_METADATA.successRate;
    } else if (!mergeWithDefaults) {
      delete base.successRate;
    }
  }

  return base;
}

function applyPeerMetadata(entry, metadata) {
  const sanitized = sanitizePeerMetadata(metadata, { mergeWithDefaults: false });
  let changed = false;
  for (const [key, value] of Object.entries(sanitized)) {
    changed = assignIfChanged(entry.metadata, key, value) || changed;
  }
  return changed;
}

function assignIfChanged(target, key, value) {
  if (value === undefined) {
    return false;
  }
  if (Object.is(target[key], value)) {
    return false;
  }
  target[key] = value;
  return true;
}

function extractString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function extractNumber(value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, round = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const clamped = Math.min(max, Math.max(min, numeric));
  return round ? Math.round(clamped) : clamped;
}

