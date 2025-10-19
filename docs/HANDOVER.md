# DWeb Hosting Network - Current Handover (October 21, 2025)

## Project Snapshot
- **Short Aim:** Veri yolu peer’lerde kalsın, merkezi bileşenler yalnızca kolaylaştırsın. Şu anda hedeflenen veri akışı: yayınla → alan adı bağla → çöz → göster aşamaları peer-first ilerlesin; çoğaltma + onayla dayanıklılık hissettir; temel metrikler/pano ile sağlık görünür olsun; koordinasyon katmanı dursa bile hizmet soft-fallback ile ayakta kalsın. Uzun vadede merkezi bağımlılıklar adım adım azaltılıp kullanıcıların kendi kaynaklarını ekleyebildiği federatif yapıya evrilecek.
- **Focus:** Decentralised file hosting via Chrome extension + WebRTC peers  
- **Current Branch:** prototype workspace in `d:\Projects\dweb-hosting-network`  
- **Running Services (GCP e2-micro VM, Ubuntu 22.04):**  
  - Signaling - systemd unit `dweb-signaling.service`, default endpoint `ws://34.107.74.70:8787`, config in `/home/behrambazo/dweb-hosting-network/.env`
  - Registry - systemd unit `dweb-registry.service`, default endpoint `http://34.107.74.70:8788`
  - Storage – systemd unit `dweb-storage.service`, default endpoint `http://34.107.74.70:8789`
  - TURN – systemd unit `coturn.service`, credentials defined in `/etc/turnserver.conf` and referenced via `SIGNALING_ICE_SERVERS`
- **Panel defaults:** Extension now seeds staging values (signaling URL/secret, registry & storage URLs + API keys) via `extension/panel/index.html` and persists them to `localStorage` for faster testing. Adjust before pointing to another environment. Persistence toggles under Replication let you enable/disable inline registry chunk copies and storage fallback per browser profile (varsayılan: ikisi de kapalı, peer-first mod).
- **Secrets & Rate Limits:**  
  - Shared secret `choose-a-strong-secret` + registry/storage API keys (`registry-test-key`, `storage-test-key`) are currently hard-coded for staging; rotate for production.  
  - Rate limits available via `REGISTRY_RATE_LIMIT_MAX` / `STORAGE_RATE_LIMIT_MAX`; responses include `RateLimit-*` headers.  
- **Latest manual test:** Manifest `tr-1760869345852-oww5g6` and follow-up `tr-1760870284469-4yvdvs` uploaded from Peer A; second run confirmed end-to-end delivery to remote peer (`peer-pr2egzsj`) over TURN with all chunks acknowledged and registry entry stored.

## What Works Today
- Services run under systemd; `sudo systemctl status dweb-*` shows healthy processes after VM reboot.
- TURN/coturn is active (`sudo systemctl status coturn`); panel logs now show ICE gathering/connected events.
- Panel defaults auto-populate staging endpoints/keys and remember edits locally; manifest fallbacks upload to storage service.
- Registry stores manifests, chunk pointers, and pointer history; scheduled sweep (`REGISTRY_POINTER_SWEEP_INTERVAL_MS`, default 5 min) keeps pointers fresh.
- Storage service handles chunk persistence under `backend/storage-service/storage-data/` (filesystem mode) and supports API-key protected GET/POST.
- Rate limiting on registry/storage is configurable and operating (429 + `RateLimit-*` headers when limits hit).
- Panel replicates chunks to multiple peers (default target 3), enqueues remote jobs, and blocks domain binding until at least two remote ACKs are recorded; the Replication Status view now shows remote replica count, peer list, and last update. Latest cross-network test (staging peer -> remote Wi-Fi) still hits STUN timeout (`code 701`) intermittently, and resolver priority remains peer -> storage pointer -> registry fallback.
- Resolver extension surfaces peer/path stats in the status ribbon (last chunk source, per-source totals, fallback reasons) so peer-only runs are easy to verify without digging into logs.
- Extension CSP/host permissions allow calls to `34.107.74.70`, so both panel and resolver can reach staging endpoints without manual edits.
- Panel persistence controls default to keeping both inline registry data and storage fallback disabled; enable them per test if you need central copies.

## Gaps / Not Production Ready
- **Cross-network validation:** First end-to-end remote test (Wi-Fi → separate Wi-Fi) succeeded; continue repeating under different networks to ensure TURN stability and investigate STUN timeout warnings (`code 701`).
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
- **Phase 2:** Persistent storage (MinIO/S3 integration), registry DB hardening, pointer management automation.
- **Phase 3:** Security enhancements (auth tokens, signature checks, granular rate limits/quota tracking).
- **Phase 4:** UX/tooling (replication dashboard, resolver diagnostics, CLI helpers).

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

## References
- `docs/CHUNK_TRANSFER_PLAN.md` - current transfer protocol
- `docs/PEER_FETCH_PLAN.md` - roadmap for peer-first fetching
- `docs/CHUNK_REPLICATION_PLAN.md` - replication flow design (latest update)
- `docs/CHECKLIST.md` - step-by-step progress tracker
- `docs/PRODUCTION_CHECKLIST.md` - deployment hardening tasks before exposing the prototype
- `docs/testing/CROSS_MACHINE_REPLICATION.md` - cross-network validation plan

Reach out if you need help reproducing the environment or validating the next milestone. Good luck!
