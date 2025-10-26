#!/bin/bash
set -e

# Bootstrap Node Setup for DWeb Hosting Network
echo "=== DWeb Bootstrap Node Setup ==="
echo "Environment: ${environment}"
echo "Node Index: ${node_index}"

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Install monitoring tools
apt-get install -y prometheus-node-exporter

# Create application directory
mkdir -p /opt/dweb-bootstrap
cd /opt/dweb-bootstrap

# Clone repository (or copy bootstrap server code)
# For now, create bootstrap server from template
cat > /opt/dweb-bootstrap/package.json <<'EOF'
{
  "name": "dweb-bootstrap-node",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "libp2p": "^1.0.0",
    "@libp2p/tcp": "^9.0.0",
    "@libp2p/websockets": "^8.0.0",
    "@chainsafe/libp2p-noise": "^15.0.0",
    "@libp2p/mplex": "^10.0.0",
    "@libp2p/identify": "^1.0.0",
    "@libp2p/circuit-relay-v2": "^1.0.0",
    "@libp2p/kad-dht": "^12.0.0",
    "@libp2p/autonat": "^1.0.0",
    "@libp2p/ping": "^1.0.0",
    "it-pipe": "^3.0.0",
    "it-length-prefixed": "^9.0.0"
  }
}
EOF

# Install dependencies
npm install

# Create bootstrap server script
cat > /opt/dweb-bootstrap/server.js <<'SERVEREOF'
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { kadDHT } from '@libp2p/kad-dht';
import { autoNAT } from '@libp2p/autonat';
import { ping } from '@libp2p/ping';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';

const WEBSOCKET_PORT = process.env.LIBP2P_WS_PORT || 9104;
const PEER_EXCHANGE_PROTOCOL = '/dweb/peer-exchange/1.0.0';

console.log('[Bootstrap] Starting DWeb Bootstrap Node...');

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: [
        \`/ip4/0.0.0.0/tcp/\${WEBSOCKET_PORT}/ws\`
      ]
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({ reservations: { maxReservations: 100 } }),
      dht: kadDHT({ clientMode: false }),
      autoNAT: autoNAT(),
      ping: ping()
    },
    connectionManager: {
      minConnections: 0,
      maxConnections: 100
    }
  });

  await node.start();

  console.log('[Bootstrap] Node started successfully!');
  console.log('[Bootstrap] Peer ID:', node.peerId.toString());
  console.log('[Bootstrap] Listening on:');
  node.getMultiaddrs().forEach((addr) => {
    console.log('  -', addr.toString());
  });

  // Register peer exchange protocol
  await node.handle(PEER_EXCHANGE_PROTOCOL, async (stream) => {
    try {
      const requesterId = stream.connection?.remotePeer?.toString() || 'unknown';
      
      // Read request
      let requestData = null;
      for await (const msg of lp.decode(stream)) {
        const textDecoder = new TextDecoder();
        const jsonStr = textDecoder.decode(msg.subarray ? msg.subarray() : msg);
        requestData = JSON.parse(jsonStr);
        break;
      }
      
      // Build peer list
      const wsAddr = node.getMultiaddrs().find(ma => ma.toString().includes('/ws'));
      const base = wsAddr ? wsAddr.toString() : null;
      const records = [];
      
      if (base) {
        for (const p of node.getPeers()) {
          const pid = p.toString();
          if (pid === requesterId) continue;
          records.push({
            peerId: pid,
            multiaddrs: [\`\${base}/p2p-circuit/p2p/\${pid}\`]
          });
        }
      }
      
      const response = { type: 'response', once: true, peers: records };
      const payload = Buffer.from(JSON.stringify(response));
      
      if (stream.sendData) {
        const encoded = lp.encode.single(payload);
        stream.sendData(encoded);
      }
      
      if (stream.sendCloseWrite) {
        stream.sendCloseWrite();
      }
    } catch (err) {
      console.error('[Bootstrap] Peer exchange error:', err.message);
    }
  });

  console.log('[Bootstrap] Peer exchange protocol registered');

  // Log peer connections
  node.addEventListener('peer:connect', (event) => {
    console.log('[Bootstrap] Peer connected:', event.detail.toString());
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Bootstrap] Shutting down...');
    await node.stop();
    process.exit(0);
  });
}

main().catch(console.error);
SERVEREOF

# Start bootstrap node with PM2
pm2 start server.js --name dweb-bootstrap
pm2 save
pm2 startup

# Enable firewall
ufw allow 9104/tcp
ufw allow 22/tcp
ufw --force enable

echo "=== Bootstrap Node Setup Complete ==="
echo "Peer ID will be available in logs: pm2 logs dweb-bootstrap"
