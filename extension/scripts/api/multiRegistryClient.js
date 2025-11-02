/**
 * Multi-Registry Client with Desktop Node Detection and VPS Fallback
 * Tries desktop node (localhost) first, falls back to VPS if unavailable
 */

import { RegistryClient } from './registryClient.js';

const DESKTOP_NODE_ENDPOINTS = {
  registry: 'http://localhost:8788',
  signaling: 'ws://localhost:8787',
  storage: 'http://localhost:8789'
};

const VPS_ENDPOINTS = {
  registry: 'http://34.107.74.70:8788',
  signaling: 'ws://34.107.74.70:8787', 
  storage: 'http://34.107.74.70:8789'
};

export class MultiRegistryClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.preferDesktopNode = options.preferDesktopNode !== false; // Default true
    this.healthCheckTimeout = options.healthCheckTimeout || 2000; // 2s timeout
    this.lastHealthCheck = null;
    this.desktopNodeAvailable = null;
    this.healthCheckInterval = null;
    
    // Initialize clients
    this.desktopClient = new RegistryClient(DESKTOP_NODE_ENDPOINTS.registry, { apiKey: this.apiKey });
    this.vpsClient = new RegistryClient(VPS_ENDPOINTS.registry, { apiKey: this.apiKey });
    
    // Start periodic health checks
    this.startHealthChecking();
  }

  /**
   * Get current endpoint configuration
   */
  getCurrentEndpoints() {
    if (this.desktopNodeAvailable && this.preferDesktopNode) {
      return {
        type: 'desktop-node',
        registry: DESKTOP_NODE_ENDPOINTS.registry,
        signaling: DESKTOP_NODE_ENDPOINTS.signaling,
        storage: DESKTOP_NODE_ENDPOINTS.storage
      };
    }
    return {
      type: 'vps',
      registry: VPS_ENDPOINTS.registry,
      signaling: VPS_ENDPOINTS.signaling,
      storage: VPS_ENDPOINTS.storage
    };
  }

  /**
   * Get the currently active registry client
   */
  getActiveClient() {
    if (this.desktopNodeAvailable && this.preferDesktopNode) {
      return this.desktopClient;
    }
    return this.vpsClient;
  }

  /**
   * Check if desktop node is available
   */
  async checkDesktopNodeHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.healthCheckTimeout);
      
      const response = await fetch(`${DESKTOP_NODE_ENDPOINTS.registry}/health`, {
        signal: controller.signal,
        cache: 'no-cache'
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        const isHealthy = data.status === 'healthy' && data.service === 'registry';
        this.desktopNodeAvailable = isHealthy;
        this.lastHealthCheck = Date.now();
        return isHealthy;
      }
      
      this.desktopNodeAvailable = false;
      this.lastHealthCheck = Date.now();
      return false;
      
    } catch (error) {
      // Desktop node is not available (connection refused, timeout, etc.)
      this.desktopNodeAvailable = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  /**
   * Start periodic health checking
   */
  startHealthChecking() {
    // Initial check
    this.checkDesktopNodeHealth();
    
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkDesktopNodeHealth();
    }, 30000);
  }

  /**
   * Stop health checking
   */
  stopHealthChecking() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Set API key for both clients
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.desktopClient.setApiKey(apiKey);
    this.vpsClient.setApiKey(apiKey);
  }

  /**
   * Set desktop node preference
   */
  setPreferDesktopNode(prefer) {
    this.preferDesktopNode = prefer;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      desktopNodeAvailable: this.desktopNodeAvailable,
      preferDesktopNode: this.preferDesktopNode,
      activeEndpoint: this.getCurrentEndpoints().type,
      lastHealthCheck: this.lastHealthCheck,
      endpoints: this.getCurrentEndpoints()
    };
  }

  // Proxy all registry client methods through fallback logic

  async registerManifest(manifest) {
    const client = this.getActiveClient();
    try {
      return await client.registerManifest(manifest);
    } catch (error) {
      // If desktop node fails and we're using it, try VPS as fallback
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.registerManifest(manifest);
      }
      throw error;
    }
  }

  async registerDomain(payload) {
    const client = this.getActiveClient();
    try {
      return await client.registerDomain(payload);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.registerDomain(payload);
      }
      throw error;
    }
  }

  async listDomains() {
    const client = this.getActiveClient();
    try {
      return await client.listDomains();
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.listDomains();
      }
      throw error;
    }
  }

  async getDomain(domain) {
    const client = this.getActiveClient();
    try {
      return await client.getDomain(domain);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.getDomain(domain);
      }
      throw error;
    }
  }

  async getManifest(manifestId) {
    const client = this.getActiveClient();
    try {
      return await client.getManifest(manifestId);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.getManifest(manifestId);
      }
      throw error;
    }
  }

  async getManifestChunk(manifestId, chunkIndex) {
    const client = this.getActiveClient();
    try {
      return await client.getManifestChunk(manifestId, chunkIndex);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.getManifestChunk(manifestId, chunkIndex);
      }
      throw error;
    }
  }

  async getChunk(manifestId, chunkIndex) {
    // Try storage service first (desktop node)
    try {
      const storageUrl = 'http://localhost:8789';
      const response = await fetch(`${storageUrl}/chunks/${encodeURIComponent(manifestId)}/${encodeURIComponent(chunkIndex)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[MultiRegistry] Desktop node storage failed:', error.message);
    }

    // Fallback to VPS storage service
    try {
      const vpsStorageUrl = 'http://34.107.74.70:8789';
      const response = await fetch(`${vpsStorageUrl}/chunks/${encodeURIComponent(manifestId)}/${encodeURIComponent(chunkIndex)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[MultiRegistry] VPS storage failed:', error.message);
    }

    return null;
  }

  async getChunkPointerHistory(manifestId, chunkIndex, options = {}) {
    const client = this.getActiveClient();
    try {
      return await client.getChunkPointerHistory(manifestId, chunkIndex, options);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.getChunkPointerHistory(manifestId, chunkIndex, options);
      }
      throw error;
    }
  }

  async updateChunkReplica(manifestId, payload) {
    const client = this.getActiveClient();
    try {
      return await client.updateChunkReplica(manifestId, payload);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.updateChunkReplica(manifestId, payload);
      }
      throw error;
    }
  }

  async updateChunkPointer(manifestId, chunkIndex, payload) {
    const client = this.getActiveClient();
    try {
      return await client.updateChunkPointer(manifestId, chunkIndex, payload);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.updateChunkPointer(manifestId, chunkIndex, payload);
      }
      throw error;
    }
  }

  async updateDomainBinding(domain, payload) {
    const client = this.getActiveClient();
    try {
      return await client.updateDomainBinding(domain, payload);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.updateDomainBinding(domain, payload);
      }
      throw error;
    }
  }

  async deleteDomain(domain) {
    const client = this.getActiveClient();
    try {
      return await client.deleteDomain(domain);
    } catch (error) {
      if (client === this.desktopClient) {
        console.warn('[MultiRegistry] Desktop node failed, falling back to VPS:', error.message);
        this.desktopNodeAvailable = false;
        return await this.vpsClient.deleteDomain(domain);
      }
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopHealthChecking();
  }
}