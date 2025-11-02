/**
 * Signaling Service for Desktop Node
 * Simplified WebSocket signaling for peer-to-peer connections
 */

const { WebSocketServer } = require('ws');
const express = require('express');
const cors = require('cors');

class SignalingService {
  constructor(options = {}) {
    this.port = options.port || 8787;
    this.peers = new Map(); // peerId -> websocket
    this.rooms = new Map(); // roomId -> Set of peerIds
    this.server = null;
    this.wss = null;
    
    this.setupHTTPServer();
  }

  setupHTTPServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'signaling',
        version: '1.0.0',
        peers: this.peers.size,
        rooms: this.rooms.size,
        timestamp: Date.now()
      });
    });

    // Service info
    app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'signaling',
        version: '1.0.0',
        type: 'desktop-node',
        peers: this.peers.size
      });
    });

    // Get peer list (REST endpoint for compatibility)
    app.get('/peers', (req, res) => {
      const peerList = Array.from(this.peers.keys()).map(peerId => ({
        peerId,
        connectedAt: new Date().toISOString()
      }));
      res.json({ peers: peerList });
    });

    this.httpApp = app;
  }

  async start() {
    return new Promise((resolve, reject) => {
      // Start HTTP server
      this.server = this.httpApp.listen(this.port, (error) => {
        if (error) {
          reject(error);
          return;
        }

        // Start WebSocket server on the same port
        this.wss = new WebSocketServer({ 
          server: this.server,
          path: '/' // Accept WebSocket connections on root path
        });

        this.setupWebSocketHandlers();
        
        console.log(`✅ Signaling service running on port ${this.port}`);
        console.log(`   HTTP: http://localhost:${this.port}`);
        console.log(`   WebSocket: ws://localhost:${this.port}`);
        resolve();
      });
    });
  }

  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection from:', req.socket.remoteAddress);
      
      let peerId = null;
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('Invalid message format:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'Invalid message format' 
          }));
        }
      });

      ws.on('close', () => {
        if (peerId) {
          console.log(`Peer disconnected: ${peerId}`);
          this.peers.delete(peerId);
          this.broadcastPeerLeft(peerId);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Store reference for cleanup
      ws.peerId = peerId;
    });
  }

  handleMessage(ws, message) {
    const { type, peerId } = message;

    switch (type) {
      case 'register':
        this.handleRegister(ws, message);
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.handleWebRTCMessage(ws, message);
        break;
        
      case 'peer-list-request':
        this.handlePeerListRequest(ws);
        break;
        
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
        
      default:
        console.warn('Unknown message type:', type);
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: `Unknown message type: ${type}` 
        }));
    }
  }

  handleRegister(ws, message) {
    const { peerId, capabilities = [] } = message;
    
    if (!peerId) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'peerId is required' 
      }));
      return;
    }

    // Register peer
    this.peers.set(peerId, ws);
    ws.peerId = peerId;
    
    console.log(`Peer registered: ${peerId}`);
    
    // Send registration confirmation
    ws.send(JSON.stringify({
      type: 'registered',
      peerId,
      capabilities,
      peers: this.getPeerList(peerId) // Exclude self
    }));

    // Broadcast new peer to others
    this.broadcastPeerJoined(peerId);
  }

  handleWebRTCMessage(ws, message) {
    const { targetPeerId, type, sdp, candidate } = message;
    
    if (!targetPeerId) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'targetPeerId is required' 
      }));
      return;
    }

    const targetWs = this.peers.get(targetPeerId);
    if (!targetWs) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Target peer not found' 
      }));
      return;
    }

    // Forward message to target peer
    const forwardedMessage = {
      type,
      fromPeerId: ws.peerId,
      sdp,
      candidate
    };

    targetWs.send(JSON.stringify(forwardedMessage));
    
    console.log(`Forwarded ${type} from ${ws.peerId} to ${targetPeerId}`);
  }

  handlePeerListRequest(ws) {
    const peerList = this.getPeerList(ws.peerId);
    ws.send(JSON.stringify({
      type: 'peer-list',
      peers: peerList
    }));
  }

  getPeerList(excludePeerId = null) {
    const peers = [];
    for (const [peerId, ws] of this.peers) {
      if (peerId !== excludePeerId) {
        peers.push({
          peerId,
          capabilities: ws.capabilities || [],
          connectedAt: new Date().toISOString()
        });
      }
    }
    return peers;
  }

  broadcastPeerJoined(newPeerId) {
    const message = JSON.stringify({
      type: 'peer-joined',
      peerId: newPeerId
    });

    for (const [peerId, ws] of this.peers) {
      if (peerId !== newPeerId) {
        try {
          ws.send(message);
        } catch (error) {
          console.error(`Failed to notify ${peerId} about new peer:`, error);
        }
      }
    }
  }

  broadcastPeerLeft(leftPeerId) {
    const message = JSON.stringify({
      type: 'peer-left',
      peerId: leftPeerId
    });

    for (const [peerId, ws] of this.peers) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`Failed to notify ${peerId} about peer leaving:`, error);
      }
    }
  }

  async stop() {
    if (this.wss) {
      this.wss.close();
    }
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ Signaling service stopped');
          resolve();
        });
      });
    }
  }

  // Statistics for monitoring
  getStats() {
    return {
      peers: this.peers.size,
      rooms: this.rooms.size,
      uptime: process.uptime()
    };
  }
}

// Standalone execution
if (require.main === module) {
  const service = new SignalingService();
  
  service.start().then(() => {
    console.log('Signaling service started in standalone mode');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down signaling service...');
      await service.stop();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to start signaling service:', error);
    process.exit(1);
  });
}

module.exports = SignalingService;
