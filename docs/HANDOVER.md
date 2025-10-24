# DWeb Hosting Network - Current Handover (October 22, 2025)

## Project Snapshot
- **Short Aim:** Veri yolu peer’lerde kalsın, merkezi bileşenler yalnızca kolaylaştırsın. Şu anda hedeflenen veri akışı: yayınla → alan adı bağla → çöz → göster aşamaları peer-first ilerlesin; çoğaltma + onayla dayanıklılık hissettir; temel metrikler/pano ile sağlık görünür olsun; koordinasyon katmanı dursa bile hizmet soft-fallback ile ayakta kalsın. Uzun vadede merkezi bağımlılıklar adım adım azaltılıp kullanıcıların kendi kaynaklarını ekleyebildiği federatif yapıya evrilecek.
- **Focus:** Decentralised file hosting via Chrome extension + WebRTC peers  
- **Current Branch:** `stable-without-offscreen` - working peer connections via panel (background peer disabled)
- **Working State:** 3+ peers successfully connecting via WebRTC, discovering each other, and establishing P2P connections
- **Running Services (GCP e2-micro VM, Ubuntu 22.04, `34.107.74.70`):**
  - Signaling - systemd unit `dweb-signaling.service`, default endpoint `ws://34.107.74.70:8787`, config in `/home/behrambazo/dweb-hosting-network/.env`
  - Registry - systemd unit `dweb-registry.service`, default endpoint `http://34.107.74.70:8788`
  - Storage – systemd unit `dweb-storage.service`, default endpoint `http://34.107.74.70:8789`
  - TURN – systemd unit `coturn.service`, credentials defined in `/etc/turnserver.conf` and referenced via `SIGNALING_ICE_SERVERS`
- **Panel defaults:** Extension now seeds staging values (signaling URL/secret, registry & storage URLs + API keys) via `extension/panel/index.html` and persists them to `localStorage` for faster testing. Adjust before pointing to another environment. Persistence toggles under Replication let you enable/disable inline registry chunk copies and storage fallback per browser profile (varsayılan: ikisi de kapalı, peer-first mod).
- **Secrets & Rate Limits:**  
  - Shared secret `choose-a-strong-secret` + registry/storage API keys (`registry-test-key`, `storage-test-key`) are currently hard-coded for staging; rotate for production.  
  - Rate limits available via `REGISTRY_RATE_LIMIT_MAX` / `STORAGE_RATE_LIMIT_MAX`; responses include `RateLimit-*` headers.  
- **Latest manual test:** Manifest `tr-1760869345852-oww5g6` and follow-up `tr-1760870284469-4yvdvs` uploaded from Peer A; second run confirmed end-to-end delivery to remote peer (`peer-pr2egzsj`) over TURN with all chunks acknowledged and registry entry stored.

## What Works Today (Verified October 22, 2025)
- **✅ Peer-to-peer connections working:** Panel establishes WebRTC connections via signaling server
- **✅ Multi-peer discovery:** 3+ peers tested simultaneously across Chrome/Brave browsers
- **✅ Network status accurate:** Panel displays PEER/RELAY/UNKNOWN status correctly
- **✅ Auto-connect enabled:** Panel automatically connects to signaling server on load
- Services run under systemd; `sudo systemctl status dweb-*` shows healthy processes after VM reboot
- TURN/coturn is active (`sudo systemctl status coturn`); panel logs now show ICE gathering/connected events
- Panel defaults auto-populate staging endpoints/keys and remember edits locally; manifest fallbacks upload to storage service
- Registry stores manifests, chunk pointers, and pointer history; scheduled sweep (`REGISTRY_POINTER_SWEEP_INTERVAL_MS`, default 5 min) keeps pointers fresh
- Storage service handles chunk persistence under `backend/storage-service/storage-data/` (filesystem mode) and supports API-key protected GET/POST
- Rate limiting on registry/storage is configurable and operating (429 + `RateLimit-*` headers when limits hit)
- Panel replicates chunks to multiple peers (default target 3), enqueues remote jobs, and blocks domain binding until at least two remote ACKs are recorded
- Resolver extension surfaces peer/path stats in the status ribbon (last chunk source, per-source totals, fallback reasons)
- Extension CSP/host permissions allow calls to `34.107.74.70`, so both panel and resolver can reach staging endpoints without manual edits
- Panel persistence controls default to keeping both inline registry data and storage fallback disabled

## Known Issues / Limitations
- **Background peer disabled:** Chrome Manifest V3 service workers don't support RTCPeerConnection API. Offscreen document API has timeout/lifecycle issues. Current solution: all WebRTC runs in panel page.
- **Panel must stay open:** Peers only connect when panel tab is active (not background). This is acceptable for prototype but needs offscreen document fix for production.
- **UI refresh delays:** Dashboard stats update when switching tabs, not real-time. Minor visual issue, doesn't affect functionality.
- **Cross-network validation:** Continue testing under different NAT scenarios to ensure TURN stability.
- **Replication strategy:** Only one target peer per job; multi-peer fan-out & health scoring still backlog.
- **Security:** Shared API keys only; need per-tenant auth, quotas, key rotation, manifest signing, and peer authentication.
- **TLS / Networking:** Endpoints currently plaintext (`http://` / `ws://`); need reverse proxy + certificates. No WAF/firewall hardening yet.
- **Observability:** Logs via `journalctl`; no central log aggregation or metrics dashboards.
- **Automation:** Manual VM setup; need infrastructure as code, CI smoke tests, and scripted deploys before production.

## Active Initiative (Phase 1)
Goal: **real peer-to-peer replication across networks**  
Key tasks (in progress):
1. Finalise TURN credentials and keep repeating cross-network replication plan (different ISPs / NAT scenarios) to ensure TURN stability and investigate STUN timeout warnings.
2. Extend replication queue for multi-peer targets (parallel peers, richer metrics).

## Near-Term Roadmap (Goal & Outcome Centric)

### Peer-Only Veri Hattı
- Yayınlanan içerik eşler üzerinde saklansın; merkezi depolama varsayılan olarak kapalı kalsın.
- Birden fazla eşe çoğaltma + onay eşiği ile içerik tamamlanmış sayılabilsin.
- Merkezi geriye dönüş yalnızca yumuşak yedek olarak dursun; başarısızlıkta kullanıcıya anlaşılır geri bildirim verilsin.

### Publish → Bind → Resolve Akışını Cilalama
- Yayınlama, alan adı bağlama ve çözümleme tek ve akıcı bir akış olarak ilerlesin; durum ve ilerleme net görünsün.
- Alan adı kaydı imzalı metadata ile ilişkilensin ve birden çok keşif/okuma kaynağına aynı anda ilan edilsin.
- Çözümleme sırası eş-öncelikli olsun; merkezi geriye dönüş sadece opsiyonel kalsın.

### Dayanıklılık & P2P Deneyimi
- Eş sağlığı ve erişilebilirliği göz önünde bulundurularak çoğaltma kararları verilsin.
- Farklı ağ koşullarında erişim akıcı kalsın; bağlantı sorunları anlaşılır şekilde raporlansın.
- Bağlantı/geri dönüş oranları ve zamanlamalar izlenip görünür olsun.

### Gözlemlenebilirlik
- Yayınlama, bağlama ve çözümleme akışları için temel metrikler ve son adımda nereden yüklendiği bilgisi görünür olsun.
- Gecikme ve başarı oranları basit bir pano üzerinden takip edilebilsin.
- TURN fallback / STUN `701` olaylarını toplamak için aşağıdaki adımları uygulayın:
  1. `sudo journalctl -u dweb-signaling -f` ile canlı logu açın; bağlantı denemeleri sırasında TURN fallback ve `code=701` satırlarını kaydedin.
  2. Tarayıcıda `chrome://webrtc-internals` sayfasını açıp ilgili RTCPeerConnection’ı seçin; test boyunca “Create Dump” ile JSON çıktı alın.
  3. Panel/Resolver konsollarını (DevTools) açıp `statusLog` / `channelLog` ve yeni status badge’lerinde görünen fallback nedenlerini not edin.
  4. Test sonunda journal çıktısını, WebRTC dump dosyasını ve konsol loglarını tarihli klasör altında saklayın; raporlama panosu bu verilere göre güncellenecek.

### Sistem Dayanıklılığı
- Koordinasyon bileşenleri geçici olarak durduğunda bile eşler ve yerel önbellek ile hizmet devam edebilsin.
- Peer-only mod aktifken kullanıcı mesajları ve durum yönetimi net olsun.

### Kısa Dönem Sprint Odakları
- Çoklu eşe çoğaltma + onay eşiğini tamamla.
- Varsayılanı peer-first yap ve yumuşak merkezi geriye dönüşü devrede tut.
- Temel gözlem ve pano ile akışların sağlık durumunu göster.
- Uçtan uca gösterim: küçük bir demo ile peer-only çalıştığını kanıtla.
- Kullanıcıya dönük kısa rehber: “Peer-only nasıl test edilir?” ve “Merkezi servis kesintisi davranışı”.

### Başarı Görünümü
- Panelden yüklenen uygulama alan adına anında bağlanır ve içerik ilk denemede eşlerden yüklenir.
- Bazı eşler çevrimdışı olsa da erişim kesintisiz sürer.
- Panoda gecikme, ilk bayta kadar süre ve geriye dönüş oranları okunaklıdır.
- Koordinasyon katmanı yalnızca rahatlatıcı rol oynar; veri yolu eşlerdedir.
- “Kullanıcı kendi sunucusunu eklesin” ve “tam federasyon” gelecek aşamaların vizyonu olarak kaydedilmiştir (şimdilik kapsam dışı).

## Upcoming Phases

## Next Version: P2P Core (peer-only)

Amaç: Tüm veri akışını eşlere (peers) taşımak; VPS sadece hızlandırıcı/bridge olarak kalsın. Domain ve manifest kayıtları imzalı/dağıtık bir modele evrilecek; registry yazma yolu kapatılıp salt-okuma cache/bridge rolüne indirgenecek.

Branching
- [ ] Mevcut yapı yedek dal: `feat/cloud-gateway-and-fallback`
- [ ] Yeni geliştirme dalı: `feat/p2p-core-peer-only`

Sprint 1 — Tam P2P preset + peer‑only resolver
- [ ] Panel’e “Tam P2P modu” preset ekle (varsayılan yap):
  - [ ] Registry inline chunk copy = kapalı
  - [ ] Storage fallback = kapalı
  - [ ] Gateway fallback = kapalı (PAC devre dışı / sadece peer akışı)
- [ ] Resolver’da peer-only modu uygula; peer yoksa açık hata döndür.
- [ ] Panel “Peer-only nasıl test edilir?” mini rehberi ekle.

Sprint 2 — İmzalı domain/manifest (CRDT taslak)
- [ ] Kayıt formatı: `{ domain, manifestId, owner, ts, signature }`
- [ ] İmzalama/doğrulama: panelde anahtar yönetimi + imza; resolver’da doğrulama
- [ ] Gossip/CRDT senkronizasyon modülü (delta/append‑only)
- [ ] Registry’yi salt‑okunur cache/bridge moduna çekme (yazma P2P)

Sprint 3 — Peer discovery & seeding
- [ ] Çoklu tracker desteği + manuel seed ekleme
- [ ] WebRTC-DHT/announce mekanizması
- [ ] Replikasyon/seeding politikası ve saygınlık puanı taslağı

Sprint 4 — Geçiş ve doğrulama
- [ ] Panel/Resolver okuma yolunu CRDT’ten besle
- [ ] P2P‑only demo (peers>0 iken içerik eşlerden; peers=0 iken beklenen hata)
- [ ] Registry/Storage, opsiyonel hızlandırıcı olarak seçilebilir olsun

Gözlemlenebilirlik (lokal)
- [ ] Pano metriklerini (Direct, TTFB, Replication) backend’siz lokal istatistiklerle doldur
- [ ] Resolver/Panel event’lerini minimal boyutta `chrome.storage.local` altında topla

Çıktı Kriterleri
- [ ] `example.dweb` içerikleri peers üzerinden geliyor; merkezi veri akışı yok
- [ ] Domain/manifest okuma P2P CRDT’ten; registry sadece cache/bridge
- [ ] Kullanıcı için “Tam P2P” varsayılan ve dokümante
- **Phase 2:** Persistent storage (MinIO/S3 integration), registry DB hardening, pointer management automation.
- **Phase 3:** Security enhancements (auth tokens, signature checks, granular rate limits/quota tracking).
- **Phase 4:** UX/tooling (replication dashboard, resolver diagnostics, CLI helpers).

## GCP VM Access

**VM Instance Details:**
- **Name:** dweb-staging (or check GCP Console for exact name)
- **External IP:** `34.107.74.70`
- **Zone:** `us-central1-a` (verify in GCP Console)
- **Machine Type:** e2-micro (2 vCPU, 1 GB memory)
- **OS:** Ubuntu 22.04 LTS

**How to Connect:**

1. **Via GCP Console (easiest):**
   - Go to https://console.cloud.google.com/compute/instances
   - Find the VM instance
   - Click "SSH" button to open browser-based terminal

2. **Via gcloud CLI:**
   ```bash
   gcloud compute ssh behrambazo@dweb-staging --zone=us-central1-a
   ```
   (Install gcloud CLI first: https://cloud.google.com/sdk/docs/install)

3. **Via SSH key (if configured):**
   ```bash
   ssh -i ~/.ssh/your-key behrambazo@34.107.74.70
   ```

**Firewall Rules:**
- Port 8787 (WebSocket signaling) - open
- Port 8788 (Registry HTTP) - open
- Port 8789 (Storage HTTP) - open
- Port 3478 (TURN/STUN) - open
- Port 22 (SSH) - open (restrict to your IP in production)

**Important Files:**
- Project directory: `/home/behrambazo/dweb-hosting-network/`
- Environment config: `/home/behrambazo/dweb-hosting-network/.env`
- TURN config: `/etc/turnserver.conf`
- Systemd services: `/etc/systemd/system/dweb-*.service`
- Storage data: `/home/behrambazo/dweb-hosting-network/backend/storage-service/storage-data/`

**Common Commands:**
```bash
# Check all service statuses
sudo systemctl status dweb-signaling dweb-registry dweb-storage coturn

# View live logs
sudo journalctl -u dweb-signaling -f
sudo journalctl -u dweb-registry -f

# Restart services after config change
sudo systemctl restart dweb-signaling
sudo systemctl restart dweb-registry

# Edit environment variables
cd /home/behrambazo/dweb-hosting-network
nano .env
# Then restart affected services
```

## How to Work
1. **Manage services on staging VM**  
   - Check status: `sudo systemctl status dweb-signaling dweb-registry dweb-storage coturn`
   - Restart after config changes: `sudo systemctl restart dweb-signaling dweb-registry dweb-storage`
   - Environment variables in `/home/behrambazo/dweb-hosting-network/.env`; edit + restart service to apply.
2. **Panel / Resolver**  
   - Load extension via `chrome://extensions` → Developer Mode → Load unpacked → `extension/`.  
   - Defaults now point to staging IP/keys; adjust as needed. Credentials persist in `localStorage` (`SIGNALING_AUTH_STORAGE_KEY`, etc.).
- Replication section toggles ("Store chunk copies in registry" / "Upload fallback copies to storage service") let you dial central persistence per test; both ship disabled for peer-first mode, and the register-domain button unlocks automatically once the remote replica quorum is reached.
3. **Testing**  
   - Follow `docs/testing/CROSS_MACHINE_REPLICATION.md` for cross-network validation.  
   - Manifest endpoints: `POST /manifests`, `GET /manifests/:id`, `GET /manifests/:id/chunks/:index/pointers` (include API key header).
4. **Storage options**  
   - Filesystem default stores chunks under `backend/storage-service/storage-data/`.  
   - To test S3/Cloud Storage, set `STORAGE_BACKEND=s3` and provide `STORAGE_S3_*` vars, then restart storage service.
5. **Registry**  
   - Domain registration via panel (requires manifest ID, domain, owner).  
   - `REGISTRY_POINTER_SWEEP_INTERVAL_MS` controls pointer cleanup cadence.
6. **TURN**  
   - Credentials in `/etc/turnserver.conf`; restart with `sudo systemctl restart coturn` after changes.  
   - Update `SIGNALING_ICE_SERVERS` JSON in `.env` when credentials or endpoints change.
7. **Feature flags / Defaults**  
   - Persistence defaults (`PERSISTENCE_DEFAULTS`) and helpers in `extension/panel/panel.js`; UI toggles persist per profile via `localStorage`.  
   - Staging defaults (`DEFAULT_*` constants) live in `extension/panel/panel.js` & `panel/index.html`; edit before shipping to production environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome/Brave Browsers                    │
│  ┌────────────────┐              ┌────────────────┐         │
│  │  DWeb Panel    │              │  DWeb Resolver │         │
│  │  (Extension)   │              │  (Extension)   │         │
│  │                │              │                │         │
│  │  • WebRTC      │              │  • Fetch .dweb │         │
│  │  • Peer Mgmt   │              │  • Render app  │         │
│  │  • Publishing  │              │  • Show stats  │         │
│  └────────┬───────┘              └────────┬───────┘         │
└───────────┼──────────────────────────────┼─────────────────┘
            │                              │
            │ WebSocket (8787)             │ HTTP (8788, 8789)
            │                              │
┌───────────▼──────────────────────────────▼─────────────────┐
│              GCP VM (34.107.74.70)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Signaling   │  │   Registry   │  │   Storage    │     │
│  │  Server      │  │   Service    │  │   Service    │     │
│  │              │  │              │  │              │     │
│  │  :8787 (WS)  │  │  :8788 (HTTP)│  │  :8789 (HTTP)│     │
│  │              │  │              │  │              │     │
│  │  • Peer disc │  │  • Manifests │  │  • Chunks    │     │
│  │  • ICE relay │  │  • Domains   │  │  • Fallback  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐                                          │
│  │  TURN/STUN   │                                          │
│  │  (coturn)    │                                          │
│  │  :3478       │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘

            P2P Data Flow (Direct WebRTC)
            ═══════════════════════════════
    Peer A ←──────────────────────────────→ Peer B
    Peer A ←──────────────────────────────→ Peer C
```

**Key Points:**
- Peers connect directly via WebRTC after signaling handshake
- TURN server only used when direct connection fails (NAT traversal)
- Registry/Storage are fallback - peer-to-peer is primary path
- Panel must stay open for peer to remain active (Manifest V3 limitation)

## Troubleshooting Common Issues

### Panel shows "Network Status: UNKNOWN"
**Causes:**
- Signaling server down or unreachable
- Invalid WebSocket URL in Settings
- Network blocking WebSocket connections

**Fix:**
1. Check signaling server: `sudo systemctl status dweb-signaling`
2. Test WebSocket: `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://34.107.74.70:8787`
3. In panel Settings, verify Signaling URL is `ws://34.107.74.70:8787`
4. Check browser console for connection errors

### Peers not discovering each other
**Causes:**
- Panel not open on one or more browsers
- Signaling server not broadcasting peer list
- Different signaling URLs configured

**Fix:**
1. Ensure panel is open and "Network Status" shows PEER or RELAY
2. Check signaling logs: `sudo journalctl -u dweb-signaling -n 50`
3. Look for "peer-joined" and "peer-list" messages in panel console
4. Verify all peers use same signaling URL

### "RTCPeerConnection is not defined" error
**Cause:** Background script trying to use WebRTC (not supported in service workers)

**Fix:** This should already be fixed in `stable-without-offscreen` branch. If you see this:
1. Verify you're on correct branch: `git branch --show-current`
2. Check background.js has `backgroundPeerEnabled = false`
3. Reload extension completely

### Offscreen document timeout
**Cause:** Chrome offscreen API has lifecycle/timing issues

**Fix:** Use `stable-without-offscreen` branch. Offscreen document approach postponed until Chrome fixes API.

### Extension won't load
**Causes:**
- Syntax error in JavaScript
- Invalid manifest.json
- Missing files

**Fix:**
1. Check chrome://extensions/ page for error details
2. Open service worker console (click "service worker" link)
3. Look for red error messages
4. Verify `extension/manifest.json` is valid JSON

### Services not starting after VM reboot
**Fix:**
```bash
# Check which services failed
sudo systemctl status dweb-signaling dweb-registry dweb-storage coturn

# Check service logs for errors
sudo journalctl -u dweb-signaling -n 50

# Common issue: Node.js not in PATH for systemd
# Edit service file and add full path to node binary
sudo nano /etc/systemd/system/dweb-signaling.service
# Change ExecStart=/usr/bin/node ...

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart dweb-signaling
```

## Quick Start for New AI Agent

1. **Clone and setup:**
   ```bash
   git clone [repo-url]
   cd dweb-hosting-network
   git checkout stable-without-offscreen
   ```

2. **Load extension:**
   - Open Chrome/Brave
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension/` folder

3. **Open panel:**
   - Press `Ctrl+Shift+D` or click extension icon → Open Panel
   - Should auto-connect to signaling server
   - Network Status should show "PEER"

4. **Test with multiple browsers:**
   - Repeat steps 2-3 in Chrome AND Brave
   - Check "Connected Peers" count increases
   - Both panels should discover each other

5. **Check GCP services:**
   ```bash
   # SSH to VM (see GCP VM Access section above)
   sudo systemctl status dweb-signaling dweb-registry dweb-storage coturn
   ```

6. **Read architecture docs:**
   - Start with this HANDOVER.md
   - Then `docs/CHUNK_TRANSFER_PLAN.md`
   - Then `docs/CHUNK_REPLICATION_PLAN.md`

## References
- `docs/CHUNK_TRANSFER_PLAN.md` - current transfer protocol
- `docs/PEER_FETCH_PLAN.md` - roadmap for peer-first fetching
- `docs/CHUNK_REPLICATION_PLAN.md` - replication flow design (latest update)
- `docs/CHECKLIST.md` - step-by-step progress tracker
- `docs/PRODUCTION_CHECKLIST.md` - deployment hardening tasks before exposing the prototype
- `docs/testing/CROSS_MACHINE_REPLICATION.md` - cross-network validation plan

Reach out if you need help reproducing the environment or validating the next milestone. Good luck!
