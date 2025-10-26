# Migration Plan: VPS Services → Distributed Architecture

**Date:** 2025-10-26  
**Status:** Planning Phase  
**Goal:** Gradually migrate from single VPS to hybrid distributed architecture with zero downtime

---

## Migration Strategy: Gradual Rollout (NOT Big Bang)

### ❌ What We're NOT Doing:
- Rewriting existing VPS services
- Shutting down VPS
- Breaking existing extensions
- Big bang migration

### ✅ What We ARE Doing:
- Keep VPS running (it becomes node #1)
- Package VPS services into desktop app
- Add desktop nodes alongside VPS
- Gradual user migration
- Smooth transition over 2-3 months

---

## Phase 1: Package Existing Services (Week 1-2)

### Objective: Make VPS services portable

**Current VPS Structure:**
```
backend/
├── registry-service/     (Express.js, PostgreSQL)
├── signaling-service/    (WebSocket server)
├── storage-service/      (File storage)
└── gateway-service/      (HTTP proxy)
```

**Step 1: Create Desktop Node Package**
```
desktop-node/           ← NEW folder
├── src/
│   ├── main.js         ← Electron main process
│   ├── services/
│   │   ├── registry.js     ← COPY from backend/registry-service
│   │   ├── signaling.js    ← COPY from backend/signaling-service
│   │   ├── storage.js      ← COPY from backend/storage-service
│   │   └── gateway.js      ← COPY from backend/gateway-service
│   ├── database/
│   │   └── sqlite.js       ← SQLite adapter (replaces PostgreSQL)
│   └── ui/
│       └── index.html      ← Desktop app UI
├── package.json
└── electron-builder.yml
```

**Key Changes:**
1. **Database Adapter:** PostgreSQL → SQLite (for portability)
   ```javascript
   // backend/registry-service/store.js (current)
   const pool = new Pool({ ... }); // PostgreSQL
   
   // desktop-node/services/registry.js (new)
   const Database = require('better-sqlite3');
   const db = new Database('registry.db');
   
   // Same API, different storage
   ```

2. **Service Wrapper:** Run all services in one process
   ```javascript
   // desktop-node/src/main.js
   const { startRegistry } = require('./services/registry');
   const { startSignaling } = require('./services/signaling');
   const { startStorage } = require('./services/storage');
   const { startGateway } = require('./services/gateway');
   
   async function startAllServices() {
     await startRegistry(8788);
     await startSignaling(8787);
     await startStorage(8789);
     await startGateway(8790);
     console.log('All services running');
   }
   ```

3. **Keep API Compatibility:** Same endpoints, same responses
   - `GET /domains/:domain` → Works identically
   - `POST /domains` → Works identically
   - Extension sees no difference

---

## Phase 2: Add DHT Layer (Week 3-4)

### Objective: Enable peer discovery and data replication

**Desktop Node with DHT:**
```javascript
// desktop-node/src/services/dht-sync.js

class DHTSync {
  constructor(localDB, p2pNode) {
    this.localDB = localDB;
    this.p2pNode = p2pNode;
  }
  
  // Publish local domains to DHT
  async publishToDHT() {
    const domains = this.localDB.getAllDomains();
    
    for (const domain of domains) {
      const key = `/dweb/domain/${domain.name}`;
      await this.p2pNode.dht.put(key, JSON.stringify(domain));
    }
  }
  
  // Subscribe to DHT updates from other nodes
  async subscribeToDHT() {
    this.p2pNode.dht.on('put', async (key, value) => {
      if (key.startsWith('/dweb/domain/')) {
        const domain = JSON.parse(value);
        this.localDB.cacheDomain(domain); // Cache locally
      }
    });
  }
}
```

**Dual Storage Model:**
```
Desktop Node Storage:
├── Local SQLite (primary)    ← Fast, local-first
├── DHT (sync)                ← Distributed backup
└── VPS (fallback)            ← If DHT fails
```

---

## Phase 3: Extension Smart Router (Week 5)

### Objective: Extension intelligently chooses VPS or desktop node

**Current Extension (Single VPS):**
```javascript
// extension/scripts/api/registryClient.js (current)
const REGISTRY_URL = 'http://34.107.74.70:8788';

async function getDomain(domain) {
  const res = await fetch(`${REGISTRY_URL}/domains/${domain}`);
  return res.json();
}
```

**New Extension (Smart Router):**
```javascript
// extension/scripts/api/smartRouter.js (new)

class SmartRouter {
  constructor() {
    this.sources = [
      { type: 'local', url: 'http://localhost:8788', priority: 1 },
      { type: 'vps', url: 'http://34.107.74.70:8788', priority: 2 },
      { type: 'dht', priority: 3 }
    ];
  }
  
  async getDomain(domain) {
    // Try local desktop node first (if running)
    try {
      const local = await fetch('http://localhost:8788/domains/' + domain);
      if (local.ok) return local.json();
    } catch {}
    
    // Fallback to official VPS
    try {
      const vps = await fetch('http://34.107.74.70:8788/domains/' + domain);
      if (vps.ok) return vps.json();
    } catch {}
    
    // Last resort: DHT
    return await this.queryDHT(domain);
  }
}
```

**User Experience:**
```
User A (Desktop node installed):
  Query: test.dweb
  → Localhost (2ms) ✅ Fast!

User B (No desktop node):
  Query: test.dweb
  → VPS (100ms) ✅ Still works!
```

---

## Phase 4: Gradual User Migration (Week 6-12)

### Beta Testing (Week 6-8)

**Step 1: Invite 20 beta testers**
- Provide desktop node installer
- Half users install it, half don't
- Monitor both groups
- Collect feedback

**Step 2: A/B Testing**
```
Group A (Desktop node): 10 users
├─ Measure latency
├─ Check reliability
└─ User satisfaction survey

Group B (VPS only): 10 users
├─ Same measurements
└─ Control group
```

**Success Criteria:**
- Desktop node latency < VPS latency
- 0 crashes in 1 week
- 80%+ user satisfaction

### Public Rollout (Week 9-12)

**Week 9: Soft Launch**
- Announce desktop node on website
- "Optional: Speed up your experience"
- No forced installation

**Week 10: Incentivize**
- Node runners get premium features
- Leaderboard/gamification
- Community recognition

**Week 11: Scale**
- Target 100+ nodes
- Monitor network health
- Fix any issues

**Week 12: VPS Becomes Optional**
- Desktop nodes handle 80% of traffic
- VPS only handles fallback
- Declare success

---

## VPS Role After Migration

### VPS Won't Be Shut Down, It Becomes:

**1. Bootstrap Node**
```javascript
// VPS also runs as a desktop node + bootstrap
// Acts as entry point for new nodes
```

**2. Fallback/Redundancy**
```javascript
// If all desktop nodes fail (unlikely), VPS serves
// High availability for critical operations
```

**3. Official Node**
```javascript
// Trusted node for initial setup
// New users connect to VPS first
// Then discover community nodes via DHT
```

---

## Data Migration Strategy

### No Data Loss, Gradual Sync

**Current State:**
```
VPS PostgreSQL:
├── 100 domains registered
├── 500 manifests
└── 10,000 chunks pointers
```

**Migration Process:**

**Step 1: VPS Becomes Node #1**
```bash
# On VPS (Ubuntu):
cd /home/behrambazo/dweb-hosting-network
npm install -g dweb-node-cli

# Start desktop node alongside existing services
dweb-node start --sync-from-postgres

# This reads PostgreSQL and syncs to DHT
```

**Step 2: Desktop Nodes Sync**
```javascript
// Desktop nodes connect and sync
await dht.subscribe('/dweb/domain/*');

// Automatically get all 100 domains from DHT
// No manual migration needed
```

**Step 3: Writes Go to Both**
```javascript
// New domain registration:
async function registerDomain(domain) {
  // Write to local SQLite
  await localDB.save(domain);
  
  // Publish to DHT
  await dht.put(`/dweb/domain/${domain.name}`, domain);
  
  // (Optional) Also write to VPS for redundancy
  await vps.save(domain);
}
```

---

## Backwards Compatibility

### Old Extensions Keep Working

**Scenario 1: User hasn't updated extension**
```
Old extension (v1.0):
  → Only knows VPS URL
  → Connects to http://34.107.74.70:8788
  → VPS still running
  → Everything works ✅
```

**Scenario 2: User updated extension, no desktop node**
```
New extension (v2.0):
  → Tries localhost first (fails)
  → Falls back to VPS
  → Everything works ✅
```

**Scenario 3: User updated extension + has desktop node**
```
New extension (v2.0):
  → Tries localhost (succeeds)
  → Fast local response (2ms)
  → Best experience ✅
```

---

## Rollback Plan (If Things Go Wrong)

### Easy Rollback Strategy

**If desktop nodes are buggy:**
```bash
# 1. Pause desktop node rollout
# 2. Extension falls back to VPS (automatic)
# 3. VPS continues serving 100% traffic
# 4. Fix bugs
# 5. Resume rollout
```

**If DHT is slow:**
```javascript
// Disable DHT temporarily
config.enableDHT = false;

// Extension uses only VPS
// No user impact
```

**Nuclear Option:**
```bash
# Remove desktop node from recommended downloads
# Old extensions keep working
# VPS handles all traffic
# Zero downtime
```

---

## Technical Implementation Checklist

### Week 1-2: Desktop Node Package
- [ ] Create `desktop-node/` folder
- [ ] Copy existing services from `backend/`
- [ ] Replace PostgreSQL with SQLite
- [ ] Test all APIs locally
- [ ] Create Electron wrapper
- [ ] Build installers (Windows/Mac/Linux)

### Week 3-4: DHT Integration
- [ ] Add libp2p DHT to desktop node
- [ ] Implement domain sync (local ↔ DHT)
- [ ] Test multi-node DHT communication
- [ ] VPS publishes to DHT

### Week 5: Smart Router
- [ ] Update extension `registryClient.js`
- [ ] Add localhost detection
- [ ] Add fallback logic
- [ ] Test with and without desktop node

### Week 6-8: Beta Testing
- [ ] Recruit 20 testers
- [ ] Deploy desktop node
- [ ] Monitor performance
- [ ] Fix bugs

### Week 9-12: Public Rollout
- [ ] Announce desktop node
- [ ] Scale to 100+ nodes
- [ ] Monitor network health
- [ ] VPS becomes optional

---

## Cost & Performance Comparison

### Current (Single VPS):
```
Cost:         $50/month
Capacity:     1000 req/s
Latency:      100ms
Resilience:   ❌ SPOF
```

### After Migration (Hybrid):
```
Cost:         $50/month (VPS) + $0 (community)
Capacity:     10,000+ req/s (10x)
Latency:      2-100ms (10x faster avg)
Resilience:   ✅ 99.9% uptime
```

### Final State (100+ Nodes):
```
Cost:         $50/month (optional VPS)
Capacity:     100,000+ req/s (100x)
Latency:      2-20ms (50x faster avg)
Resilience:   ✅ 99.99% uptime
```

---

## Summary: Zero-Risk Migration

### Key Principles:
1. ✅ **VPS stays running** - No shutdown
2. ✅ **Gradual rollout** - No big bang
3. ✅ **Backwards compatible** - Old extensions work
4. ✅ **Easy rollback** - If issues, fallback to VPS
5. ✅ **User choice** - Desktop node is optional

### Timeline:
- **Week 1-2:** Package services
- **Week 3-4:** Add DHT
- **Week 5:** Smart router
- **Week 6-8:** Beta test (20 users)
- **Week 9-12:** Public rollout (100+ users)

### End Result:
- VPS continues as fallback node
- Desktop nodes handle 80%+ traffic
- Network is faster, cheaper, more resilient
- Zero downtime during migration

---

**Next Step:** Start Week 1 - Package existing services into desktop node

**Questions?** See `docs/sessions/SESSION_2025-10-26_DISTRIBUTED_SERVERS.md`
