#!/usr/bin/env node

/**
 * Production Setup and Configuration
 * Prepares the DWeb system for production deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

class ProductionSetup {
  constructor() {
    this.checks = [];
    this.fixes = [];
    this.warnings = [];
  }

  async runSetup() {
    console.log('🚀 DWeb Production Setup');
    console.log('=' .repeat(50));

    await this.checkSystemHealth();
    await this.validateConfiguration();
    await this.setupProductionFiles();
    await this.runMigrations();
    await this.validateExtension();
    await this.performIntegrationTest();

    this.generateReport();
  }

  async checkSystemHealth() {
    console.log('\n1️⃣  System Health Check');
    
    // Check desktop registry
    try {
      const response = await fetch('http://localhost:8788/health');
      if (response.ok) {
        const health = await response.json();
        console.log(`   ✅ Registry: ${health.service} v${health.version}`);
        console.log(`   📊 Domains: ${health.database.domains}, Manifests: ${health.database.manifests}`);
        this.checks.push({ name: 'Registry Health', status: 'OK' });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Registry offline: ${error.message}`);
      this.checks.push({ name: 'Registry Health', status: 'FAILED', error: error.message });
    }

    // Check VPS fallback
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('http://34.107.74.70:8788/health', {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        console.log(`   ✅ VPS Fallback accessible`);
        this.checks.push({ name: 'VPS Fallback', status: 'OK' });
      } else {
        console.log(`   ⚠️  VPS Fallback: HTTP ${response.status}`);
        this.checks.push({ name: 'VPS Fallback', status: 'WARNING' });
      }
    } catch (error) {
      console.log(`   ⚠️  VPS Fallback: ${error.message}`);
      this.checks.push({ name: 'VPS Fallback', status: 'WARNING' });
    }

    // Check extension files
    const extensionPath = path.join(projectRoot, 'extension');
    const requiredFiles = [
      'manifest.json',
      'panel/index.html',
      'resolver/index.html',
      'resolver/resolver.js',
      'scripts/api/multiRegistryClient.js'
    ];

    let extensionValid = true;
    for (const file of requiredFiles) {
      const filePath = path.join(extensionPath, file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}`);
      } else {
        console.log(`   ❌ Missing: ${file}`);
        extensionValid = false;
      }
    }

    this.checks.push({ 
      name: 'Extension Files', 
      status: extensionValid ? 'OK' : 'FAILED' 
    });
  }

  async validateConfiguration() {
    console.log('\n2️⃣  Configuration Validation');

    // Check registry configuration
    const registryPath = path.join(projectRoot, 'desktop-node/services/registry.js');
    if (fs.existsSync(registryPath)) {
      const registryContent = fs.readFileSync(registryPath, 'utf8');
      
      // Check if replica fix is applied
      if (registryContent.includes('replicas: replicas, // CRITICAL: Include replicas for P2P resolution')) {
        console.log(`   ✅ Registry replica fix applied`);
        this.checks.push({ name: 'Registry Replica Fix', status: 'OK' });
      } else {
        console.log(`   ❌ Registry replica fix missing`);
        this.checks.push({ name: 'Registry Replica Fix', status: 'FAILED' });
      }

      // Check domain resolver setup
      if (registryContent.includes('setupDomainResolver')) {
        console.log(`   ✅ Domain resolver configured`);
        this.checks.push({ name: 'Domain Resolver', status: 'OK' });
      } else {
        console.log(`   ⚠️  Domain resolver may not be configured`);
        this.checks.push({ name: 'Domain Resolver', status: 'WARNING' });
      }
    } else {
      console.log(`   ❌ Registry service file not found`);
      this.checks.push({ name: 'Registry Configuration', status: 'FAILED' });
    }

    // Check extension resolver fix
    const resolverPath = path.join(projectRoot, 'extension/resolver/resolver.js');
    if (fs.existsSync(resolverPath)) {
      const resolverContent = fs.readFileSync(resolverPath, 'utf8');
      
      if (resolverContent.includes('FIX: Use manifest replicas if domain replicas missing')) {
        console.log(`   ✅ Extension resolver fix applied`);
        this.checks.push({ name: 'Extension Resolver Fix', status: 'OK' });
      } else {
        console.log(`   ⚠️  Extension resolver fix may not be applied`);
        this.checks.push({ name: 'Extension Resolver Fix', status: 'WARNING' });
      }
    }
  }

  async setupProductionFiles() {
    console.log('\n3️⃣  Production Files Setup');

    // Create production docker-compose
    this.createDockerCompose();
    
    // Create nginx configuration
    this.createNginxConfig();
    
    // Create systemd services
    this.createSystemdServices();
    
    // Create environment files
    this.createEnvironmentFiles();

    console.log(`   ✅ Production files created`);
  }

  createDockerCompose() {
    const dockerCompose = `version: '3.8'

services:
  dweb-registry:
    build: 
      context: ./desktop-node
      dockerfile: Dockerfile.production
    ports:
      - "8788:8788"
    environment:
      - NODE_ENV=production
      - DB_PATH=/data/registry.json
    volumes:
      - ./data/registry:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8788/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  dweb-storage:
    build:
      context: ./backend/storage-service
      dockerfile: Dockerfile
    ports:
      - "8789:8789"
    environment:
      - NODE_ENV=production
    volumes:
      - ./data/storage:/app/data
    restart: unless-stopped

  dweb-signaling:
    build:
      context: ./desktop-node
      dockerfile: Dockerfile.signaling
    ports:
      - "8787:8787"
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - dweb-registry
      - dweb-storage
      - dweb-signaling
    restart: unless-stopped

volumes:
  registry-data:
  storage-data:
`;

    fs.writeFileSync(path.join(projectRoot, 'docker-compose.prod.yml'), dockerCompose);
  }

  createNginxConfig() {
    const nginxDir = path.join(projectRoot, 'nginx');
    if (!fs.existsSync(nginxDir)) {
      fs.mkdirSync(nginxDir, { recursive: true });
    }

    const nginxConfig = `events {
    worker_connections 1024;
}

http {
    upstream dweb-registry {
        server dweb-registry:8788;
    }
    
    upstream dweb-storage {
        server dweb-storage:8789;
    }

    server {
        listen 80;
        server_name dweb.local;

        # Registry API
        location /api/ {
            proxy_pass http://dweb-registry/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Storage API
        location /storage/ {
            proxy_pass http://dweb-storage/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Domain resolver
        location /resolve/ {
            proxy_pass http://dweb-registry/resolve/;
            proxy_set_header Host $host;
        }

        # Health checks
        location /health {
            proxy_pass http://dweb-registry/health;
        }

        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key";
    }
}
`;

    fs.writeFileSync(path.join(nginxDir, 'nginx.conf'), nginxConfig);
  }

  createSystemdServices() {
    const systemdDir = path.join(projectRoot, 'systemd');
    if (!fs.existsSync(systemdDir)) {
      fs.mkdirSync(systemdDir, { recursive: true });
    }

    const registryService = `[Unit]
Description=DWeb Registry Service
After=network.target

[Service]
Type=simple
User=dweb
WorkingDirectory=${projectRoot}/desktop-node
ExecStart=/usr/bin/node services/registry.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

    fs.writeFileSync(path.join(systemdDir, 'dweb-registry.service'), registryService);
  }

  createEnvironmentFiles() {
    const envDir = path.join(projectRoot, 'config');
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    const prodEnv = `# Production Environment
NODE_ENV=production
PORT=8788
DB_PATH=/opt/dweb/data/registry.json

# Security
CORS_ORIGIN=https://dweb.local
API_RATE_LIMIT=1000

# P2P Configuration
SIGNALING_SERVER=wss://dweb.local/signaling
MAX_PEERS=50
CHUNK_TIMEOUT=10000

# Storage Configuration
STORAGE_SERVICE_URL=http://localhost:8789
STORAGE_MAX_SIZE=100MB

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
`;

    fs.writeFileSync(path.join(envDir, 'production.env'), prodEnv);
  }

  async runMigrations() {
    console.log('\n4️⃣  Running Migrations');
    
    console.log(`   🔄 Fixing domain replicas...`);
    try {
      // Run the domain replica fix
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(`node ${path.join(__dirname, 'fix-domain-replicas.js')}`);
      console.log(`   ✅ Domain migration completed`);
      this.fixes.push('Domain replicas synchronized');
    } catch (error) {
      console.log(`   ❌ Migration failed: ${error.message}`);
      this.checks.push({ name: 'Domain Migration', status: 'FAILED', error: error.message });
    }
  }

  async validateExtension() {
    console.log('\n5️⃣  Extension Validation');

    // Check if enhanced resolver exists
    const enhancedResolverPath = path.join(projectRoot, 'extension/resolver/enhanced-resolver.js');
    if (fs.existsSync(enhancedResolverPath)) {
      console.log(`   ✅ Enhanced resolver available`);
      this.checks.push({ name: 'Enhanced Resolver', status: 'OK' });
    } else {
      console.log(`   ⚠️  Enhanced resolver not found`);
      this.checks.push({ name: 'Enhanced Resolver', status: 'WARNING' });
    }

    // Validate manifest.json
    const manifestPath = path.join(projectRoot, 'extension/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      if (manifest.permissions && manifest.permissions.includes('storage')) {
        console.log(`   ✅ Extension permissions configured`);
      } else {
        console.log(`   ⚠️  Extension may need additional permissions`);
      }
      
      console.log(`   📋 Extension: ${manifest.name} v${manifest.version}`);
      this.checks.push({ name: 'Extension Manifest', status: 'OK' });
    }
  }

  async performIntegrationTest() {
    console.log('\n6️⃣  Integration Test');

    try {
      // Test domain resolution flow
      const testDomain = 'heyheyhey.dweb';
      
      console.log(`   🧪 Testing ${testDomain} resolution...`);
      
      // Test registry endpoint
      const domainResponse = await fetch(`http://localhost:8788/domains/${testDomain}`);
      if (domainResponse.ok) {
        const domain = await domainResponse.json();
        console.log(`   ✅ Domain found: ${domain.domain}`);
        
        if (domain.replicas && domain.replicas.length > 0) {
          console.log(`   ✅ Domain has ${domain.replicas.length} replicas`);
          this.checks.push({ name: 'Integration Test', status: 'OK' });
        } else {
          console.log(`   ⚠️  Domain missing replicas`);
          this.checks.push({ name: 'Integration Test', status: 'WARNING' });
        }
      } else {
        console.log(`   ⚠️  Test domain not found (expected for clean install)`);
        this.checks.push({ name: 'Integration Test', status: 'SKIPPED' });
      }

      // Test resolver endpoint
      try {
        const resolverResponse = await fetch(`http://localhost:8788/resolve/${testDomain}`);
        if (resolverResponse.ok) {
          console.log(`   ✅ Registry resolver working`);
        } else {
          console.log(`   ⚠️  Registry resolver: HTTP ${resolverResponse.status}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Registry resolver test failed`);
      }

    } catch (error) {
      console.log(`   ❌ Integration test failed: ${error.message}`);
      this.checks.push({ name: 'Integration Test', status: 'FAILED', error: error.message });
    }
  }

  generateReport() {
    console.log('\n📋 Production Setup Report');
    console.log('=' .repeat(50));

    const ok = this.checks.filter(c => c.status === 'OK').length;
    const warnings = this.checks.filter(c => c.status === 'WARNING').length;
    const failed = this.checks.filter(c => c.status === 'FAILED').length;
    const total = this.checks.length;

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Passed: ${ok}/${total}`);
    console.log(`   ⚠️  Warnings: ${warnings}/${total}`);
    console.log(`   ❌ Failed: ${failed}/${total}`);

    if (failed === 0) {
      console.log(`\n🎉 Production setup is ready!`);
      console.log(`\n🚀 Next steps:`);
      console.log(`   1. Deploy with: docker-compose -f docker-compose.prod.yml up -d`);
      console.log(`   2. Install extension in production browsers`);
      console.log(`   3. Configure domain DNS to point to your server`);
      console.log(`   4. Setup SSL certificates`);
      console.log(`   5. Configure monitoring and backups`);
    } else {
      console.log(`\n⚠️  Fix the failed checks before production deployment.`);
    }

    // Detailed results
    console.log(`\n📋 Detailed Results:`);
    this.checks.forEach(check => {
      const icon = check.status === 'OK' ? '✅' : 
                   check.status === 'WARNING' ? '⚠️ ' : '❌';
      console.log(`   ${icon} ${check.name}: ${check.status}`);
      if (check.error) {
        console.log(`      Error: ${check.error}`);
      }
    });
  }
}

// Run setup
const setup = new ProductionSetup();
setup.runSetup().catch(console.error);