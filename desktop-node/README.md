# DWeb Desktop Node

A desktop application that runs all DWeb network services locally on your computer.

## What is this?

The Desktop Node packages the same services that run on the VPS into a simple desktop application that anyone can run. Instead of relying on a central VPS, users can run their own local node that contributes to the distributed network.

## Features

✅ **All Services in One App**
- Registry service (Port 8788) - Domain resolution
- Signaling service (Port 8787) - WebRTC coordination  
- Storage service (Port 8789) - Local chunk storage

✅ **API Compatible**
- Same REST endpoints as VPS
- Extensions work without changes
- Drop-in replacement

✅ **Privacy First**
- Uses SQLite instead of PostgreSQL
- No user data sent to VPS
- Local-first storage

✅ **Easy to Use**
- System tray integration
- Auto-start on boot
- Beautiful dashboard

## Installation

### Windows
```bash
# Download and run installer
dweb-node-setup.exe
```

### Mac
```bash
# Download and drag to Applications
DWebNode.dmg
```

### Linux
```bash
# Install via package manager
sudo apt install dweb-node
# or download AppImage
./DWebNode.AppImage
```

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Testing API Compatibility
```bash
# Start the desktop node first
npm start

# In another terminal, run the API tests
npm test
```

## Architecture

```
Desktop Node App (Electron)
├── Registry Service (SQLite)
│   ├── GET/POST /domains
│   ├── GET/POST /manifests  
│   └── GET/PATCH /chunks
├── Signaling Service (WebSocket)
│   ├── WebRTC signaling
│   └── Peer discovery
├── Storage Service (File system)
│   ├── Local chunk storage
│   └── Fallback serving
└── UI Dashboard
    ├── Service status
    ├── Network stats
    └── Settings
```

## Compared to VPS

| Feature | VPS | Desktop Node |
|---------|-----|--------------|
| **Database** | PostgreSQL | SQLite |
| **Performance** | High (dedicated) | Good (local) |
| **Privacy** | Metadata only | Full local control |
| **Scalability** | Limited by VPS | Scales with users |
| **Cost** | $50/month | Free |
| **Setup** | Complex | One-click install |

## Configuration

The desktop node stores data in:
- **Windows:** `%APPDATA%\DWebNode\`
- **Mac:** `~/Library/Application Support/DWebNode/`
- **Linux:** `~/.config/DWebNode/`

Configuration files:
- `registry.db` - SQLite database
- `chunks/` - Local chunk storage
- `config.json` - Settings

## API Endpoints

Same as VPS services:

### Registry (Port 8788)
- `GET /health` - Service health
- `GET /domains` - List domains
- `GET /domains/:domain` - Get domain info
- `POST /domains` - Register domain
- `PATCH /domains/:domain` - Update domain
- `GET /manifests/:id` - Get manifest

### Signaling (Port 8787)
- `GET /health` - Service health
- `GET /peers` - List connected peers
- `WS /` - WebSocket signaling

### Storage (Port 8789)
- `GET /health` - Service health
- `GET /stats` - Storage statistics
- `POST /chunks` - Store chunk
- `GET /chunks/:manifest/:index` - Get chunk

## Migration from VPS

Desktop nodes are **fully compatible** with existing extensions and VPS infrastructure.

**Migration path:**
1. Install desktop node
2. Extension automatically tries localhost first
3. Falls back to VPS if desktop node unavailable
4. Gradual migration as more users adopt desktop nodes

**Zero-risk transition:**
- VPS keeps running
- Old extensions work unchanged
- New users get better performance
- Network becomes more resilient

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/dweb-network/desktop-node/issues)
- **Discussions:** [GitHub Discussions](https://github.com/dweb-network/desktop-node/discussions)
- **Discord:** [Community Server](https://discord.gg/dweb)

---

**Help build the distributed web!** 🌐

By running a desktop node, you're contributing to a censorship-resistant, peer-to-peer internet where no single entity controls the infrastructure.