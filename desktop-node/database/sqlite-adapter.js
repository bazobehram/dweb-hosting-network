/**
 * SQLite Database Adapter for Desktop Node
 * Replaces PostgreSQL from VPS services with portable SQLite
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SQLiteAdapter {
  constructor(dbPath = null) {
    // Default to user data directory
    this.dbPath = dbPath || path.join(process.env.APPDATA || process.env.HOME, 'DWebNode', 'registry.db');
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance
    this.db.pragma('foreign_keys = ON');
    
    this.initTables();
  }

  initTables() {
    // Domains table (same schema as PostgreSQL)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        owner TEXT NOT NULL,
        manifest_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Manifests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manifests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manifest_id TEXT UNIQUE NOT NULL,
        transfer_id TEXT,
        file_name TEXT,
        file_size INTEGER,
        mime_type TEXT,
        chunk_size INTEGER,
        chunk_count INTEGER,
        sha256 TEXT,
        chunk_hashes TEXT, -- JSON array
        replicas TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chunks table (pointers only, no data)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manifest_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_data TEXT, -- Always NULL (no data storage)
        pointer TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(manifest_id, chunk_index)
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
      CREATE INDEX IF NOT EXISTS idx_manifests_manifest_id ON manifests(manifest_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_manifest_id ON chunks(manifest_id);
    `);

    console.log('✅ SQLite tables initialized');
  }

  // Domain operations (compatible with VPS API)
  
  async getAllDomains() {
    const stmt = this.db.prepare('SELECT * FROM domains ORDER BY created_at DESC');
    return stmt.all();
  }

  async getDomain(domain) {
    const stmt = this.db.prepare('SELECT * FROM domains WHERE domain = ?');
    return stmt.get(domain);
  }

  async createDomain(domainData) {
    const { domain, owner, manifestId } = domainData;
    const stmt = this.db.prepare(`
      INSERT INTO domains (domain, owner, manifest_id)
      VALUES (?, ?, ?)
    `);
    
    try {
      const result = stmt.run(domain, owner, manifestId);
      return { id: result.lastInsertRowid, domain, owner, manifestId };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Domain already exists');
      }
      throw error;
    }
  }

  async updateDomain(domain, updates) {
    const { manifestId } = updates;
    const stmt = this.db.prepare(`
      UPDATE domains 
      SET manifest_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE domain = ?
    `);
    
    const result = stmt.run(manifestId, domain);
    if (result.changes === 0) {
      throw new Error('Domain not found');
    }
    
    return this.getDomain(domain);
  }

  async deleteDomain(domain) {
    const stmt = this.db.prepare('DELETE FROM domains WHERE domain = ?');
    const result = stmt.run(domain);
    return result.changes > 0;
  }

  // Manifest operations

  async getManifest(manifestId) {
    const stmt = this.db.prepare('SELECT * FROM manifests WHERE manifest_id = ?');
    const manifest = stmt.get(manifestId);
    
    if (manifest) {
      // Parse JSON fields
      manifest.chunk_hashes = JSON.parse(manifest.chunk_hashes || '[]');
      manifest.replicas = JSON.parse(manifest.replicas || '[]');
    }
    
    return manifest;
  }

  async createManifest(manifestData) {
    const {
      manifestId, transferId, fileName, fileSize, mimeType,
      chunkSize, chunkCount, sha256, chunkHashes, replicas
    } = manifestData;

    const stmt = this.db.prepare(`
      INSERT INTO manifests (
        manifest_id, transfer_id, file_name, file_size, mime_type,
        chunk_size, chunk_count, sha256, chunk_hashes, replicas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        manifestId, transferId, fileName, fileSize, mimeType,
        chunkSize, chunkCount, sha256,
        JSON.stringify(chunkHashes || []),
        JSON.stringify(replicas || [])
      );
      
      return { id: result.lastInsertRowid, ...manifestData };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Manifest already exists');
      }
      throw error;
    }
  }

  // Chunk operations (pointers only, no data)

  async getChunk(manifestId, chunkIndex) {
    const stmt = this.db.prepare(`
      SELECT * FROM chunks 
      WHERE manifest_id = ? AND chunk_index = ?
    `);
    return stmt.get(manifestId, chunkIndex);
  }

  async createChunkPointer(manifestId, chunkIndex, pointer, expiresAt = null) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (manifest_id, chunk_index, chunk_data, pointer, expires_at)
      VALUES (?, ?, NULL, ?, ?)
    `);
    
    const result = stmt.run(manifestId, chunkIndex, pointer, expiresAt);
    return { manifestId, chunkIndex, pointer, expiresAt };
  }

  async getChunkPointers(manifestId) {
    const stmt = this.db.prepare(`
      SELECT chunk_index, pointer, expires_at 
      FROM chunks 
      WHERE manifest_id = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY chunk_index
    `);
    return stmt.all(manifestId);
  }

  // Health check
  async healthCheck() {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM domains');
      const result = stmt.get();
      return {
        status: 'healthy',
        database: 'sqlite',
        domains: result.count,
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
    const stmt = this.db.prepare(`
      DELETE FROM chunks 
      WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
    `);
    const result = stmt.run();
    console.log(`Cleaned up ${result.changes} expired chunk pointers`);
    return result.changes;
  }

  // Close database
  close() {
    this.db.close();
  }

  // Export/import for migration
  async exportData() {
    const domains = this.getAllDomains();
    const manifests = this.db.prepare('SELECT * FROM manifests').all();
    const chunks = this.db.prepare('SELECT * FROM chunks').all();
    
    return { domains, manifests, chunks };
  }

  async importData(data) {
    const transaction = this.db.transaction((data) => {
      // Clear existing data
      this.db.exec('DELETE FROM chunks');
      this.db.exec('DELETE FROM manifests');  
      this.db.exec('DELETE FROM domains');
      
      // Import domains
      const insertDomain = this.db.prepare(`
        INSERT INTO domains (domain, owner, manifest_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const domain of data.domains) {
        insertDomain.run(
          domain.domain, domain.owner, domain.manifest_id,
          domain.created_at, domain.updated_at
        );
      }
      
      // Import manifests
      const insertManifest = this.db.prepare(`
        INSERT INTO manifests (
          manifest_id, transfer_id, file_name, file_size, mime_type,
          chunk_size, chunk_count, sha256, chunk_hashes, replicas,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const manifest of data.manifests) {
        insertManifest.run(
          manifest.manifest_id, manifest.transfer_id, manifest.file_name,
          manifest.file_size, manifest.mime_type, manifest.chunk_size,
          manifest.chunk_count, manifest.sha256, manifest.chunk_hashes,
          manifest.replicas, manifest.created_at, manifest.updated_at
        );
      }
      
      // Import chunks
      const insertChunk = this.db.prepare(`
        INSERT INTO chunks (manifest_id, chunk_index, chunk_data, pointer, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const chunk of data.chunks) {
        insertChunk.run(
          chunk.manifest_id, chunk.chunk_index, chunk.chunk_data,
          chunk.pointer, chunk.expires_at, chunk.created_at
        );
      }
    });
    
    transaction(data);
    console.log('✅ Data import completed');
  }
}

module.exports = SQLiteAdapter;