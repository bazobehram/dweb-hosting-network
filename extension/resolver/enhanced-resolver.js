/**
 * Enhanced Production-Ready Resolver
 * Includes storage fallback, better error handling, and peer discovery
 */

import { MultiRegistryClient } from "../scripts/api/multiRegistryClient.js";
import { settings } from "./settings.js";
import { TelemetryClient } from "../scripts/telemetry/telemetryClient.js";

class EnhancedResolver {
  constructor() {
    this.registryClient = new MultiRegistryClient();
    this.telemetry = new TelemetryClient({ component: "enhanced-resolver" });
    this.storageServiceUrl = 'http://localhost:8789';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Enhanced domain resolution with multiple fallback strategies
   */
  async resolveDomain(domain) {
    const resolveStats = {
      startTime: Date.now(),
      attempts: [],
      strategies: [],
      finalStrategy: null,
      success: false
    };

    try {
      this.logMessage(`🔍 Enhanced resolve: ${domain}`);

      // Strategy 1: Registry + P2P (with replica fix)
      const result = await this.tryP2PResolution(domain, resolveStats);
      if (result.success) {
        resolveStats.success = true;
        resolveStats.finalStrategy = 'p2p';
        this.logMessage(`✅ P2P resolution successful`);
        return result;
      }

      // Strategy 2: Direct storage fallback (if P2P fails)
      if (result.manifestId) {
        const storageResult = await this.tryStorageFallback(result.manifestId, domain, resolveStats);
        if (storageResult.success) {
          resolveStats.success = true;
          resolveStats.finalStrategy = 'storage-fallback';
          this.logMessage(`✅ Storage fallback successful`);
          return storageResult;
        }
      }

      // Strategy 3: Registry content resolver endpoint (bypass P2P entirely)
      const resolverResult = await this.tryRegistryResolver(domain, resolveStats);
      if (resolverResult.success) {
        resolveStats.success = true;
        resolveStats.finalStrategy = 'registry-resolver';
        this.logMessage(`✅ Registry resolver successful`);
        return resolverResult;
      }

      // All strategies failed
      this.logMessage(`❌ All resolution strategies failed`);
      return {
        success: false,
        error: 'All resolution strategies failed',
        domain,
        strategies: resolveStats.strategies
      };

    } finally {
      // Emit telemetry
      this.telemetry.emit("enhanced.resolve.summary", {
        domain,
        duration: Date.now() - resolveStats.startTime,
        success: resolveStats.success,
        finalStrategy: resolveStats.finalStrategy,
        strategiesAttempted: resolveStats.strategies.length
      });
    }
  }

  /**
   * Strategy 1: P2P resolution with replica fix
   */
  async tryP2PResolution(domain, stats) {
    stats.strategies.push('p2p');
    
    try {
      // Get domain with enhanced replica handling
      const record = await this.registryClient.getDomain(domain);
      if (!record) {
        return { success: false, error: 'Domain not found', domain };
      }

      if (!record.manifestId || String(record.manifestId).toLowerCase() === 'unbound') {
        return { success: false, error: 'Domain not bound to content', domain };
      }

      // Get manifest
      const manifest = await this.registryClient.getManifest(record.manifestId);
      if (!manifest) {
        return { success: false, error: 'Manifest not found', manifestId: record.manifestId };
      }

      // PRODUCTION FIX: Enhanced replica resolution
      const replicas = this.getReplicasEnhanced(record, manifest);
      
      this.logMessage(`📄 Manifest: ${manifest.fileName} (${manifest.chunkCount} chunks)`);
      this.logMessage(`👥 Replicas: ${replicas.length} (from ${replicas.source})`);

      if (replicas.length === 0) {
        this.logMessage(`⚠️  No replicas available for P2P resolution`);
        return { 
          success: false, 
          error: 'No replicas available', 
          manifestId: record.manifestId,
          domain 
        };
      }

      // Try P2P chunk resolution
      const chunks = [];
      for (let i = 0; i < manifest.chunkCount; i++) {
        const chunkData = await this.fetchChunkWithRetry(record.manifestId, i, replicas);
        if (!chunkData) {
          this.logMessage(`❌ P2P failed at chunk ${i}`);
          return { 
            success: false, 
            error: `P2P chunk ${i} unavailable`, 
            manifestId: record.manifestId,
            domain,
            failedChunk: i 
          };
        }
        chunks.push(chunkData);
        this.logMessage(`✅ Chunk ${i + 1}/${manifest.chunkCount} via P2P`);
      }

      // Success - assemble content
      const blob = new Blob(chunks, { type: manifest.mimeType });
      return {
        success: true,
        strategy: 'p2p',
        domain,
        manifest,
        blob,
        url: URL.createObjectURL(blob),
        replicasUsed: replicas.length
      };

    } catch (error) {
      this.logMessage(`❌ P2P resolution error: ${error.message}`);
      return { success: false, error: error.message, domain };
    }
  }

  /**
   * Strategy 2: Direct storage service fallback
   */
  async tryStorageFallback(manifestId, domain, stats) {
    stats.strategies.push('storage-fallback');
    
    try {
      this.logMessage(`🏪 Trying storage fallback for manifest: ${manifestId}`);

      // Get manifest details
      const manifest = await this.registryClient.getManifest(manifestId);
      if (!manifest) {
        return { success: false, error: 'Manifest not found for storage fallback' };
      }

      // Try to fetch chunks directly from storage service
      const chunks = [];
      for (let i = 0; i < manifest.chunkCount; i++) {
        const chunkData = await this.fetchFromStorage(manifestId, i);
        if (!chunkData) {
          this.logMessage(`❌ Storage fallback failed at chunk ${i}`);
          return { success: false, error: `Storage chunk ${i} unavailable` };
        }
        chunks.push(chunkData);
        this.logMessage(`✅ Chunk ${i + 1}/${manifest.chunkCount} via storage`);
      }

      // Success - assemble content
      const blob = new Blob(chunks, { type: manifest.mimeType });
      return {
        success: true,
        strategy: 'storage-fallback',
        domain,
        manifest,
        blob,
        url: URL.createObjectURL(blob)
      };

    } catch (error) {
      this.logMessage(`❌ Storage fallback error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Strategy 3: Registry resolver endpoint (direct content serving)
   */
  async tryRegistryResolver(domain, stats) {
    stats.strategies.push('registry-resolver');
    
    try {
      this.logMessage(`🔧 Trying registry resolver endpoint`);

      const endpoints = this.registryClient.getCurrentEndpoints();
      const resolverUrl = `${endpoints.registry}/resolve/${domain}`;

      const response = await fetch(resolverUrl);
      if (!response.ok) {
        return { success: false, error: `Registry resolver: HTTP ${response.status}` };
      }

      // Get content directly
      const content = await response.text();
      const contentType = response.headers.get('Content-Type') || 'text/plain';

      // Create blob
      const blob = new Blob([content], { type: contentType });
      
      this.logMessage(`✅ Content served directly by registry (${content.length} bytes)`);

      return {
        success: true,
        strategy: 'registry-resolver',
        domain,
        blob,
        url: URL.createObjectURL(blob),
        contentType,
        size: content.length
      };

    } catch (error) {
      this.logMessage(`❌ Registry resolver error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enhanced replica resolution with multiple sources
   */
  getReplicasEnhanced(record, manifest) {
    // Try domain replicas first
    if (record.replicas && record.replicas.length > 0) {
      return { ...record.replicas, source: 'domain' };
    }

    // Fall back to manifest replicas
    if (manifest.replicas && manifest.replicas.length > 0) {
      return { ...manifest.replicas, source: 'manifest' };
    }

    // No replicas found
    return { length: 0, source: 'none' };
  }

  /**
   * Fetch chunk with retry logic
   */
  async fetchChunkWithRetry(manifestId, chunkIndex, replicas, attempt = 1) {
    try {
      // Use existing P2P mechanism with retries
      return await this.fetchChunkP2P(manifestId, chunkIndex, replicas);
    } catch (error) {
      if (attempt < this.maxRetries) {
        this.logMessage(`🔄 Retry ${attempt}/${this.maxRetries} for chunk ${chunkIndex}`);
        await this.delay(this.retryDelay * attempt);
        return await this.fetchChunkWithRetry(manifestId, chunkIndex, replicas, attempt + 1);
      }
      return null;
    }
  }

  /**
   * P2P chunk fetching (using existing extension mechanism)
   */
  async fetchChunkP2P(manifestId, chunkIndex, replicas) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "peer-chunk-request",
        manifestId,
        chunkIndex,
        replicas,
      });

      if (response?.status === "success" && response.data) {
        return this.base64ToUint8Array(response.data);
      }
      return null;
    } catch (error) {
      throw new Error(`P2P fetch failed: ${error.message}`);
    }
  }

  /**
   * Direct storage service fetch
   */
  async fetchFromStorage(manifestId, chunkIndex) {
    try {
      const response = await fetch(`${this.storageServiceUrl}/chunks/${manifestId}/${chunkIndex}`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.data) {
        return this.base64ToUint8Array(data.data);
      }
      return null;
    } catch (error) {
      console.warn('Storage fetch error:', error);
      return null;
    }
  }

  /**
   * Utility methods
   */
  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logMessage(message) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] Enhanced Resolver: ${message}`);
    
    // Also log to UI if available
    try {
      const logOutput = document.getElementById('logOutput');
      if (logOutput) {
        logOutput.textContent += `[${time}] ${message}\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    } catch (error) {
      // Ignore if not in browser context
    }
  }
}

// Export for use
export { EnhancedResolver };