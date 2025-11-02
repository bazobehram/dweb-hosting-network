/**
 * Memory Database Adapter for Desktop Node
 * Simple in-memory database for demo purposes
 * Can be easily replaced with actual SQLite later
 */

const fs = require('fs');
const path = require('path');

class MemoryAdapter {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(process.env.APPDATA || process.env.HOME, 'DWebNode', 'registry.json');
    
    // Initialize empty database structure
    this.data = {
      domains: new Map(),
      manifests: new Map(),
      chunks: new Map()
    };
    
    // Load from file if exists
    this.load();
    
    console.log('✅ Memory database initialized');
  }

  // Persistence methods
  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.data.domains = new Map(data.domains || []);
        this.data.manifests = new Map(data.manifests || []);
        this.data.chunks = new Map(data.chunks || []);
      }
    } catch (error) {
      console.warn('Failed to load database:', error.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {
        domains: Array.from(this.data.domains.entries()),
        manifests: Array.from(this.data.manifests.entries()),
        chunks: Array.from(this.data.chunks.entries())
      };
      
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save database:', error.message);
    }
  }

  // Domain operations (compatible with VPS API)
  
  async getAllDomains() {
    return Array.from(this.data.domains.values()).sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );
  }

  async getDomain(domain) {
    return this.data.domains.get(domain) || null;
  }

  async createDomain(domainData) {
    const { domain, owner, manifestId } = domainData;
    
    if (this.data.domains.has(domain)) {
      throw new Error('Domain already exists');
    }
    
    const now = new Date().toISOString();
    const domainRecord = {
      id: Date.now(),
      domain,
      owner,
      manifest_id: manifestId,
      created_at: now,
      updated_at: now
    };
    
    this.data.domains.set(domain, domainRecord);
    this.save();
    
    return domainRecord;
  }

  async updateDomain(domain, updates) {
    const existing = this.data.domains.get(domain);
    if (!existing) {
      throw new Error('Domain not found');
    }
    
    const { manifestId } = updates;
    const updated = {
      ...existing,
      manifest_id: manifestId,
      updated_at: new Date().toISOString()
    };
    
    this.data.domains.set(domain, updated);
    this.save();
    
    return updated;
  }

  async deleteDomain(domain) {
    const exists = this.data.domains.has(domain);
    if (exists) {
      this.data.domains.delete(domain);
      this.save();
    }
    return exists;
  }

  // Manifest operations

  async getManifest(manifestId) {
    const manifest = this.data.manifests.get(manifestId);
    if (!manifest) return null;
    
    // Ensure arrays are parsed
    return {
      ...manifest,
      chunk_hashes: Array.isArray(manifest.chunk_hashes) 
        ? manifest.chunk_hashes 
        : JSON.parse(manifest.chunk_hashes || '[]'),
      replicas: Array.isArray(manifest.replicas) 
        ? manifest.replicas 
        : JSON.parse(manifest.replicas || '[]')
    };
  }

  async createManifest(manifestData) {
    const {
      manifestId, transferId, fileName, fileSize, mimeType,
      chunkSize, chunkCount, sha256, chunkHashes, replicas
    } = manifestData;

    if (this.data.manifests.has(manifestId)) {
      throw new Error('Manifest already exists');
    }

    const now = new Date().toISOString();
    const manifestRecord = {
      id: Date.now(),
      manifest_id: manifestId,
      transfer_id: transferId,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      chunk_size: chunkSize,
      chunk_count: chunkCount,
      sha256,
      chunk_hashes: chunkHashes || [],
      replicas: replicas || [],
      created_at: now,
      updated_at: now
    };

    this.data.manifests.set(manifestId, manifestRecord);
    this.save();
    
    return manifestRecord;
  }

  // Chunk operations (pointers only, no data)

  async getChunk(manifestId, chunkIndex) {
    const key = `${manifestId}:${chunkIndex}`;
    return this.data.chunks.get(key) || null;
  }

  async createChunkPointer(manifestId, chunkIndex, pointer, expiresAt = null) {
    const key = `${manifestId}:${chunkIndex}`;
    const now = new Date().toISOString();
    
    const chunkRecord = {
      id: Date.now(),
      manifest_id: manifestId,
      chunk_index: chunkIndex,
      chunk_data: null, // Always NULL (no data storage)
      pointer,
      expires_at: expiresAt,
      created_at: now
    };

    this.data.chunks.set(key, chunkRecord);
    this.save();
    
    return { manifestId, chunkIndex, pointer, expiresAt };
  }

  async getChunkPointers(manifestId) {
    const now = new Date();
    const pointers = [];
    
    for (const [key, chunk] of this.data.chunks.entries()) {
      if (chunk.manifest_id === manifestId) {
        // Check expiration
        if (!chunk.expires_at || new Date(chunk.expires_at) > now) {
          pointers.push({
            chunk_index: chunk.chunk_index,
            pointer: chunk.pointer,
            expires_at: chunk.expires_at
          });
        }
      }
    }
    
    return pointers.sort((a, b) => a.chunk_index - b.chunk_index);
  }

  // Health check
  async healthCheck() {
    try {
      return {
        status: 'healthy',
        database: 'memory',
        domains: this.data.domains.size,
        manifests: this.data.manifests.size,
        chunks: this.data.chunks.size,
        dbPath: this.dbPath
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Clean up expired chunk pointers
  async cleanupExpiredPointers() {
    const now = new Date();
    let cleaned = 0;
    
    for (const [key, chunk] of this.data.chunks.entries()) {
      if (chunk.expires_at && new Date(chunk.expires_at) < now) {
        this.data.chunks.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.save();
      console.log(`Cleaned up ${cleaned} expired chunk pointers`);
    }
    
    return cleaned;
  }

  // Close database (no-op for memory)
  close() {
    this.save();
  }

  // Export/import for migration
  async exportData() {
    return {
      domains: Array.from(this.data.domains.values()),
      manifests: Array.from(this.data.manifests.values()),
      chunks: Array.from(this.data.chunks.values())
    };
  }

  async importData(data) {
    // Clear existing data
    this.data.domains.clear();
    this.data.manifests.clear();
    this.data.chunks.clear();
    
    // Import domains
    for (const domain of data.domains || []) {
      this.data.domains.set(domain.domain, domain);
    }
    
    // Import manifests
    for (const manifest of data.manifests || []) {
      this.data.manifests.set(manifest.manifest_id, manifest);
    }
    
    // Import chunks
    for (const chunk of data.chunks || []) {
      const key = `${chunk.manifest_id}:${chunk.chunk_index}`;
      this.data.chunks.set(key, chunk);
    }
    
    this.save();
    console.log('✅ Data import completed');
  }
}

module.exports = MemoryAdapter;