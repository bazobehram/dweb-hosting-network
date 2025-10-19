const DEFAULT_REGISTRY_URL = 'http://localhost:8788';

export class RegistryClient {
  constructor(baseUrl = DEFAULT_REGISTRY_URL, options = {}) {
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() || null : null;
  }

  setBaseUrl(url) {
    this.baseUrl = sanitizeBaseUrl(url);
  }

  setApiKey(apiKey) {
    if (typeof apiKey === 'string' && apiKey.trim()) {
      this.apiKey = apiKey.trim();
    } else {
      this.apiKey = null;
    }
  }

  getAuthHeaders() {
    if (!this.apiKey) {
      return {};
    }
    return { 'X-API-Key': this.apiKey };
  }

  withAuthHeaders(extra = {}) {
    return {
      ...extra,
      ...this.getAuthHeaders()
    };
  }

  async registerManifest(manifest) {
    const response = await fetch(`${this.baseUrl}/manifests`, {
      method: 'POST',
      headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(manifest)
    });

    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Manifest registration failed (${response.status})`);
    }

    return response.json();
  }

  async registerDomain(payload) {
    const response = await fetch(`${this.baseUrl}/domains`, {
      method: 'POST',
      headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Domain registration failed (${response.status})`);
    }

    return response.json();
  }

  async getDomain(domain) {
    const response = await fetch(`${this.baseUrl}/domains/${encodeURIComponent(domain)}`, {
      headers: this.withAuthHeaders({ Accept: 'application/json' })
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch domain (${response.status})`);
    }
    return response.json();
  }

  async getManifest(manifestId) {
    const response = await fetch(`${this.baseUrl}/manifests/${encodeURIComponent(manifestId)}`, {
      headers: this.withAuthHeaders({ Accept: 'application/json' })
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Failed to fetch manifest (${response.status})`);
    }
    return response.json();
  }

  async getManifestChunk(manifestId, chunkIndex) {
    const response = await fetch(
      `${this.baseUrl}/manifests/${encodeURIComponent(manifestId)}/chunks/${encodeURIComponent(chunkIndex)}`,
      {
        headers: this.withAuthHeaders({ Accept: 'application/json' })
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Failed to fetch manifest chunk (${response.status})`);
    }
    return response.json();
  }

  async getChunkPointerHistory(manifestId, chunkIndex, { limit } = {}) {
    const params = new URLSearchParams();
    if (Number.isInteger(limit) && limit > 0) {
      params.set('limit', String(limit));
    }
    const query = params.toString();
    const response = await fetch(
      `${this.baseUrl}/manifests/${encodeURIComponent(manifestId)}/chunks/${encodeURIComponent(chunkIndex)}/pointers${query ? `?${query}` : ''}`,
      {
        headers: this.withAuthHeaders({ Accept: 'application/json' })
      }
    );
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Failed to fetch pointer history (${response.status})`);
    }
    return response.json();
  }

  async updateChunkReplica(manifestId, payload) {
    const response = await fetch(`${this.baseUrl}/manifests/${encodeURIComponent(manifestId)}/replicas`, {
      method: 'PATCH',
      headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Replica update failed (${response.status})`);
    }
    return response.json();
  }

  async updateChunkPointer(manifestId, chunkIndex, payload) {
    const response = await fetch(
      `${this.baseUrl}/manifests/${encodeURIComponent(manifestId)}/chunks/${encodeURIComponent(chunkIndex)}`,
      {
        method: 'PATCH',
        headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error ?? `Pointer update failed (${response.status})`);
    }
    return response.json();
  }
}

function sanitizeBaseUrl(value) {
  if (!value) return DEFAULT_REGISTRY_URL;
  return String(value).replace(/\/$/, '');
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
