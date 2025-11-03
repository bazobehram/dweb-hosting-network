/**
 * Desktop Node Main Process
 * Manages all services and provides desktop UI
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const RegistryService = require('../services/registry');
const SignalingService = require('../services/signaling');
const StorageService = require('../services/storage');

class DesktopNodeManager {
  constructor() {
    this.services = {};
    this.mainWindow = null;
    this.tray = null;
    this.isQuiting = false;
    this.lastNotification = null;
    
    this.config = {
      registry: { port: 8788 },
      signaling: { port: 8787 },
      storage: { port: 8789 }
    };
    
    // Enable auto-start functionality
    this.setupAutoStart();
    
    // Initialize auto-updater
    this.setupAutoUpdater();
  }

  async init() {
    console.log('🚀 Initializing DWeb Desktop Node...');
    
    // Initialize services
    await this.startServices();
    
    // Create Electron app
    await this.createApp();
    
    // Setup IPC handlers
    this.setupIPC();
    
    console.log('✅ Desktop Node initialized successfully');
    
    // Show startup notification
    this.showNotification(
      '🚀 DWeb Desktop Node Started',
      'All services are running and ready to contribute to the distributed web!',
      { silent: true }
    );
  }

  async startServices() {
    console.log('Starting services...');
    
    try {
      // Start Registry Service
      console.log('Starting Registry service...');
      this.services.registry = new RegistryService(this.config.registry);
      await this.services.registry.start();
      
      // Start Signaling Service
      console.log('Starting Signaling service...');
      this.services.signaling = new SignalingService(this.config.signaling);
      await this.services.signaling.start();
      
      // Start Storage Service
      console.log('Starting Storage service...');
      this.services.storage = new StorageService(this.config.storage);
      await this.services.storage.start();
      
      console.log('✅ All services started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start services:', error);
      
      // Show error dialog
      dialog.showErrorBox(
        'Service Startup Error',
        `Failed to start DWeb services: ${error.message}`
      );
      
      app.quit();
    }
  }

  async stopServices() {
    console.log('Stopping services...');
    
    for (const [name, service] of Object.entries(this.services)) {
      try {
        if (service && typeof service.stop === 'function') {
          await service.stop();
          console.log(`✅ ${name} service stopped`);
        }
      } catch (error) {
        console.error(`❌ Error stopping ${name} service:`, error);
      }
    }
    
    console.log('✅ All services stopped');
  }

  async createApp() {
    // Wait for Electron to be ready
    await app.whenReady();
    
    // Create main window (hidden by default)
    this.createMainWindow();
    
    // Create system tray
    this.createTray();
    
    // Handle app events
    this.setupAppEvents();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false, // Start hidden
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      icon: path.join(__dirname, '..', 'assets', 'icon.png')
    });

    // Load the UI
    this.mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

    // Handle window events
    this.mainWindow.on('close', (event) => {
      if (!this.isQuiting) {
        event.preventDefault();
        this.mainWindow.hide();
        return false;
      }
    });

    this.mainWindow.on('minimize', (event) => {
      event.preventDefault();
      this.mainWindow.hide();
    });

    // Development mode
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
      this.mainWindow.show();
    }
  }

  createTray() {
    const trayIcon = path.join(__dirname, '..', 'assets', 'tray.png');
    
    try {
      this.tray = new Tray(trayIcon);
      
      this.tray.setToolTip('DWeb Desktop Node - Running');
      
      this.tray.on('double-click', () => {
        this.toggleMainWindow();
      });
      
      // Update menu after tray is fully initialized
      setTimeout(() => this.updateTrayMenu(), 100);
      
    } catch (error) {
      console.error('Failed to create tray:', error);
      // Continue without tray if it fails
    }
  }

  updateTrayMenu() {
    if (!this.tray || this.tray.isDestroyed()) {
      console.warn('Tray not available for menu update');
      return;
    }
    
    const stats = this.getServiceStats();
    
    const template = [
      {
        label: '🟢 DWeb Node - Running',
        enabled: false
      },
      { type: 'separator' },
      {
        label: `Registry: Port ${this.config.registry.port}`,
        enabled: false
      },
      {
        label: `Signaling: Port ${this.config.signaling.port}`,
        enabled: false
      },
      {
        label: `Storage: Port ${this.config.storage.port}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: `📊 Stats: ${stats.domains} domains, ${stats.peers} peers`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => this.toggleMainWindow()
      },
      {
        label: 'Open Logs',
        click: () => this.openLogs()
      },
      { type: 'separator' },
      {
        label: 'Auto-start on Boot',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => this.setAutoStart(menuItem.checked)
      },
      {
        label: 'Settings',
        click: () => this.openSettings()
      },
      {
        label: 'Check for Updates',
        click: () => this.checkForUpdates()
      },
      {
        label: 'About',
        click: () => this.showAbout()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.quit()
      }
    ];

    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setContextMenu(Menu.buildFromTemplate(template));
    }
  }

  setupAppEvents() {
    app.on('window-all-closed', () => {
      // Don't quit on window close (run in background)
      if (process.platform !== 'darwin') {
        // Keep running
      }
    });

    app.on('activate', () => {
      if (this.mainWindow === null) {
        this.createMainWindow();
      } else {
        this.mainWindow.show();
      }
    });

    app.on('before-quit', () => {
      this.isQuiting = true;
    });

    app.on('will-quit', async (event) => {
      if (!this.isQuiting) return;
      
      event.preventDefault();
      await this.stopServices();
      app.exit(0);
    });
  }

  setupIPC() {
    // Get service status
    ipcMain.handle('get-service-status', async () => {
      return this.getServiceStats();
    });

    // Get service health
    ipcMain.handle('get-service-health', async () => {
      const health = {};
      
      for (const [name, service] of Object.entries(this.services)) {
        try {
          if (service && typeof service.healthCheck === 'function') {
            health[name] = await service.healthCheck();
          } else if (service) {
            health[name] = { status: 'running' };
          }
        } catch (error) {
          health[name] = { status: 'error', error: error.message };
        }
      }
      
      return health;
    });

    // Restart services
    ipcMain.handle('restart-services', async () => {
      try {
        console.log('Restart services requested...');
        
        // Set a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Restart timeout after 30 seconds')), 30000)
        );
        
        const restartPromise = (async () => {
          console.log('Stopping services...');
          await this.stopServices();
          
          // Small delay to ensure clean shutdown
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log('Starting services...');
          await this.startServices();
        })();
        
        await Promise.race([restartPromise, timeoutPromise]);
        
        console.log('✅ Services restarted successfully');
        return { success: true };
      } catch (error) {
        console.error('❌ Restart failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Open external URLs
    ipcMain.handle('open-external', async (event, url) => {
      const { shell } = require('electron');
      await shell.openExternal(url);
    });
    
    // Auto-start controls
    ipcMain.handle('get-auto-start', async () => {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    });
    
    ipcMain.handle('set-auto-start', async (event, enabled) => {
      return this.setAutoStart(enabled);
    });
    
    // Notification controls
    ipcMain.handle('show-notification', async (event, title, body, options) => {
      return this.showNotification(title, body, options);
    });
    
    // Get app info
    ipcMain.handle('get-app-info', async () => {
      return {
        version: app.getVersion(),
        name: app.getName(),
        autoStart: app.getLoginItemSettings().openAtLogin,
        uptime: Math.floor(process.uptime()),
        platform: process.platform
      };
    });
    
    // Auto-updater controls
    ipcMain.handle('check-for-updates', async () => {
      this.checkForUpdates();
    });
    
    ipcMain.handle('restart-and-update', async () => {
      this.restartAndUpdate();
    });
  }

  getServiceStats() {
    const stats = {
      domains: 0,
      peers: 0,
      chunks: 0,
      uptime: Math.floor(process.uptime())
    };

    try {
      // Get registry stats
      if (this.services.registry && this.services.registry.db) {
        // Sync call for quick stats
        stats.domains = this.services.registry.db.getAllDomains().length;
      }

      // Get signaling stats
      if (this.services.signaling) {
        stats.peers = this.services.signaling.peers?.size || 0;
      }

      // Get storage stats (async, but we'll return last known)
      if (this.services.storage) {
        this.services.storage.getStorageStats().then(storageStats => {
          stats.chunks = storageStats.chunks || 0;
        }).catch(() => {
          // Ignore errors for stats
        });
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }

    return stats;
  }

  toggleMainWindow() {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  openLogs() {
    const { shell } = require('electron');
    const logPath = path.join(app.getPath('userData'), 'logs');
    shell.openPath(logPath);
  }

  openSettings() {
    // Create a new settings window
    const settingsWindow = new BrowserWindow({
      width: 900,
      height: 700,
      parent: this.mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      icon: path.join(__dirname, '..', 'assets', 'icon.png')
    });
    
    settingsWindow.loadFile(path.join(__dirname, '..', 'ui', 'settings.html'));
    
    // Remove menu bar
    settingsWindow.setMenuBarVisibility(false);
  }

  showAbout() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'About DWeb Desktop Node',
      message: 'DWeb Desktop Node v1.0.0',
      detail: 'A distributed web hosting node that helps power the DWeb network.\n\nServices:\n• Registry (Port 8788)\n• Signaling (Port 8787)\n• Storage (Port 8789)',
      buttons: ['OK']
    });
  }

  async quit() {
    this.isQuiting = true;
    await this.stopServices();
    app.quit();
  }

  // Auto-start functionality
  setupAutoStart() {
    // Set up auto-start (can be toggled by user)
    const autoStartEnabled = app.getLoginItemSettings().openAtLogin;
    
    if (!autoStartEnabled && process.env.NODE_ENV !== 'development') {
      // Enable auto-start by default for production builds
      this.setAutoStart(true);
    }
  }
  
  setAutoStart(enabled) {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: ['--hidden'] // Start minimized to tray
      });
      
      console.log(`Auto-start ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      console.error('Failed to set auto-start:', error);
      return false;
    }
  }
  
  // Notification system
  showNotification(title, body, options = {}) {
    // Don't spam notifications
    if (this.lastNotification && Date.now() - this.lastNotification < 5000) {
      return;
    }
    
    if (!Notification.isSupported()) {
      console.log(`Notification: ${title} - ${body}`);
      return;
    }
    
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      silent: options.silent || false,
      ...options
    });
    
    notification.show();
    this.lastNotification = Date.now();
    
    // Auto-close after 5 seconds if not clicked
    setTimeout(() => {
      if (notification) {
        notification.close();
      }
    }, 5000);
    
    return notification;
  }
  
  // Enhanced service monitoring with notifications
  monitorServices() {
    // Check service health periodically
    setInterval(async () => {
      try {
        const health = await this.getServiceHealth();
        const unhealthyServices = [];
        
        for (const [name, status] of Object.entries(health)) {
          if (status.status !== 'healthy' && status.status !== 'running') {
            unhealthyServices.push(name);
          }
        }
        
        if (unhealthyServices.length > 0) {
          this.showNotification(
            '⚠️ Service Issues Detected',
            `Services with issues: ${unhealthyServices.join(', ')}`,
            { urgency: 'critical' }
          );
        }
      } catch (error) {
        console.error('Service monitoring error:', error);
      }
    }, 60000); // Check every minute
  }
  
  async getServiceHealth() {
    const health = {};
    
    for (const [name, service] of Object.entries(this.services)) {
      try {
        if (service && typeof service.healthCheck === 'function') {
          health[name] = await service.healthCheck();
        } else if (service) {
          health[name] = { status: 'running' };
        } else {
          health[name] = { status: 'stopped' };
        }
      } catch (error) {
        health[name] = { status: 'error', error: error.message };
      }
    }
    
    return health;
  }
  
  // Start periodic updates
  startTrayUpdates() {
    setInterval(() => {
      this.updateTrayMenu();
    }, 30000); // Every 30 seconds
  }
  
  // Start all monitoring systems
  startMonitoring() {
    this.startTrayUpdates();
    this.monitorServices();
  }
  
  // Auto-updater setup
  setupAutoUpdater() {
    // Configure auto-updater
    autoUpdater.checkForUpdatesAndNotify();
    
    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
    });
    
    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      this.showNotification(
        '🔄 Update Available',
        `Version ${info.version} is available and will be downloaded in the background.`,
        { silent: false }
      );
    });
    
    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available');
    });
    
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });
    
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`Download progress: ${percent}%`);
      
      if (this.tray && !this.tray.isDestroyed()) {
        this.tray.setToolTip(`DWeb Desktop Node - Downloading update: ${percent}%`);
      }
    });
    
    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      
      // Reset tray tooltip
      if (this.tray && !this.tray.isDestroyed()) {
        this.tray.setToolTip('DWeb Desktop Node - Running (Update Ready)');
      }
      
      // Show notification with action
      const notification = this.showNotification(
        '✅ Update Ready',
        `Version ${info.version} has been downloaded. Click to restart and install.`,
        { silent: false }
      );
      
      // Handle notification click to restart
      if (notification) {
        notification.on('click', () => {
          this.restartAndUpdate();
        });
      }
      
      // Also update tray menu to show restart option
      this.updateTrayMenu();
    });
    
    // Check for updates every hour
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 3600000);
  }
  
  restartAndUpdate() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      title: 'Install Update',
      message: 'An update has been downloaded. The application will restart to apply the update.',
      buttons: ['Install and Restart', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        this.isQuiting = true;
        autoUpdater.quitAndInstall();
      }
    });
  }
  
  checkForUpdates() {
    autoUpdater.checkForUpdatesAndNotify();
    this.showNotification(
      '🔄 Checking for Updates',
      'Looking for the latest version...',
      { silent: true }
    );
  }
}

// Application entry point
const manager = new DesktopNodeManager();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
manager.init().catch((error) => {
  console.error('Failed to start Desktop Node:', error);
  process.exit(1);
});

// Start all monitoring systems
manager.startMonitoring();

module.exports = manager;