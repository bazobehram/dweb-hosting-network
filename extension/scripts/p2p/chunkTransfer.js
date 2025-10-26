/**
 * P2P Chunk Transfer - libp2p integration for chunk operations
 * 
 * Provides high-level API for chunk request/upload using libp2p streams
 */

export class P2PChunkTransfer {
  constructor(p2pManager, chunkManager) {
    this.p2pManager = p2pManager;
    this.chunkManager = chunkManager;
    
    // Setup chunk request handler for incoming requests
    this.p2pManager.setChunkRequestHandler(this.handleChunkRequest.bind(this));
    
    // Track pending uploads
    this.pendingUploads = new Map(); // manifestId -> { chunkIndex -> { peerId, status } }
  }
  
  /**
   * Handle incoming chunk requests from peers
   * Called by p2p-manager when a peer requests a chunk
   */
  async handleChunkRequest({ manifestId, chunkIndex }) {
    console.log('[P2PChunkTransfer] Handling chunk request:', { manifestId, chunkIndex });
    
    // Try to get chunk from transfer (uploaded files)
    const transfer = this.chunkManager.getTransfer(manifestId);
    if (transfer) {
      if (chunkIndex >= 0 && chunkIndex < transfer.totalChunks) {
        const base64Data = transfer.getChunkBase64(chunkIndex);
        console.log('[P2PChunkTransfer] Serving chunk from transfer:', { manifestId, chunkIndex });
        return base64Data;
      }
    }
    
    // Try to get from cache (received chunks)
    const cached = await this.getChunkFromCache(manifestId, chunkIndex);
    if (cached) {
      console.log('[P2PChunkTransfer] Serving chunk from cache:', { manifestId, chunkIndex });
      return cached;
    }
    
    throw new Error('Chunk not found');
  }
  
  /**
   * Request a chunk from a specific peer
   */
  async requestChunkFromPeer(peerId, manifestId, chunkIndex, timeout = 30000) {
    console.log('[P2PChunkTransfer] Requesting chunk:', { peerId, manifestId, chunkIndex });
    
    try {
      const response = await this.p2pManager.requestChunk(peerId, manifestId, chunkIndex, timeout);
      
      if (response.status === 'success' && response.data) {
        // Cache the received chunk
        await this.cacheChunk(manifestId, chunkIndex, response.data);
        return response.data;
      }
      
      throw new Error(response.reason || 'Chunk request failed');
      
    } catch (error) {
      console.error('[P2PChunkTransfer] Request failed:', error);
      throw error;
    }
  }
  
  /**
   * Upload chunk to a peer (replication)
   */
  async uploadChunkToPeer(peerId, manifestId, chunkIndex) {
    console.log('[P2PChunkTransfer] Uploading chunk:', { peerId, manifestId, chunkIndex });
    
    // Get chunk data
    const transfer = this.chunkManager.getTransfer(manifestId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }
    
    if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
      throw new Error('Invalid chunk index');
    }
    
    const data = transfer.getChunkBase64(chunkIndex);
    const hash = transfer.getChunkHash(chunkIndex);
    
    // Track upload
    if (!this.pendingUploads.has(manifestId)) {
      this.pendingUploads.set(manifestId, new Map());
    }
    const manifestUploads = this.pendingUploads.get(manifestId);
    manifestUploads.set(chunkIndex, { peerId, status: 'pending', startTime: Date.now() });
    
    try {
      const response = await this.p2pManager.sendChunk(peerId, manifestId, chunkIndex, data, hash);
      
      manifestUploads.set(chunkIndex, { peerId, status: 'success', completedTime: Date.now() });
      
      console.log('[P2PChunkTransfer] Upload successful:', { peerId, manifestId, chunkIndex });
      return response;
      
    } catch (error) {
      manifestUploads.set(chunkIndex, { peerId, status: 'failed', error: error.message });
      console.error('[P2PChunkTransfer] Upload failed:', error);
      throw error;
    }
  }
  
  /**
   * Upload all chunks to a peer (full replication)
   */
  async replicateToPeer(peerId, manifestId, onProgress = null) {
    const transfer = this.chunkManager.getTransfer(manifestId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }
    
    const totalChunks = transfer.totalChunks;
    const results = {
      successful: 0,
      failed: 0,
      total: totalChunks,
      errors: []
    };
    
    console.log('[P2PChunkTransfer] Starting replication:', { peerId, manifestId, totalChunks });
    
    for (let i = 0; i < totalChunks; i++) {
      try {
        await this.uploadChunkToPeer(peerId, manifestId, i);
        results.successful++;
        
        if (onProgress) {
          onProgress({
            chunkIndex: i,
            totalChunks,
            successful: results.successful,
            failed: results.failed
          });
        }
        
      } catch (error) {
        results.failed++;
        results.errors.push({ chunkIndex: i, error: error.message });
        console.warn(`[P2PChunkTransfer] Failed to upload chunk ${i}:`, error);
      }
    }
    
    console.log('[P2PChunkTransfer] Replication completed:', results);
    return results;
  }
  
  /**
   * Get chunk from local cache
   */
  async getChunkFromCache(manifestId, chunkIndex) {
    // This will be implemented using the existing cache mechanism
    // For now, we'll integrate with the global chunkCache from panel.js
    if (typeof window !== 'undefined' && window.getCachedChunk) {
      return window.getCachedChunk(manifestId, chunkIndex);
    }
    return null;
  }
  
  /**
   * Cache a chunk locally
   */
  async cacheChunk(manifestId, chunkIndex, base64Data) {
    // Integrate with the global cache from panel.js
    if (typeof window !== 'undefined' && window.cacheChunk) {
      window.cacheChunk(manifestId, chunkIndex, base64Data);
    }
  }
  
  /**
   * Get upload statistics
   */
  getUploadStats(manifestId) {
    const uploads = this.pendingUploads.get(manifestId);
    if (!uploads) {
      return { total: 0, pending: 0, successful: 0, failed: 0 };
    }
    
    const stats = { total: uploads.size, pending: 0, successful: 0, failed: 0 };
    
    for (const [chunkIndex, info] of uploads.entries()) {
      if (info.status === 'pending') stats.pending++;
      else if (info.status === 'success') stats.successful++;
      else if (info.status === 'failed') stats.failed++;
    }
    
    return stats;
  }
}
