# DWeb Hosting Network - Hızlı Referans Kılavuzu

## 🎯 Sistem Ne Kadar Merkeziyetsiz? TL;DR

**Genel Skor: 6.4/10** (Hybrid Decentralized)

### ✅ TAMAMEN MERKEZİYETSİZ
- ✅ **Chunk Transfer** - Dosyalar peer-to-peer transfer edilir
- ✅ **User Identity** - Private key'ler sadece tarayıcıda (IndexedDB)
- ✅ **Cryptographic Ownership** - Domain ownership signature ile doğrulanır

### ⚠️ KISMI MERKEZİ (VPS Bağımlı)
- ⚠️ **Domain Registry** - `.dweb` domain kayıtları VPS SQLite'ta
- ⚠️ **Manifest Metadata** - Chunk listeleri ve replica bilgileri VPS'te
- ⚠️ **Storage Fallback** - Opsiyonel chunk backup (kullanıcı kapatabilir)
- ⚠️ **WebRTC Signaling** - Peer connection kurulumu için (sonrası P2P)

---

## 🔐 Kullanıcı Verileri Nerede Tutuluyor?

### Browser'da (Tamamen Yerel)
```
IndexedDB['dweb-identity']:
  ✅ Keypair (ECDSA P-256)
  ✅ Owner ID (dweb:0x...)
  ✅ Created timestamp

localStorage:
  ✅ Published apps listesi
  ✅ Settings
  ✅ Environment config
```

### VPS'te (Registry Service)
```sql
domains:
  ✅ domain → manifest_id mapping
  ✅ owner (cryptographic ID, NOT private key!)
  ❌ Chunk data ASLA VPS'te değil

manifests:
  ✅ File metadata (name, size, type)
  ✅ Chunk count, hashes
  ✅ Replica peer IDs
  ❌ Chunk content ASLA VPS'te değil
```

### P2P Network'te (IndexedDB - Peer'larda)
```
✅ Actual chunk data
✅ Replicated across multiple peers
✅ Direct peer-to-peer transfer
```

---

## 🔄 Kullanıcı Başka Cihazdan Nasıl Giriş Yapar?

### Şu Anki Durum (Manuel)
```javascript
// Cihaz 1'de
const encrypted = await exportKeypairBackup(ownerId, password);
// encrypted string'i kaydet (dosya, USB, cloud, vs.)

// Cihaz 2'de  
const ownerId = await importKeypairBackup(encrypted, password);
// Aynı owner ID'ye sahip olursun!
```

**Sorun:** 
- ❌ Published apps listesi taşınmaz (localStorage)
- ❌ Manuel export/import gerekli
- ❌ UI'da export/import butonları yok

**Çözüm:**
→ Settings'e "Export Identity" ve "Import Identity" butonları ekle

---

## 🚨 VPS Kapanırsa Ne Olur?

### ❌ ÇALIŞMAZ
- Domain resolution (`myapp.dweb` çözümlenemez)
- Yeni app publish (manifest kaydedilemez)
- Yeni domain registration

### ✅ ÇALIŞIR
- P2P chunk transfer (peer'lar varsa)
- Local stored chunks'lara erişim
- User identity (keypair local'de)

### 🔧 Geçici Çözüm
```javascript
// Manifest'i local'den yükle (caching)
const manifest = localStorage.getItem(`manifest:${manifestId}`);

// veya P2P'den talep et (DHT gerekli - şu an yok)
const manifest = await p2pManager.requestManifestFromPeers(manifestId);
```

---

## 🎨 Domain Ownership Nasıl Çalışıyor?

### 1. Domain Register İsteği
```javascript
// Extension (Browser)
const message = `${domain}:${owner}:${manifestId}`;
const signature = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  privateKey,
  encoder.encode(message)
);

POST /domains {
  domain: "myapp.dweb",
  owner: "dweb:0xabc123",
  manifestId: "mf-xyz",
  signature: "base64...",
  publicKey: "base64..."
}
```

### 2. VPS Doğrulama
```javascript
// Registry Service
const valid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  importedPublicKey,
  signature,
  message
);

if (!valid) return 401;

// Owner ID'yi public key'den türet
const derivedOwnerId = deriveOwnerIdFromPublicKey(importedPublicKey);
if (derivedOwnerId !== owner) return 403;

// Kaydet
db.exec('INSERT INTO domains (domain, owner, manifest_id) VALUES (?, ?, ?)',
  [domain, owner, manifestId]);
```

### 3. Güvenlik Garantisi
- ✅ VPS **private key'i göremez** (sadece public key)
- ✅ Signature **yalnızca private key sahibi** oluşturabilir
- ✅ Owner ID **public key'den türetilir** (değiştirilemez)
- ✅ Blockchain-style ownership (VPS'e güven gereksiz)

---

## 📊 Veri Akışı Özeti

### Publish (App Yükleme)
```
User → Chunks → P2P Replication → Registry Metadata → (Optional) Storage Backup
        ↓              ✅ P2P              ⚠️ VPS              🟡 Optional
   IndexedDB      Peer IndexedDB      SQLite (no data)      S3/Disk
```

### Resolve (Domain Çözümleme)
```
myapp.dweb → Registry (domain→manifestId) → Registry (manifest metadata)
              ⚠️ VPS                         ⚠️ VPS
                ↓
         Get chunks from Peers (P2P) → Assemble → Render
              ✅ P2P                   ✅ Local   ✅ Local
```

---

## 💡 Tam Merkeziyetsizlik İçin Yapılacaklar

### Priority 1: DHT-Based Domain Registry
```javascript
// VPS yerine DHT kullan
await p2pManager.registerDomainInDHT('myapp.dweb', {
  manifestId: 'mf-123',
  owner: 'dweb:0xabc',
  signature: '...',
  ttl: 86400
});

const record = await p2pManager.resolveDomainFromDHT('myapp.dweb');
```
**Etki:** Domain registry VPS'siz çalışır

### Priority 2: Identity Export UI
```javascript
// Settings'te
<button onClick={exportIdentity}>Export Identity Backup</button>
<button onClick={importIdentity}>Import Identity Backup</button>
```
**Etki:** Cross-device sync kolaylaşır

### Priority 3: Local-First Caching
```javascript
// Her domain resolve'u cache'le
localStorage.setItem(`domain:${domain}`, JSON.stringify({
  manifestId,
  owner,
  cachedAt: Date.now(),
  ttl: 3600000 // 1 saat
}));

// VPS offline ise cache'den oku
const cached = localStorage.getItem(`domain:${domain}`);
if (cached) return JSON.parse(cached);
```
**Etki:** VPS offline olsa da cached domain'ler çalışır

---

## 🔍 Debug Komutları

### P2P Durumunu Kontrol Et
```javascript
// Browser console'da
window.p2pManager.getStatus()
// → { isStarted, peerId, peers, connections }

window.testLibp2pStatus()
// → Detaylı P2P durumu
```

### Chunk Manager'ı Kontrol Et
```javascript
window.getChunkManager()
// → ChunkManager instance

window.getChunkTransfer()  
// → P2PChunkTransfer instance
```

### Identity Kontrol Et
```javascript
// ownerId'ni öğren
const ownerId = localStorage.getItem('dweb-auth-state');
console.log(JSON.parse(ownerId).ownerId);

// Keypair'i kontrol et
const db = await indexedDB.open('dweb-identity', 1);
// dweb-keypairs object store'u incele
```

---

## 📈 Merkeziyetsizlik Roadmap

| Faz | Özellik | VPS Bağımlılığı | ETA |
|-----|---------|----------------|-----|
| ✅ Faz 0 | P2P Chunk Transfer | ❌ Yok | Tamamlandı |
| ✅ Faz 1 | Cryptographic Identity | ❌ Yok | Tamamlandı |
| 🔄 Faz 2 | DHT Domain Registry | ⚠️ Fallback | 2 hafta |
| 🔄 Faz 3 | Identity Export UI | ❌ Yok | 1 hafta |
| 📋 Faz 4 | Local-First Caching | ⚠️ Fallback | 1 hafta |
| 📋 Faz 5 | mDNS Peer Discovery | ❌ Yok | 3 hafta |
| 📋 Faz 6 | Blockchain Domain Registry | ❌ Yok | 2 ay |

**Final Goal:** %95+ merkeziyetsizlik (Sadece bootstrap node dependency)
