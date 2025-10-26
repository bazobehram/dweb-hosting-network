# DWeb Hosting Network - Mimari Analiz ve Merkeziyetsizlik Değerlendirmesi

## 📊 Sistem Bağımlılık Haritası

### 🔴 MERKEZİ BAĞIMLILIKLAR (VPS'te Çalışan Servisler)

#### 1. **Registry Service** (Port 8788) - VPS ZORUNLU ⚠️
**Ne Yapar:**
- Domain kayıtlarını tutar (domains tablosu - SQLite)
- Manifest metadata'yı tutar (manifests tablosu)
- Chunk pointer'ları ve replica bilgilerini indeksler
- Domain → Manifest ID eşleşmelerini saklar

**Veri Modeli:**
```sql
-- Tüm domainler VPS'te saklanıyor
domains:
  - domain (PK)
  - owner (cryptographic owner ID)
  - manifest_id
  - created_at, updated_at

-- Manifest metadata
manifests:
  - manifest_id (PK)
  - file_name, file_size, mime_type
  - chunk_count, chunk_hashes
  - replicas (peer IDs)
  - **chunkData: NULL** (✅ ASLA VPS'te saklanmaz!)
```

**Merkeziyetsizlik Skoru:** ⚠️ **2/10**
- Domain registry tamamen merkezi
- Kullanıcılar farklı cihazdan giriş yapınca domain'lerine VPS üzerinden erişir
- VPS kapanırsa domain çözümlemesi durur

---

#### 2. **Storage Service** (Port 8789) - İSTEĞE BAĞLI YEDEKLEME
**Ne Yapar:**
- Chunk'ları **SADECE yedekleme** (fallback) için saklar
- S3 veya lokal disk backend destekler
- P2P peers offline olduğunda kullanılır

**Veri:**
```javascript
// Chunk verisi base64 encoded olarak saklanır
POST /chunks
{
  manifestId: "mf-123",
  chunkIndex: 0,
  data: "base64_encoded_chunk_data"
}
```

**Merkeziyetsizlik Skoru:** ✅ **7/10**
- **OPSİYONEL** - Kullanıcı kapatabilir (`storageFallbackToggle`)
- P2P chunk transfer birincil yöntemdir
- Storage sadece yedek/hızlandırma katmanı

---

#### 3. **Signaling Service** (Port 8787) - WebRTC İÇİN GEREKLİ
**Ne Yapar:**
- WebRTC peer connection kurulumu için sinyal iletimi
- NAT traversal koordinasyonu
- P2P bağlantı başlatma

**Merkeziyetsizlik Skoru:** ⚠️ **5/10**
- WebRTC için **GEREKLİ** (NAT arkasındaki peer'lar için)
- Ancak **SADECE** connection setup için kullanılır
- Bağlantı kurulduktan sonra VPS devre dışı
- Alternatif: Public STUN/TURN sunucuları kullanılabilir

---

### 🟢 MERKEZİYETSİZ BİLEŞENLER

#### 4. **libp2p P2P Network** - TAM DAĞITIK ✅
**Ne Yapar:**
- Peer-to-peer chunk transfer
- DHT-based peer discovery
- Circuit relay for NAT traversal
- Chunk replication across peers

**Protokoller:**
```javascript
// Chunk transfer protocol
/dweb/chunk/1.0.0 
  - chunk-request → chunk-response
  - chunk-upload → chunk-upload-ack

// Peer exchange protocol  
/dweb/peer-exchange/1.0.0
  - Peer discovery updates
```

**Merkeziyetsizlik Skoru:** ✅ **10/10**
- Tamamen P2P
- VPS'siz çalışabilir (local DHT ile)
- Chunk'lar peer'lar arasında doğrudan transfer edilir

---

#### 5. **User Identity & Keypairs** - TAM YERELLEŞTİRİLMİŞ ✅
**Nasıl Çalışır:**

```javascript
// 1. Keypair Generation (Browser'da)
const keypair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

// 2. Owner ID Derivation (Ethereum-like)
const publicKeyHash = await crypto.subtle.digest('SHA-256', publicKey);
const ownerId = `dweb:0x${first20Bytes(publicKeyHash)}`;
// Örnek: dweb:0xf8a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9

// 3. Storage (IndexedDB - Tarayıcı içinde)
IndexedDB['dweb-identity']['dweb-keypairs'] = {
  ownerId: "dweb:0x...",
  privateKey: {JWK},
  publicKey: {JWK},
  createdAt: timestamp
};
```

**Merkeziyetsizlik Skoru:** ✅ **10/10**
- **Hiçbir veri VPS'e gönderilmez**
- Keypair tamamen client-side
- Owner ID cryptographic derivation

---

## 🔐 KULLANICI VERİLERİ VE GİZLİLİK

### Kullanıcı Başka Cihazdan Giriş Yapınca Ne Olur?

#### ❌ **ŞU ANKİ DURUM (Sorunlu)**

```
Cihaz 1 (Chrome):
  IndexedDB: { ownerId: "dweb:0xabc123", keypair: {...} }
  localStorage: { publishedApps: [...] }
  
Cihaz 2 (Firefox):
  IndexedDB: BOŞ ❌
  localStorage: BOŞ ❌
  
❌ Sonuç: Kullanıcı uygulamalarına ERİŞEMEZ!
```

**Neden?**
- Keypair **sadece o tarayıcının IndexedDB'sinde**
- Published apps listesi **sadece o tarayıcının localStorage'ında**
- VPS'te kullanıcı verisi YOK (sadece domain registry var)

---

#### ✅ **ÇÖZÜM: Keypair Export/Import Sistemi**

Kodda zaten implementasyon var:

```javascript
// Export (şifreli backup)
const encrypted = await exportKeypairBackup(ownerId, password);
// Kullanıcı bu encrypted string'i kaydeder (dosya, cloud, vs.)

// Import (başka cihazda)
const ownerId = await importKeypairBackup(encrypted, password);
// Aynı owner ID'ye sahip olur!
```

**Kullanım Akışı:**
1. Kullanıcı Settings'te "Export Identity" butonuna basar
2. Şifre girer
3. Encrypted keypair dosyasını indirir (`dweb-identity-backup.enc`)
4. Yeni cihazda "Import Identity" ile geri yükler

---

### Domain ve Manifest Ownership Doğrulama

```javascript
// 1. Domain Register İsteği
POST /domains
{
  domain: "myapp.dweb",
  owner: "dweb:0xabc123",      // client'tan gelen
  manifest_id: "mf-xyz789",
  signature: "base64_sig",      // owner'ın private key'i ile imzalanmış
  publicKey: "base64_pubkey"    // doğrulama için
}

// 2. VPS Backend Doğrulama
const message = `${domain}:${owner}:${manifest_id}`;
const valid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  importedPublicKey,
  signature,
  message
);

if (!valid) return { error: 'INVALID_SIGNATURE' };

// 3. Owner ID Kontrolü
const derivedOwnerId = deriveOwnerIdFromPublicKey(importedPublicKey);
if (derivedOwnerId !== owner) return { error: 'OWNER_MISMATCH' };
```

**Güvenlik:**
- ✅ VPS keypair'i **GÖREMEz** (private key client'ta)
- ✅ Her işlem cryptographic signature ile doğrulanır
- ✅ Owner ID public key'den türetilir (değiştirilemez)

---

## 📂 VERİ AKIŞI DİYAGRAMI

### Publish (Uygulama Yükleme) Akışı

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER UPLOADS FILE                                            │
│    Browser: File → Chunks (ChunkManager)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. P2P REPLICATION (Decentralized)                             │
│    ┌──────────┐  chunk-upload   ┌──────────┐                  │
│    │  Peer A  │ ←──────────────→ │  Peer B  │                  │
│    └──────────┘    /dweb/chunk   └──────────┘                  │
│         ↓                              ↓                        │
│    IndexedDB                      IndexedDB                     │
│    chunks stored                  chunks stored                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. REGISTRY UPDATE (Centralized - VPS)                         │
│    POST /manifests                                              │
│    {                                                            │
│      manifestId: "mf-123",                                      │
│      chunkCount: 50,                                            │
│      chunkReplicas: [["peer1"], ["peer2"], ...],  ← Peer IDs   │
│      chunkPointers: [null, null, ...],  ← Storage URLs (opt)   │
│      chunkData: [null, null, ...]       ← NEVER stored!        │
│    }                                                            │
│    ✅ Sadece METADATA saklanır                                  │
│    ❌ Chunk DATA ASLA VPS'e gönderilmez                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. STORAGE FALLBACK (Optional - Centralized)                   │
│    IF storageFallbackToggle === true:                          │
│      POST /chunks { manifestId, chunkIndex, data }             │
│    ELSE:                                                        │
│      Skip (Pure P2P)                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Domain Registration Akışı

```
┌─────────────────────────────────────────────────────────────────┐
│ USER (Browser)                                                  │
│  • Keypair: IndexedDB (local only)                             │
│  • ownerId: "dweb:0x..."  ← derived from public key            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ SIGN REQUEST                                                    │
│   message = "myapp.dweb:dweb:0xabc:mf-123"                     │
│   signature = sign(privateKey, message)                        │
│   publicKey = export(publicKey)                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ VPS REGISTRY                                                    │
│   1. Verify signature with publicKey                           │
│   2. Derive ownerId from publicKey                             │
│   3. Check if ownerId matches request                          │
│   4. Store in SQLite:                                          │
│      INSERT INTO domains (domain, owner, manifest_id)          │
│      VALUES ('myapp.dweb', 'dweb:0xabc', 'mf-123')            │
└─────────────────────────────────────────────────────────────────┘
```

### Resolution (Domain Çözümleme) Akışı

```
┌─────────────────────────────────────────────────────────────────┐
│ USER VISITS: myapp.dweb                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ RESOLVER EXTENSION                                              │
│   1. GET /domains/myapp.dweb → { manifestId: "mf-123" }       │
│      ⚠️ VPS dependency                                         │
│   2. GET /manifests/mf-123 → { chunkCount, chunkReplicas }    │
│      ⚠️ VPS dependency                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ CHUNK RETRIEVAL (Decentralized)                                │
│   FOR EACH chunk:                                              │
│     TRY peer-to-peer first:                                    │
│       chunkTransfer.requestChunkFromPeer(peerId, manifestId)   │
│       ✅ P2P                                                    │
│     IF FAILS, try storage fallback:                            │
│       GET /chunks/:manifestId/:index                           │
│       ⚠️ VPS dependency (optional)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ RENDER APP IN IFRAME                                            │
│   Chunks assembled → HTML/JS/CSS → User sees app               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 MERKEZİYETSİZLİK SKORU (0-10)

| Bileşen | Skor | VPS Bağımlılığı | Açıklama |
|---------|------|----------------|-----------|
| **User Identity** | 10/10 | ❌ Yok | Tam local, cryptographic |
| **Keypair Storage** | 10/10 | ❌ Yok | IndexedDB (browser) |
| **Published Apps List** | 3/10 | ⚠️ Kısmi | localStorage (tek cihaz) |
| **Chunk Storage** | 9/10 | ⚠️ Optional | P2P birincil, storage yedek |
| **Chunk Transfer** | 10/10 | ❌ Yok | libp2p doğrudan peer-to-peer |
| **Domain Registry** | 2/10 | ✅ Zorunlu | SQLite on VPS |
| **Manifest Metadata** | 2/10 | ✅ Zorunlu | SQLite on VPS |
| **WebRTC Signaling** | 5/10 | ✅ Setup için | Bağlantı sonrası yok |

### **GENEL SKOR: 6.4/10**

---

## ⚠️ KRİTİK SORUNLAR

### 1. **Domain Registry Merkezi**
**Sorun:**
- Tüm domain → manifest eşleşmeleri VPS'te
- VPS kapanırsa domain çözümlemesi durur

**Çözüm:**
- DHT-based domain registry ekle
- IPNS (InterPlanetary Name System) benzeri sistem
- Blockchain-based domain registry (ENS gibi)

### 2. **Kullanıcı Cross-Device Deneyimi Yok**
**Sorun:**
- Keypair ve app listesi tek cihazda
- Başka cihazda sıfırdan başlıyor

**Çözüm:**
- ✅ Export/Import sistemi VAR (aktif edilmeli)
- Settings'te "Sync Identity" butonu ekle
- Encrypted cloud backup opsiyonu

### 3. **Bootstrap Dependency**
**Sorun:**
- libp2p bootstrap node VPS'te
- İlk peer discovery için gerekli

**Çözüm:**
- Public bootstrap nodes listesi
- mDNS local peer discovery ekle
- WebRTC koordination olmadan bağlantı (local network)

---

## ✅ ÖNERİLER - TAM MERKEZİYETSİZLİK İÇİN

### Faz 1: DHT-Based Domain Registry
```javascript
// Domain'i DHT'ye yaz (her peer)
await p2pManager.registerDomainInDHT('myapp.dweb', {
  manifestId: 'mf-123',
  owner: 'dweb:0xabc',
  signature: '...',
  ttl: 86400 // 24 saat
});

// Domain'i DHT'den oku
const record = await p2pManager.resolveDomainFromDHT('myapp.dweb');
```

**Avantajlar:**
- ✅ VPS'siz domain resolution
- ✅ Dağıtık ve sansüre dirençli
- ⚠️ DHT propagation gecikmesi (5-30sn)

### Faz 2: Encrypted Profile Sync
```javascript
// Profile export (şifreli)
const profile = {
  ownerId,
  keypair,
  publishedApps,
  settings
};
const encrypted = await encryptProfile(profile, masterPassword);

// IPFS'e yükle veya P2P'de paylaş
const profileCID = await ipfs.add(encrypted);
// Kullanıcı CID'yi kaydeder veya QR code ile taşır
```

### Faz 3: Local-First Architecture
```javascript
// Tüm veriler önce local'de
IndexedDB['dweb'] = {
  domains: { 'myapp.dweb': { manifestId, owner } },
  manifests: { 'mf-123': { chunks, replicas } },
  chunks: { 'mf-123/0': Uint8Array },
  peers: { 'peer1': { lastSeen, reputation } }
};

// Sadece sync için P2P kullan
p2pManager.syncWithPeers();
```

---

## 📊 ÖZET: Sistem Ne Kadar Merkeziyetsiz?

### ✅ GÜÇLÜ YÖNLER
1. **Chunk transfer %100 P2P** - VPS görmez
2. **User identity tamamen local** - Private key'ler VPS'te değil
3. **Cryptographic ownership** - Blockchain-style doğrulama
4. **Storage opsiyonel** - Kullanıcı kapatabilir

### ⚠️ ZAYIF YÖNLER  
1. **Domain registry merkezi** - VPS single point of failure
2. **Manifest metadata merkezi** - Chunk listesi VPS'te
3. **Cross-device sync yok** - Her cihaz bağımsız
4. **Bootstrap dependency** - İlk bağlantı için VPS gerekli

### 🎯 SON KARAR
**Sistem "Hybrid Decentralized":**
- **Data layer**: %90 merkeziyetsiz (P2P chunks)
- **Discovery layer**: %30 merkeziyetsiz (VPS registry)
- **Identity layer**: %100 merkeziyetsiz (local keypairs)

**VPS Rolü:**
- 🔴 **Kritik**: Domain registry, manifest metadata
- 🟡 **Opsiyonel**: Storage fallback, signaling
- ✅ **Hiç yok**: User credentials, chunk content

**Tam merkeziyetsizlik için:**
→ DHT-based domain registry + local-first architecture + profile sync ekle
