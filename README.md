# DWeb Hosting Network — Getting Started Guide

This project defines a next-generation browser extension and accompanying infrastructure designed to establish a censorship-resistant and decentralized web hosting network. The goal is to enable users to host Web3 applications over domain names similar to `.dweb` that are not natively supported by traditional browsers, **without any fees**, through a high-performance P2P network.

---

## 1. Vision

- Users can join the network simply by installing the extension.
- Each user can upload their Web3 application via the panel and claim a `.dweb` domain name.
- Content distribution will be handled through a high-performance P2P layer; instead of cumbersome solutions like IPFS, real-time, optimized peer-to-peer transfers will be used.
- The entire network will be built with free and open technologies; dependency on a central authority will be minimized.

---

## 2. Product Objectives

1. **Extension-Panel Experience**
   - User login via Chrome/Chromium-based browser extension (Manifest V3).
   - Through the control panel within the extension or a separate web panel:
     - Upload Web3 application files to the P2P network
     - Domain search, registration/transfer
     - Monitor network health, storage, and traffic statistics
     - Test domain verification and resolver prototype after manifest registration

2. **Real P2P Network**
   - WebRTC-based data channels
   - Registered bootstrap signaling servers, STUN/TURN infrastructure
   - Smart peer discovery, content replication, and caching
   - Low latency, high throughput, and automatic reconnection

3. **Domain & Content Management**
   - Global `.dweb` registry (PostgreSQL + REST API)
   - Domain ownership verification and transfer processes
   - Content metadata and version management
   - Client-side integrity/verification

4. **Security and Compliance**
   - Authentication (JWT/OAuth) and authorization layers
   - Content sanitization, blocking malicious uploads
   - In-network rate limiting, audit logs, violation reporting

5. **Performance-Focused Design**
   - Replicated storage strategy (P2P + object storage hybrid)
   - Chunk-based delta synchronization and fast loading
   - Geographic peer selection for CDN-like speeds

---

## 3. System Components

| Layer | Description | Technologies |
|--------|----------|--------------|
| Browser Extension | User interface, domain management, content upload, local cache | Manifest V3, React/Vue, TypeScript |
| P2P Layer | WebRTC data channel, peer discovery, chunk replication | WebRTC, libp2p concepts, STUN/TURN |
| Signaling Service | Peer matching, session management, authentication | Node.js, WebSocket, Redis |
| Domain/Registry API | Central coordination managing `.dweb` domain names | Node.js/NestJS, PostgreSQL |
| Content Service | Content metadata, persistent storage, integrity verification | Object Storage (MinIO/S3), Redis, Hashing |
| Monitoring & Telemetry | Network health, alerts, usage metrics | Prometheus, Grafana, Loki |

---

## 4. Usage Scenario

1. **Install the Extension**
   - chrome://extensions → Developer Mode → "Load unpacked" → project folder.
   - When the extension is installed, the panel opens at `chrome-extension://…/panel.html`.

2. **Create Account / Login**
   - Authentication via extension panel (OIDC/JWT).
   - Node API requests user registration service.

3. **Upload Application**
   - Select files in the panel.
   - Files are split into chunks → hashed → distributed to P2P peers via the upload endpoint in the signaling service.

4. **Assign Domain**
   - Search for domain in the panel → register if available.
   - API links the domain to the user account, associates with P2P content hash.

5. **Publish and Share**
   - When the user or other users enter `https://<domain>.dweb` from their extension:
     - Resolver fetches domain metadata.
     - Client downloads chunks from the P2P layer; completes from object storage if necessary.
     - Application runs in the browser.

---

## 5. Project Structure (Planned)

```
dweb-hosting-network/
├── README.md
├── docs/
│   ├── ARCHITECTURE_PLAN.md
│   ├── P2P_NETWORK_SPEC.md
│   └── SECURITY_MODEL.md
├── backend/
│   ├── registry-service/
│   ├── signaling-service/
│   └── storage-service/
├── extension/
│   ├── src/
│   ├── public/
│   └── tests/
└── ops/
    ├── docker/
    ├── helm/
    └── terraform/
```

---

## 6. Technology Stack (Recommended)

- **Frontend / Extension:** TypeScript, React or Svelte, TailwindCSS
- **P2P Layer:** WebRTC DataChannel, WebSocket signaling, libp2p concepts
- **Backend:** Node.js (NestJS), TypeScript, PostgreSQL, Redis, MinIO/S3
- **Session Management:** OpenID Connect, OAuth2.1
- **Development Tools:** pnpm, Turborepo, Jest, Playwright
- **Monitoring:** Grafana + Prometheus, Loki, OpenTelemetry

---

## 7. Roadmap

### Phase 0 — Design & Preparation
- Architectural documents
- Technology and protocol selections
- Project structuring and CI templates

### Phase 1 — Minimum P2P MVP
- Real signaling service (Node.js + WebSocket)
- STUN/TURN configuration
- Making WebRTC connection setup in the extension functional
- MVP for uploading files and sharing between two clients

### Phase 2 — Domain & Panel
- Registry API + PostgreSQL schema
- Domain management in the extension
- Content metadata and hash-based verification

### Phase 3 — Security & Performance
- Authentication, authorization, rate limiting
- Chunk replication strategies, peer scoring
- Content integrity verification, fallback storage integration

### Phase 4 — Operations & Production
- CI/CD pipeline, containerization
- Monitoring, logging, alerting infrastructure
- Versioning, beta process, documentation

---

## 8. Installation & Running (Future Plan)

> The project is not yet installable; the steps below will be activated when completed.

1. **Dependencies**
   - Node.js 20+, pnpm, Docker, Git, PowerShell 7+
2. **Clone the Repo**
   ```powershell
   git clone <repo-url> dweb-hosting-network
   cd dweb-hosting-network
   ```
3. **Prepare Workspace**
   ```powershell
   pnpm install
   pnpm run bootstrap
   ```
4. **Start Local Services**
   ```powershell
   pnpm --filter signaling-service dev
   pnpm --filter registry-service dev
   pnpm --filter extension dev
   ```
5. **Install Extension**
   - Load `extension/dist` folder into Chrome
   - Open panel interface, login with test account

---

## 9. Contribution Guidelines (Draft)

1. Open a design draft or issue for all new features.
2. Code standards: ESLint + Prettier + TypeScript strict mode.
3. Do not send PR without writing tests.
4. Mandatory review for changes with security impact.

---

## 10. Next Steps

- Detail the `docs/ARCHITECTURE_PLAN.md` file.
- Prepare POC for signaling service (Node.js + ws).
- Prepare extension skeleton (Manifest + basic panel) and test real P2P connections.

This guide provides a starting point to clarify the project's purpose and scope. If you're ready for the next step, we can move to the architectural plan document and start concrete development steps.

---

## 11. Environment Variables

For quick start, copy the `.env.example` file in the repo to `.env` and edit the environment variables:

```powershell
cp .env.example .env
```

Basic settings:

- **Signaling:** `SIGNALING_SHARED_SECRET`, `SIGNALING_ICE_SERVERS`
- **Registry:** `REGISTRY_API_KEYS`, `REGISTRY_RATE_LIMIT_MAX`, `REGISTRY_POINTER_SWEEP_INTERVAL_MS`
- **Storage:** `STORAGE_BACKEND`, `STORAGE_API_KEYS`, `STORAGE_RATE_LIMIT_MAX`, `STORAGE_DATA_DIR`

Panel and resolver interfaces store these keys in local storage; in production environments, manage values with secret managers and apply regular rotation.

---

## 12. MVP Running Instructions (Current Status)

1. **Install Dependencies**
   ```powershell
   npm install
   ```
2. **Start Signaling Service**
   ```powershell
   npm run --workspace @dweb/signaling-service dev
   ```
   - Default port: `ws://localhost:8787`
   - Set `SIGNALING_ICE_SERVERS='[{"urls":"stun:stun.example.com"},{"urls":"turn:turn.example.com","username":"user","credential":"pass"}]'` environment variable before running to broadcast TURN/STUN info to all peers.
   - (Optional) Registry service: `npm run --workspace @dweb/registry-service dev`
   - (Optional) Storage service: `npm run --workspace @dweb/storage-service dev`
     - Default mode is filesystem (`storage-data/` folder); you can set bucket/prefix for MinIO/S3 usage with `STORAGE_BACKEND=s3`.
     - Important environment variables:
       - `STORAGE_BACKEND=filesystem|s3|memory`
       - `STORAGE_DATA_DIR=./storage-data` (target folder for filesystem)
       - `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, optional `STORAGE_S3_ENDPOINT`, `STORAGE_S3_PREFIX`, `STORAGE_S3_FORCE_PATH_STYLE=true`
       - Standard `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for AWS credentials
3. **Install Extension into Chrome/Chromium**
   - chrome://extensions → Enable developer mode
   - "Load unpacked" → Select `dweb-hosting-network/extension` folder
4. **Open Panel and Test Connection**
   - Click extension icon or open new tab `chrome-extension://<id>/panel/index.html` (ID visible on chrome://extensions page)
   - Enter `ws://localhost:8787` in Signaling URL field, connect
   - See registration messages and peer list in log section
5. **WebRTC Data Channel Test**
   - Install the same extension in a different Chrome profile or incognito window
   - With both panels connected, select the other peer from the list and "Open Data Channel"
   - Messages sent with "Send" should appear in the "Data Channel" log of the other panel
6. **File Transfer Test**
   - With data channel open, select a file under 5 MB from `Select file` field
   - Send manifest and chunks with "Send File"; see chunk progress and downloadable link on the other panel
   - After manifest registration, panel automatically starts replication queue based on latency/capacity score and ranks suitable peers; monitor ack/nack and retry statuses from `Channel` log.
   - Can disable auto-select for manual peer selection; in manual mode, marked peers become replication targets in order.
   - Replication Status panel shows live chunk progress (acked/pending/failed) for each target peer.
7. **Registry Registration (Optional)**
   - If registry service is running and `Registry URL` in panel is correct, manifest chunk data is automatically saved upon file transfer completion
   - Can register `.dweb` by filling domain and owner fields and "Register Domain", see verification info in log
8. **Use Resolver Prototype**
   - After reloading extension, open new tab `resolver/index.html` (with service worker chunk cache)
   - Enter domain and registry info and "Resolve"; resolver will first try peer chunk responses, then fallback to registry for manifest chunks
   - Resolver logs `replicas` info in chunk responses; in future versions, real P2P fetch will be done over this peer list
   - After reloading extension, open new tab `resolver/index.html` (with service worker chunk cache)
   - Enter domain and registry info and "Resolve"; resolver will first try peer chunk responses, then fallback to registry for manifest chunks

> Currently, P2P messaging and single file transfer are working; domain operations and persistent storage will be added in upcoming phases.

## 13. Development Notes

- The `STORE_CHUNK_DATA_IN_REGISTRY` flag in `extension/panel/panel.js` determines whether chunk data is sent to the registry during manifest registration.
- The "Allow registry fallback" option in the resolver interface controls whether to fall back to registry if peer chunk response is not received.
