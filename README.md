# DWeb Hosting Network — Baslangic Rehberi

Bu proje, sansursuz ve merkeziyetsiz bir web barindirma agi kurmak icin tasarlanmis yeni nesil bir tarayici uzantisi ve eslik eden altyapiyi tanimlar. Amac; kullanicilarin **hicbir ucret odemeden**, klasik tarayicilarin dogal olarak desteklemedigi `.dweb` benzeri alan adlari uzerinden Web3 uygulamalarini barindirabildigi, yuksek performansli bir P2P agini hayata geçirmek.

---

## 1. Vizyon

- Kullanicilar yalnizca uzantiyi yukleyerek aga katilabilecek.
- Her kullanici panel uzerinden Web3 uygulamasini yukleyip `.dweb` alan adini sahiplenebilecek.
- Icerik dagitimi, yuksek performansli bir P2P katmani uzerinden yapilacak; IPFS benzeri hantal cozumlerin yerine gercek zamanli, optimize edilmis esler arasi transfer kullanilacak.
- Agin tamami ozgur ve acik teknolojilerle kurulacak; merkezi bir otoriteye bagimlilik en aza indirilecek.

---

## 2. Urun Hedefleri

1. **Uzanti-Panel Deneyimi**
   - Chrome/Chromium tabanli tarayici uzantisi (Manifest V3) ile kullanici giris yapabilecek.
   - Uzanti icindeki kontrol paneli veya ayri bir web paneli uzerinden:
     - Web3 uygulamasi dosyalarini P2P aga yukleme
     - Alan adi arama, tescil/transfer
     - Ag sagligi, depolama ve trafik istatistiklerini izleme
     - Manifest kaydi sonrasinda domain dogrulama ve resolver prototipini test etme

2. **Gercek P2P Ag**
   - WebRTC tabanli veri kanallari
   - Kayitli bootstrap sinyal sunuculari, STUN/TURN altyapisi
   - Akilli peer kesfi, icerik cogaltma ve on bellekleme
   - Dusuk gecikme, yuksek throughput ve otomatik yeniden baglanma

3. **Domain & Icerik Yonetimi**
   - Global `.dweb` kayit defteri (PostgreSQL + REST API)
   - Alan adi sahipligi dogrulamasi ve devir surecleri
   - Icerik meta verisi ve surum yonetimi
   - Istemci tarafinda butunluk/dogrulama

4. **Guvenlik ve Uyumluluk**
   - Kimlik dogrulama (JWT/OAuth) ve yetkilendirme katmanlari
   - Icerik sanitizasyonu, kotu niyetli yukleri engelleme
   - Ag ici rate limiting, audit loglari, ihlal raporlama

5. **Performans Odakli Tasarim**
   - Cogaltmali depolama stratejisi (P2P + obje depolama hibriti)
   - Chunk bazli delta senkronizasyonu ve hizli yukleme
   - CDN benzeri hiz icin cografi es secimi

---

## 3. Sistemin Bilesenleri

| Katman | Aciklama | Teknolojiler |
|--------|----------|--------------|
| Tarayici Uzantisi | Kullanici arayuzu, domain yonetimi, icerik yukleme, yerel cache | Manifest V3, React/Vue, TypeScript |
| P2P Katmani | WebRTC data channel, peer discovery, chunk replikasyonu | WebRTC, libp2p konseptleri, STUN/TURN |
| Signaling Servisi | Peer eslesmesi, oturum yonetimi, kimlik dogrulamasi | Node.js, WebSocket, Redis |
| Domain/Registry API | `.dweb` alan adlarini yoneten merkezi koordinasyon | Node.js/NestJS, PostgreSQL |
| Icerik Servisi | Icerik meta verisi, kalici depolama, butunluk dogrulama | Object Storage (MinIO/S3), Redis, Hashing |
| Izleme & Telemetri | Ag sagligi, uyari, kullanim metrikleri | Prometheus, Grafana, Loki |

---

## 4. Kullanim Senaryosu

1. **Uzantiyi Yukle**
   - chrome://extensions → Gelistirici Modu → "Yuklenmemis paket" → proje klasoru.
   - Uzanti yuklendiginde panel `chrome-extension://…/panel.html` uzerinden acilir.

2. **Hesap Olustur / Giris Yap**
   - Uzanti paneli uzerinden kimlik dogrulama (OIDC/JWT).
   - Node API kullanici kayit servisine istekte bulunur.

3. **Uygulama Yukle**
   - Panelde dosyalari sec.
   - Dosyalar chunk’lara bolunur → hashlenir → Signaling servisindeki upload uc noktasi uzerinden P2P eslerine dagitilir.

4. **Domain Tahsis Et**
   - Panelde domain arama → uygun ise kaydet.
   - API, domain’i kullanici hesabina baglar, P2P icerik hash’i ile esler.

5. **Yayinla ve Paylas**
   - Kullanici kendi uzantisindan veya baska kullanicilarin uzantilarindan `https://<alan>.dweb` adresine girdiginde:
     - Resolver, domain meta verisini ceker.
     - Istemci P2P katmanindan chunk’lari indirir; gerekirse obje depodan tamamlar.
     - Uygulama tarayicida calisir.

---

## 5. Proje Yapisi (Planlanan)

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

## 6. Teknoloji Yakini (Onerilen)

- **Frontend / Uzanti:** TypeScript, React veya Svelte, TailwindCSS
- **P2P Katmani:** WebRTC DataChannel, WebSocket signaling, libp2p fikirleri
- **Backend:** Node.js (NestJS), TypeScript, PostgreSQL, Redis, MinIO/S3
- **Oturum Yonetimi:** OpenID Connect, OAuth2.1
- **Gelistirme Araclari:** pnpm, Turborepo, Jest, Playwright
- **Izleme:** Grafana + Prometheus, Loki, OpenTelemetry

---

## 7. Yol Haritasi

### Faz 0 — Tasarim & Hazirlik
- Mimari dokumanlar
- Teknoloji ve protokol secimleri
- Proje yapilandirmasi ve CI sablonlari

### Faz 1 — Minimum P2P MVP
- Gercek signaling servisi (Node.js + WebSocket)
- STUN/TURN yapilandirmasi
- Uzantida WebRTC baglanti kurulumunun calisir hale gelmesi
- Dosya yukleyip iki istemci arasinda paylasilabilir MVP

### Faz 2 — Domain & Panel
- Registry API + PostgreSQL semasi
- Uzantida domain yonetimi
- Icerik meta verisi ve hash bazli dogrulama

### Faz 3 — Guvenlik & Performans
- Kimlik dogrulama, yetkilendirme, rate limiting
- Chunk replikasyon stratejileri, peer skorlamasi
- Icerik butunluk dogrulama, fallback depo entegrasyonu

### Faz 4 — Operasyon & Uretim
- CI/CD pipeline, containerizasyon
- Izleme, logging, alarm altyapisi
- Surumleme, beta sureci, dokumantasyon

---

## 8. Kurulum & Calistirma (Gelecek Plan)

> Proje henuz kurulabilir durumda degil; asagidaki adimlar tamamlandiginda devreye alinacak.

1. **Bagimliliklar**
   - Node.js 20+, pnpm, Docker, Git, PowerShell 7+
2. **Repo’yu klonla**
   ```powershell
   git clone <repo-url> dweb-hosting-network
   cd dweb-hosting-network
   ```
3. **Workspace’i hazırla**
   ```powershell
   pnpm install
   pnpm run bootstrap
   ```
4. **Yerel servisleri baslat**
   ```powershell
   pnpm --filter signaling-service dev
   pnpm --filter registry-service dev
   pnpm --filter extension dev
   ```
5. **Uzantiyi yukle**
   - `extension/dist` klasorunu Chrome’a yukle
   - Panel arayuzunu ac, test hesabi ile giris yap

---

## 9. Katki Kurallari (Taslak)

1. Tum yeni ozellikler icin tasarim taslagi veya issue ac.
2. Kod standartlari: ESLint + Prettier + TypeScript strict mode.
3. Test yazmadan PR gonderme.
4. Guvenlik etkisi olan degisiklikler icin review zorunlu.

---

## 10. Sonraki Adimlar

- `docs/ARCHITECTURE_PLAN.md` dosyasini detaylandirmak.
- Signaling servisi icin POC hazirlamak (Node.js + ws).
- Uzanti iskeletini (Manifest + temel panel) hazirlayip gercek P2P baglantilarini test etmek.

Bu rehber, projenin amaci ve kapsamini netlestirmek icin cikis noktasi sunar. Bir sonraki adim icin hazirsan mimari plan dokumanina gecip somut gelistirme adimlarini baslatabiliriz.

---

## 11. Ortam Degiskenleri

Hizli baslangic icin depodaki `.env.example` dosyasini `.env` olarak kopyala ve ortam degiskenlerini duzenle:

```powershell
cp .env.example .env
```

Temel ayarlar:

- **Signaling:** `SIGNALING_SHARED_SECRET`, `SIGNALING_ICE_SERVERS`
- **Registry:** `REGISTRY_API_KEYS`, `REGISTRY_RATE_LIMIT_MAX`, `REGISTRY_POINTER_SWEEP_INTERVAL_MS`
- **Storage:** `STORAGE_BACKEND`, `STORAGE_API_KEYS`, `STORAGE_RATE_LIMIT_MAX`, `STORAGE_DATA_DIR`

Panel ve resolver arayüzleri, bu anahtarları yerel depoda saklar; üretim ortamlarında değerleri gizli yöneticilerle yönetin ve düzenli olarak rotasyon uygulayın.

---

## 12. MVP Calistirma Talimatlari (Simdiki Durum)

1. **Bagimliliklari kur**
   ```powershell
   npm install
   ```
2. **Signaling servisini baslat**
   ```powershell
   npm run --workspace @dweb/signaling-service dev
   ```
   - Varsayilan port: `ws://localhost:8787`
   - TURN/STUN bilgilerini tum peer'lara yaymak icin calistirmadan once `SIGNALING_ICE_SERVERS='[{"urls":"stun:stun.example.com"},{"urls":"turn:turn.example.com","username":"user","credential":"pass"}]'` ortam degiskenini ayarla.
   - (Opsiyonel) Registry servisi: `npm run --workspace @dweb/registry-service dev`
   - (Opsiyonel) Storage servisi: `npm run --workspace @dweb/storage-service dev`
     - Varsayilan mod dosya sistemi (`storage-data/` klasoru); `STORAGE_BACKEND=s3` ile MinIO/S3 kullanimi icin bucket/prefix ayarlayabilirsin.
     - Onemli ortam degiskenleri:
       - `STORAGE_BACKEND=filesystem|s3|memory`
       - `STORAGE_DATA_DIR=./storage-data` (filesystem icin hedef klasor)
       - `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, opsiyonel `STORAGE_S3_ENDPOINT`, `STORAGE_S3_PREFIX`, `STORAGE_S3_FORCE_PATH_STYLE=true`
       - AWS kimligi icin standart `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
3. **Uzantiyi Chrome/Chromium'a yukle**
   - chrome://extensions → Gelistirici modunu ac
   - “Yuklenmemis paket” → `dweb-hosting-network/extension` klasorunu sec
4. **Paneli ac ve baglanti test et**
   - Uzanti simgesine tikla veya yeni sekmede `chrome-extension://<id>/panel/index.html` (ID degeri chrome://extensions sayfasinda gorunur)
   - Signaling URL alanina `ws://localhost:8787` gir, baglan de
   - Log bolumunde kayit mesajlarini ve peer listesini gor
5. **WebRTC veri kanali testi**
   - Farkli bir Chrome profili veya incognito penceresinde ayni uzantiyi yukle
   - Iki panel de bagli iken listeden diger peer'i secip "Open Data Channel" de
   - "Send" ile gonderilen mesajlar diger panelde "Data Channel" logunda gorunmeli
6. **Dosya transferi denemesi**
   - Data channel acikken `Select file` alanindan 5 MB ve altinda bir dosya sec
   - "Send File" ile manifest ve chunklar gonderilir; karsi panelde parca ilerlemesi ve indirilebilir baglanti gorunur
   - Manifest kaydindan sonra panel gecikme/kapasite skoruna gore en uygun peer'leri siralayip replikasyon kuyrugunu otomatik baslatir; `Channel` log'undan ack/nack ve retry durumlarini izle.
   - Auto-select kapatilarak manuel peer secimi yapabilir, manuel modda isaretlenen peer'lar sirayla replikasyon hedefi olur.
   - Replication Status paneli, her hedef peer icin chunk ilerlemesini (acked/pending/failed) canli olarak gosterir.
7. **Registry kaydi (opsiyonel)**
   - Registry servisi calisiyorsa paneldeki `Registry URL` dogruysa dosya transferi tamamlaninca manifest chunk verileri ile birlikte otomatik kaydedilir
   - Domain ve owner alanlarini doldurup `Register Domain` ile `.dweb` kaydini yapabilir, logdan dogrulama bilgilerinin geldigini gorebilirsin
8. **Resolver prototipini kullan**
   - Uzantiyi reload ettikten sonra yeni sekme acildiginda `resolver/index.html` acilir (service worker chunk cache ile birlikte)
   - Domain ve registry bilgisi girip "Resolve" dediginde resolver once peer chunk cevaplarini deneyecek, sonra registry fallback ile manifest chunklarini indirecek
   - Resolver chunk yanitlarinda `replicas` bilgisi loglanir; ilerleyen surumlerde bu peer listesi uzerinden gercek P2P fetch yapilacaktir
   - Uzantiyi reload ettikten sonra yeni sekme actiginda `resolver/index.html` acilir (service worker chunk cache ile birlikte)
   - Domain ve registry bilgisi girip "Resolve" dediginde resolver once peer chunk cevaplarini deneyecek, sonra registry fallback ile manifest chunklarini indirecek

> Su anda P2P mesajlasma ve tek dosya transferi calisiyor; domain islemleri ve kalici depolama ilerleyen fazlarda eklenecek.







## 13. Gelistirme Notlari

- xtension/panel/panel.js icindeki STORE_CHUNK_DATA_IN_REGISTRY bayragi, manifest kaydi sirasinda chunk verisinin registry'ye gonderilip gonderilmeyecegini belirler.
- Resolver arayuzundaki Allow registry fallback secenegi, peer chunk yaniti gelmezse registry'ye dusup dusmemeyi kontrol eder.

