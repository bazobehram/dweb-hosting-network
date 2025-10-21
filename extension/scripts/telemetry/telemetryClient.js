const ENDPOINT_STORAGE_KEY = 'dweb-telemetry-endpoint';

function resolveEndpoint(explicitEndpoint) {
  if (explicitEndpoint) return explicitEndpoint;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(ENDPOINT_STORAGE_KEY);
      if (stored) return stored;
    }
  } catch {
    // ignore storage access issues
  }
  if (typeof window !== 'undefined' && window.TELEMETRY_ENDPOINT) {
    return window.TELEMETRY_ENDPOINT;
  }
  return null;
}

function generateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export class TelemetryClient {
  constructor({ component, endpoint = null, sessionId = null, context = {} } = {}) {
    this.component = component ?? 'unknown';
    this.sessionId = sessionId ?? generateSessionId();
    this.context = { component: this.component, ...context };
    this.endpoint = resolveEndpoint(endpoint);
  }

  setEndpoint(endpoint) {
    this.endpoint = endpoint;
    try {
      if (typeof localStorage !== 'undefined' && endpoint) {
        localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
      }
    } catch {
      // ignore persistence errors
    }
  }

  setContext(key, value) {
    if (!key) return;
    if (value === undefined || value === null) {
      delete this.context[key];
    } else {
      this.context[key] = value;
    }
  }

  mergeContext(extra = {}) {
    return { ...this.context, ...extra };
  }

  emit(eventName, payload = {}) {
    if (!eventName) return;
    const envelope = {
      event: eventName,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...this.mergeContext(payload)
    };

    if (!this.endpoint) {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[telemetry:noop]', envelope);
      }
      return;
    }

    const body = JSON.stringify(envelope);

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(this.endpoint, body);
        return;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[telemetry] sendBeacon failed', error);
      }
    }

    if (typeof fetch !== 'undefined') {
      fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch((error) => {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[telemetry] fetch error', error);
        }
      });
    }
  }
}
