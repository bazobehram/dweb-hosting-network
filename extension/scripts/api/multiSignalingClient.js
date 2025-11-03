/**
 * Multi-Signaling Client with Desktop Node Detection and VPS Fallback
 * Tries desktop node signaling first, falls back to VPS if unavailable
 */

import { SignalingClient } from '../signalingClient.js';

const DESKTOP_NODE_SIGNALING = 'ws://localhost:8787';
const VPS_SIGNALING = 'ws://34.107.74.70:8787';

export class MultiSignalingClient extends EventTarget {
  constructor(options = {}) {
    super();
    
    this.peerId = options.peerId;
    this.authToken = options.authToken;
    this.capabilities = options.capabilities || [];
    this.metadata = options.metadata || {};
    this.preferDesktopNode = options.preferDesktopNode !== false; // Default true
    this.healthCheckTimeout = options.healthCheckTimeout || 2000;
    
    this.currentClient = null;
    this.desktopNodeAvailable = null;
    this.activeEndpoint = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
  }

  /**
   * Check if desktop node signaling is available
   */
  async checkDesktopNodeHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.healthCheckTimeout);
      
      // Check the REST endpoint first (faster than WebSocket handshake)
      const response = await fetch('http://localhost:8787/health', {
        signal: controller.signal,
        cache: 'no-cache'
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        return data.status === 'healthy' && data.service === 'signaling';
      }
      
      return false;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Connect to the signaling service with fallback
   */
  async connect() {
    if (this.currentClient && this.currentClient.socket?.readyState === WebSocket.OPEN) {
      return this.currentClient.registeredPeerId;
    }

    // Try desktop node first if preferred
    if (this.preferDesktopNode) {
      try {
        const desktopHealthy = await this.checkDesktopNodeHealth();
        if (desktopHealthy) {
          return await this.connectToEndpoint('desktop-node');
        }
      } catch (error) {
        console.warn('[MultiSignaling] Desktop node health check failed:', error.message);
      }
    }

    // Fallback to VPS
    return await this.connectToEndpoint('vps');
  }

  /**
   * Connect to a specific endpoint
   */
  async connectToEndpoint(endpointType) {
    const url = endpointType === 'desktop-node' ? DESKTOP_NODE_SIGNALING : VPS_SIGNALING;
    
    try {
      // Clean up existing client
      if (this.currentClient) {
        this.currentClient.disconnect();
      }

      // Create new client
      this.currentClient = new SignalingClient({
        url,
        peerId: this.peerId,
        authToken: this.authToken,
        capabilities: this.capabilities,
        metadata: this.metadata
      });

      // Forward events
      this.currentClient.addEventListener('registered', (event) => {
        this.activeEndpoint = endpointType;
        this.desktopNodeAvailable = endpointType === 'desktop-node';
        this.reconnectAttempts = 0;
        console.log(`[MultiSignaling] Connected to ${endpointType} signaling`);
        this.dispatchEvent(new CustomEvent('registered', { detail: event.detail }));
      });

      this.currentClient.addEventListener('message', (event) => {
        this.dispatchEvent(new CustomEvent('message', { detail: event.detail }));
      });

      this.currentClient.addEventListener('error', (event) => {
        console.warn(`[MultiSignaling] ${endpointType} error:`, event.detail);
        this.dispatchEvent(new CustomEvent('error', { detail: event.detail }));
      });

      this.currentClient.addEventListener('close', () => {
        console.log(`[MultiSignaling] ${endpointType} connection closed`);
        this.handleDisconnection();
        this.dispatchEvent(new CustomEvent('close'));
      });

      // Connect
      const peerId = await this.currentClient.connect();
      return peerId;
      
    } catch (error) {
      console.error(`[MultiSignaling] Failed to connect to ${endpointType}:`, error.message);
      
      // If desktop node fails and we haven't tried VPS yet, try VPS
      if (endpointType === 'desktop-node' && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.desktopNodeAvailable = false;
        return await this.connectToEndpoint('vps');
      }
      
      throw error;
    }
  }

  /**
   * Handle connection loss and attempt reconnection
   */
  async handleDisconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[MultiSignaling] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`[MultiSignaling] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('[MultiSignaling] Reconnection failed:', error.message);
        this.handleDisconnection();
      }
    }, delay);
  }

  /**
   * Send a message through the active connection
   */
  send(payload) {
    if (!this.currentClient) {
      throw new Error('Not connected to signaling service');
    }
    return this.currentClient.send(payload);
  }

  /**
   * Disconnect from signaling service
   */
  disconnect() {
    if (this.currentClient) {
      this.currentClient.disconnect();
      this.currentClient = null;
    }
    this.activeEndpoint = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      connected: this.currentClient?.socket?.readyState === WebSocket.OPEN,
      activeEndpoint: this.activeEndpoint,
      desktopNodeAvailable: this.desktopNodeAvailable,
      preferDesktopNode: this.preferDesktopNode,
      reconnectAttempts: this.reconnectAttempts,
      peerId: this.currentClient?.registeredPeerId || null
    };
  }

  /**
   * Set desktop node preference
   */
  setPreferDesktopNode(prefer) {
    this.preferDesktopNode = prefer;
  }

  /**
   * Get current endpoint URLs
   */
  getCurrentEndpoints() {
    if (this.activeEndpoint === 'desktop-node') {
      return {
        type: 'desktop-node',
        signaling: DESKTOP_NODE_SIGNALING
      };
    }
    return {
      type: 'vps',
      signaling: VPS_SIGNALING
    };
  }
}