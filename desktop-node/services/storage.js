/**
 * Storage Service for Desktop Node
 * Local file-based chunk storage (fallback only)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StorageService {
  constructor(options = {}) {
    this.port = options.port || 8789;
    this.storageDir = options.storageDir || path.join(
      process.env.APPDATA || process.env.HOME, 'DWebNode', 'chunks'
    );
    this.app = express();
    this.server = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.ensureStorageDir();
  }

  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log(`✅ Storage directory: ${this.storageDir}`);
    } catch (error) {
      console.error('Failed to create storage directory:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const stats = await this.getStorageStats();
        res.json({
          status: 'healthy',
          service: 'storage',
          version: '1.0.0',
          timestamp: Date.now(),
          storage: stats
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // Service info
    this.app.get('/', async (req, res) => {
      res.json({
        status: 'ok',
        service: 'storage',
        version: '1.0.0',
        type: 'desktop-node'
      });
    });

    // Store chunk (fallback storage)
    this.app.post('/chunks', async (req, res) => {
      try {
        const { manifestId, chunkIndex, data } = req.body;
        
        if (!manifestId || chunkIndex === undefined || !data) {
          return res.status(400).json({ 
            error: 'manifestId, chunkIndex, and data are required' 
          });
        }

        const chunkPath = this.getChunkPath(manifestId, chunkIndex);
        
        // Create directory if needed
        await fs.mkdir(path.dirname(chunkPath), { recursive: true });
        
        // Decode base64 data and store
        const buffer = Buffer.from(data, 'base64');
        await fs.writeFile(chunkPath, buffer);
        
        // Calculate hash for verification
        const hash = crypto.createHash('sha256').update(buffer).digest('base64url');
        
        console.log(`Stored chunk: ${manifestId}/${chunkIndex} (${buffer.length} bytes)`);
        
        res.status(201).json({
          manifestId,
          chunkIndex,
          size: buffer.length,
          hash,
          stored: true
        });
        
      } catch (error) {
        console.error('Error storing chunk:', error);
        res.status(500).json({ error: 'Failed to store chunk' });
      }
    });

    // Retrieve chunk
    this.app.get('/chunks/:manifestId/:chunkIndex', async (req, res) => {
      try {
        const { manifestId, chunkIndex } = req.params;
        const chunkPath = this.getChunkPath(manifestId, chunkIndex);
        
        try {
          const buffer = await fs.readFile(chunkPath);
          const hash = crypto.createHash('sha256').update(buffer).digest('base64url');
          
          res.json({
            manifestId,
            chunkIndex: parseInt(chunkIndex, 10),
            data: buffer.toString('base64'),
            size: buffer.length,
            hash
          });
          
        } catch (fileError) {
          if (fileError.code === 'ENOENT') {
            return res.status(404).json({ error: 'CHUNK_NOT_FOUND' });
          }
          throw fileError;
        }
        
      } catch (error) {
        console.error('Error retrieving chunk:', error);
        res.status(500).json({ error: 'Failed to retrieve chunk' });
      }
    });

    // Check if chunk exists
    this.app.head('/chunks/:manifestId/:chunkIndex', async (req, res) => {
      try {
        const { manifestId, chunkIndex } = req.params;
        const chunkPath = this.getChunkPath(manifestId, chunkIndex);
        
        try {
          const stats = await fs.stat(chunkPath);
          res.set('Content-Length', stats.size.toString());
          res.status(200).end();
        } catch (fileError) {
          if (fileError.code === 'ENOENT') {
            return res.status(404).end();
          }
          throw fileError;
        }
        
      } catch (error) {
        console.error('Error checking chunk:', error);
        res.status(500).end();
      }
    });

    // Delete chunk
    this.app.delete('/chunks/:manifestId/:chunkIndex', async (req, res) => {
      try {
        const { manifestId, chunkIndex } = req.params;
        const chunkPath = this.getChunkPath(manifestId, chunkIndex);
        
        try {
          await fs.unlink(chunkPath);
          res.json({ success: true, deleted: true });
        } catch (fileError) {
          if (fileError.code === 'ENOENT') {
            return res.status(404).json({ error: 'CHUNK_NOT_FOUND' });
          }
          throw fileError;
        }
        
      } catch (error) {
        console.error('Error deleting chunk:', error);
        res.status(500).json({ error: 'Failed to delete chunk' });
      }
    });

    // List chunks for a manifest
    this.app.get('/chunks/:manifestId', async (req, res) => {
      try {
        const { manifestId } = req.params;
        const manifestDir = path.join(this.storageDir, manifestId);
        
        try {
          const files = await fs.readdir(manifestDir);
          const chunks = files
            .filter(file => file.endsWith('.chunk'))
            .map(file => {
              const chunkIndex = parseInt(file.replace('.chunk', ''), 10);
              return { manifestId, chunkIndex };
            })
            .sort((a, b) => a.chunkIndex - b.chunkIndex);
          
          res.json({ chunks, count: chunks.length });
          
        } catch (dirError) {
          if (dirError.code === 'ENOENT') {
            return res.json({ chunks: [], count: 0 });
          }
          throw dirError;
        }
        
      } catch (error) {
        console.error('Error listing chunks:', error);
        res.status(500).json({ error: 'Failed to list chunks' });
      }
    });

    // Storage statistics
    this.app.get('/stats', async (req, res) => {
      try {
        const stats = await this.getStorageStats();
        res.json(stats);
      } catch (error) {
        console.error('Error getting storage stats:', error);
        res.status(500).json({ error: 'Failed to get storage stats' });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('Storage service error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  getChunkPath(manifestId, chunkIndex) {
    // Sanitize inputs
    const safeManifestId = manifestId.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeChunkIndex = parseInt(chunkIndex, 10);
    
    return path.join(this.storageDir, safeManifestId, `${safeChunkIndex}.chunk`);
  }

  async getStorageStats() {
    try {
      const manifestDirs = await fs.readdir(this.storageDir);
      let totalChunks = 0;
      let totalSize = 0;
      let manifests = 0;

      for (const manifestDir of manifestDirs) {
        const manifestPath = path.join(this.storageDir, manifestDir);
        
        try {
          const stat = await fs.stat(manifestPath);
          if (stat.isDirectory()) {
            manifests++;
            const chunkFiles = await fs.readdir(manifestPath);
            
            for (const chunkFile of chunkFiles) {
              if (chunkFile.endsWith('.chunk')) {
                totalChunks++;
                const chunkPath = path.join(manifestPath, chunkFile);
                const chunkStat = await fs.stat(chunkPath);
                totalSize += chunkStat.size;
              }
            }
          }
        } catch (statError) {
          // Skip invalid directories
          continue;
        }
      }

      return {
        manifests,
        chunks: totalChunks,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        storageDir: this.storageDir
      };
      
    } catch (error) {
      return {
        error: error.message,
        storageDir: this.storageDir
      };
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`✅ Storage service running on port ${this.port}`);
          console.log(`   Storage directory: ${this.storageDir}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ Storage service stopped');
          resolve();
        });
      });
    }
  }

  // Cleanup old chunks (optional)
  async cleanup(maxAgeHours = 24) {
    try {
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      const manifestDirs = await fs.readdir(this.storageDir);
      let deletedChunks = 0;

      for (const manifestDir of manifestDirs) {
        const manifestPath = path.join(this.storageDir, manifestDir);
        
        try {
          const chunkFiles = await fs.readdir(manifestPath);
          
          for (const chunkFile of chunkFiles) {
            if (chunkFile.endsWith('.chunk')) {
              const chunkPath = path.join(manifestPath, chunkFile);
              const stat = await fs.stat(chunkPath);
              
              if (stat.mtime.getTime() < cutoffTime) {
                await fs.unlink(chunkPath);
                deletedChunks++;
              }
            }
          }
          
          // Remove empty manifest directories
          const remainingFiles = await fs.readdir(manifestPath);
          if (remainingFiles.length === 0) {
            await fs.rmdir(manifestPath);
          }
          
        } catch (cleanupError) {
          console.error(`Cleanup error for ${manifestDir}:`, cleanupError);
        }
      }

      console.log(`Cleaned up ${deletedChunks} old chunks`);
      return deletedChunks;
      
    } catch (error) {
      console.error('Cleanup failed:', error);
      return 0;
    }
  }
}

// Standalone execution
if (require.main === module) {
  const service = new StorageService();
  
  service.start().then(() => {
    console.log('Storage service started in standalone mode');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down storage service...');
      await service.stop();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to start storage service:', error);
    process.exit(1);
  });
}

module.exports = StorageService;
