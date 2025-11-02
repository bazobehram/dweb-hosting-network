/**
 * Registry Service for Desktop Node
 * Adapted from backend/registry-service with SQLite adapter
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const MemoryAdapter = require('../database/memory-adapter');
const http = require('http');

class RegistryService {
  constructor(options = {}) {
    this.port = options.port || 8788;
    this.db = new MemoryAdapter();
    this.app = express();
    this.server = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Security and performance middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupDomainResolver() {
    // Storage service configuration
    this.storageServiceUrl = 'http://localhost:8789';
    
    // Domain resolver endpoint - serves content for .dweb domains
    this.app.get('/resolve/:domain', async (req, res) => {
      try {
        const domainName = req.params.domain;
        
        // Look up domain in registry
        const domain = await this.db.getDomain(domainName);
        if (!domain) {
          return res.status(404).json({ 
            error: 'DOMAIN_NOT_FOUND',
            message: `Domain ${domainName} is not registered` 
          });
        }
        
        if (!domain.manifest_id) {
          return res.status(404).json({ 
            error: 'NO_CONTENT',
            message: `Domain ${domainName} has no content uploaded` 
          });
        }
        
        // Fetch content from storage service
        const content = await this.fetchContentFromStorage(domain.manifest_id, 0);
        if (!content) {
          return res.status(404).json({ 
            error: 'CONTENT_NOT_FOUND',
            message: `Content for ${domainName} not found in storage` 
          });
        }
        
        // Determine content type
        const contentType = this.getContentType(content);
        
        // Serve the content
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-DWeb-Domain', domainName);
        res.setHeader('X-DWeb-Manifest', domain.manifest_id);
        res.send(content);
        
      } catch (error) {
        console.error('Domain resolution error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // Alternative endpoint for direct domain serving
    this.app.get('/serve/:domain', async (req, res) => {
      // Redirect to resolve endpoint
      res.redirect(`/resolve/${req.params.domain}`);
    });
  }
  
  // Fetch content from storage service
  async fetchContentFromStorage(manifestId, chunkIndex = 0) {
    return new Promise((resolve, reject) => {
      const url = `${this.storageServiceUrl}/chunks/${manifestId}/${chunkIndex}`;
      
      http.get(url, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.data) {
              // Decode base64 content
              const content = Buffer.from(parsed.data, 'base64').toString('utf8');
              resolve(content);
            } else {
              resolve(null);
            }
          } catch (error) {
            console.error('Error parsing storage response:', error);
            resolve(null);
          }
        });
        
      }).on('error', (error) => {
        console.error('Storage fetch error:', error);
        resolve(null);
      });
    });
  }
  
  // Determine content type from content
  getContentType(content) {
    // Simple content type detection
    if (content.trim().startsWith('<!DOCTYPE html') || content.includes('<html')) {
      return 'text/html; charset=utf-8';
    }
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'application/json';
    }
    if (content.includes('<svg') || content.trim().startsWith('<svg')) {
      return 'image/svg+xml';
    }
    return 'text/plain; charset=utf-8';
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      const health = await this.db.healthCheck();
      res.json({
        status: 'healthy',
        service: 'registry',
        version: '1.0.0',
        timestamp: Date.now(),
        database: health
      });
    });

    // Service info
    this.app.get('/', async (req, res) => {
      res.json({
        status: 'ok',
        service: 'registry',
        version: '1.0.0',
        type: 'desktop-node'
      });
    });

    // Domain endpoints (compatible with VPS API)
    
    // List all domains
    this.app.get('/domains', async (req, res) => {
      try {
        const domains = await this.db.getAllDomains();
        res.json({ domains });
      } catch (error) {
        console.error('Error listing domains:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get specific domain
    this.app.get('/domains/:domain', async (req, res) => {
      try {
        const domain = await this.db.getDomain(req.params.domain);
        if (!domain) {
          return res.status(404).json({ error: 'DOMAIN_NOT_FOUND' });
        }
        
        // PRODUCTION FIX: Get replicas from manifest if available
        let replicas = [];
        console.log(`[Domain API] Fetching domain: ${req.params.domain}`);
        console.log(`[Domain API] Domain object:`, JSON.stringify(domain, null, 2));
        console.log(`[Domain API] Manifest ID: ${domain.manifest_id}`);
        
        if (domain.manifest_id) {
          try {
            console.log(`[Domain API] Fetching manifest: ${domain.manifest_id}`);
            const manifest = await this.db.getManifest(domain.manifest_id);
            console.log(`[Domain API] Manifest:`, JSON.stringify(manifest, null, 2));
            
            if (manifest && manifest.replicas) {
              replicas = manifest.replicas;
              console.log(`[Domain API] Found ${replicas.length} replicas:`, replicas);
            } else {
              console.log(`[Domain API] Manifest has no replicas`);
            }
          } catch (error) {
            console.warn('Could not fetch manifest replicas:', error);
          }
        } else {
          console.log(`[Domain API] No manifest_id on domain`);
        }
        
        // Format response to match VPS API with replicas
        res.json({
          domain: domain.domain,
          owner: domain.owner,
          manifestId: domain.manifest_id,
          replicas: replicas, // CRITICAL: Include replicas for P2P resolution
          createdAt: domain.created_at,
          updatedAt: domain.updated_at
        });
      } catch (error) {
        console.error('Error getting domain:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Register new domain
    this.app.post('/domains', async (req, res) => {
      try {
        const { domain, owner, manifestId } = req.body;
        
        if (!domain || !owner) {
          return res.status(400).json({ error: 'Domain and owner are required' });
        }

        // Validate domain format
        if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain) && !/^[a-z0-9]$/.test(domain)) {
          return res.status(400).json({ error: 'Invalid domain format' });
        }

        const result = await this.db.createDomain({ domain, owner, manifestId });
        
        res.status(201).json({
          domain: result.domain,
          owner: result.owner,
          manifestId: result.manifestId,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        if (error.message === 'Domain already exists') {
          return res.status(409).json({ error: 'DOMAIN_ALREADY_EXISTS' });
        }
        console.error('Error creating domain:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update domain binding
    this.app.patch('/domains/:domain', async (req, res) => {
      try {
        const { manifestId } = req.body;
        const result = await this.db.updateDomain(req.params.domain, { manifestId });
        
        res.json({
          domain: result.domain,
          owner: result.owner,
          manifestId: result.manifest_id,
          updatedAt: result.updated_at
        });
      } catch (error) {
        if (error.message === 'Domain not found') {
          return res.status(404).json({ error: 'DOMAIN_NOT_FOUND' });
        }
        console.error('Error updating domain:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Delete domain
    this.app.delete('/domains/:domain', async (req, res) => {
      try {
        const deleted = await this.db.deleteDomain(req.params.domain);
        if (!deleted) {
          return res.status(404).json({ error: 'DOMAIN_NOT_FOUND' });
        }
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting domain:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Manifest endpoints (compatible with VPS API)

    // Register manifest
    this.app.post('/manifests', async (req, res) => {
      try {
        const manifest = req.body;
        
        // Validate required fields
        if (!manifest.transferId || !manifest.fileName) {
          return res.status(400).json({ error: 'transferId and fileName are required' });
        }

        // Enforce no chunk data storage (privacy-first)
        if (Array.isArray(manifest.chunkData)) {
          manifest.chunkData = manifest.chunkData.map(() => null);
        }

        const result = await this.db.createManifest({
          manifestId: manifest.transferId,
          transferId: manifest.transferId,
          fileName: manifest.fileName,
          fileSize: manifest.fileSize,
          mimeType: manifest.mimeType,
          chunkSize: manifest.chunkSize,
          chunkCount: manifest.chunkCount,
          sha256: manifest.sha256,
          chunkHashes: manifest.chunkHashes,
          replicas: manifest.replicas
        });

        res.status(201).json({
          manifestId: result.manifestId,
          transferId: result.transferId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        if (error.message === 'Manifest already exists') {
          return res.status(409).json({ error: 'MANIFEST_ALREADY_EXISTS' });
        }
        console.error('Error creating manifest:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get manifest
    this.app.get('/manifests/:manifestId', async (req, res) => {
      try {
        const manifest = await this.db.getManifest(req.params.manifestId);
        if (!manifest) {
          return res.status(404).json({ error: 'MANIFEST_NOT_FOUND' });
        }

        res.json({
          manifestId: manifest.manifest_id,
          transferId: manifest.transfer_id,
          fileName: manifest.file_name,
          fileSize: manifest.file_size,
          mimeType: manifest.mime_type,
          chunkSize: manifest.chunk_size,
          chunkCount: manifest.chunk_count,
          sha256: manifest.sha256,
          chunkHashes: manifest.chunk_hashes,
          replicas: manifest.replicas,
          createdAt: manifest.created_at
        });
      } catch (error) {
        console.error('Error getting manifest:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get chunk info (no data, just pointers)
    this.app.get('/manifests/:manifestId/chunks/:index', async (req, res) => {
      try {
        const { manifestId, index } = req.params;
        const chunkIndex = parseInt(index, 10);
        
        if (isNaN(chunkIndex)) {
          return res.status(400).json({ error: 'Invalid chunk index' });
        }

        const chunk = await this.db.getChunk(manifestId, chunkIndex);
        if (!chunk) {
          return res.status(404).json({ error: 'CHUNK_NOT_FOUND' });
        }

        res.json({
          manifestId,
          chunkIndex,
          data: null, // Never return chunk data
          pointer: chunk.pointer,
          expiresAt: chunk.expires_at,
          replicas: [] // TODO: Get from manifest
        });
      } catch (error) {
        console.error('Error getting chunk:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Store chunk pointer (no data)
    this.app.patch('/manifests/:manifestId/chunks/:index', async (req, res) => {
      try {
        const { manifestId, index } = req.params;
        const chunkIndex = parseInt(index, 10);
        const { pointer, expiresAt } = req.body;
        
        if (isNaN(chunkIndex)) {
          return res.status(400).json({ error: 'Invalid chunk index' });
        }

        await this.db.createChunkPointer(manifestId, chunkIndex, pointer, expiresAt);
        
        res.json({
          manifestId,
          chunkIndex,
          pointer,
          expiresAt,
          success: true
        });
      } catch (error) {
        console.error('Error updating chunk pointer:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Domain resolver and content serving
    this.setupDomainResolver();

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('Registry service error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`✅ Registry service running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.db.close();
          console.log('✅ Registry service stopped');
          resolve();
        });
      });
    }
  }

  // Cleanup expired pointers periodically
  startCleanupJob() {
    const interval = setInterval(async () => {
      try {
        await this.db.cleanupExpiredPointers();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Return cleanup function
    return () => clearInterval(interval);
  }
}

// Standalone execution
if (require.main === module) {
  const service = new RegistryService();
  
  service.start().then(() => {
    console.log('Registry service started in standalone mode');
    
    // Start cleanup job
    const cleanup = service.startCleanupJob();
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down registry service...');
      cleanup();
      await service.stop();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to start registry service:', error);
    process.exit(1);
  });
}

module.exports = RegistryService;
