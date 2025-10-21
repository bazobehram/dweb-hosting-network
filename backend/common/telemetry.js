import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT ?? null;
const TELEMETRY_LOG_PATH =
  process.env.TELEMETRY_LOG_PATH ??
  path.resolve(process.cwd(), 'telemetry-events.log');
const SESSION_ID =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const queue = [];
let draining = false;

function nowIso() {
  return new Date().toISOString();
}

async function postEvent(payload) {
  if (!TELEMETRY_ENDPOINT || typeof global.fetch !== 'function') {
    return false;
  }
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
    return true;
  } catch {
    return false;
  }
}

function appendLocal(payload) {
  const line = `${JSON.stringify(payload)}\n`;
  queue.push(line);
  if (!draining) {
    draining = true;
    setImmediate(flushQueue);
  }
}

async function flushQueue() {
  while (queue.length) {
    const line = queue.shift();
    try {
      await fs.promises.mkdir(path.dirname(TELEMETRY_LOG_PATH), { recursive: true });
      await fs.promises.appendFile(TELEMETRY_LOG_PATH, line);
    } catch {
      // swallow logging errors
      break;
    }
  }
  draining = false;
}

export function emitTelemetry(component, event, payload = {}) {
  if (!event) return;
  const envelope = {
    event,
    timestamp: nowIso(),
    sessionId: SESSION_ID,
    component,
    ...payload
  };
  postEvent(envelope).then((success) => {
    if (!success) {
      appendLocal(envelope);
    }
  });
}
