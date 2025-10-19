export class SignalingClient extends EventTarget {
  constructor({ url, peerId, authToken, capabilities = [], metadata = {} }) {
    super();
    this.url = url;
    this.peerId = peerId;
    this.authToken = authToken;
    this.capabilities = capabilities;
    this.metadata = { ...metadata };

    this.socket = null;
    this.heartbeatInterval = null;
    this.registeredPeerId = null;
  }

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.registeredPeerId);
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);
      } catch (error) {
        reject(error);
        return;
      }

      const onOpen = () => {
        const now = Date.now();
        this.send({
          type: 'register',
          peerId: this.peerId,
          capabilities: this.capabilities,
          metadata: this.buildMetadata(now),
          authToken: this.authToken
        });
      };

      const onMessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
          return;
        }

        if (payload.type === 'registered') {
          this.registeredPeerId = payload.peerId;
          this.startHeartbeat();
          this.dispatchEvent(new CustomEvent('registered', { detail: payload }));
          resolve(payload.peerId);
          return;
        }

        if (payload.type === 'error') {
          const error = new Error(payload.error?.message ?? 'Unknown signaling error');
          error.code = payload.error?.code;
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
          if (payload.error?.code === 'unauthorized') {
            reject(error);
          }
          return;
        }

        this.dispatchEvent(new CustomEvent('message', { detail: payload }));
      };

      const onClose = () => {
        this.stopHeartbeat();
        this.dispatchEvent(new CustomEvent('close'));
      };

      const onError = (event) => {
        const error = event?.error ?? new Error('WebSocket error');
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      };

      this.socket.addEventListener('open', onOpen, { once: true });
      this.socket.addEventListener('message', onMessage);
      this.socket.addEventListener('close', onClose);
      this.socket.addEventListener('error', onError);
    });
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(JSON.stringify(payload));
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();

    const sendHeartbeat = () => {
      try {
        const now = Date.now();
        this.send({
          type: 'heartbeat',
          timestamp: now,
          metadata: this.buildMetadata(now)
        });
      } catch {
        this.stopHeartbeat();
      }
    };

    sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, 25_000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  buildMetadata(now = Date.now()) {
    const metadata = { ...this.metadata };
    metadata.lastHeartbeat = now;

    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      const uptime = performance.now();
      if (Number.isFinite(uptime)) {
        metadata.uptimeMs = Math.round(uptime);
      }
    }

    if (typeof navigator !== 'undefined') {
      if (metadata.userAgent == null && typeof navigator.userAgent === 'string') {
        metadata.userAgent = navigator.userAgent;
      }
      if (metadata.platform == null && typeof navigator.platform === 'string') {
        metadata.platform = navigator.platform;
      }
      if (metadata.language == null && typeof navigator.language === 'string') {
        metadata.language = navigator.language;
      }
      if (metadata.capacity == null && typeof navigator.hardwareConcurrency === 'number') {
        metadata.capacity = navigator.hardwareConcurrency;
      }
      if (metadata.deviceMemoryGb == null && typeof navigator.deviceMemory === 'number') {
        metadata.deviceMemoryGb = navigator.deviceMemory;
      }
      if (metadata.region == null) {
        try {
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (typeof timeZone === 'string' && timeZone) {
            metadata.region = timeZone;
          }
        } catch {
          // ignore best-effort regional hints
        }
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      try {
        const manifest = chrome.runtime.getManifest();
        if (manifest?.version) {
          metadata.version = manifest.version;
        }
      } catch {
        // ignore manifest access issues
      }
    }

    return metadata;
  }
}
