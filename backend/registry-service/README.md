# DWeb Registry Service (MVP)

Bu servis, DWeb Hosting Network icin domain ve icerik manifest kayitlarini yonetir. Su anda bellek ici (in-memory) saklama kullanir; ilerleyen asamalarda PostgreSQL/Redis gibi kalici depolar ile degistirilecektir.

## Calistirma

    npm run --workspace @dweb/registry-service dev

Varsayilan port: http://localhost:8788

## API Ozeti

### GET /health
- Servisin ayakta oldugunu dogrular.

### POST /manifests
- Icerik manifesti kaydeder.
- Ornek govde:
    {
      "transferId": "tr-123",
      "fileName": "app.html",
      "fileSize": 34567,
      "mimeType": "text/html",
      "chunkSize": 262144,
      "chunkCount": 2,
      "sha256": "base64hash",
      "chunkHashes": ["h1", "h2"],
      "replicas": ["peer-a", "peer-b"]
    }

### GET /manifests/:manifestId
- ID ile manifest doner.

### PATCH /manifests/:manifestId/replicas
- Bir manifest icin replica listelerini gunceller.
- Ornek govde:
    {
      "peerId": "peer-b",
      "chunkIndexes": [0, 1, 2]
    }
- chunkIndexes alanini gondermezsen tum chunklar icin peer eklenir.

### GET /manifests/:manifestId/chunks/:index
- Belirli bir chunk'i (base64) ve mevcut replikalarini doner.

### POST /domains
- Yeni domain kaydi yaratir.
- Ornek govde:
    {
      "domain": "example.dweb",
      "owner": "user-123",
      "manifestId": "tr-123",
      "replicas": ["peer-a", "peer-b"]
    }

### PATCH /domains/:domain
- Domain manifest veya replikalarini gunceller.

### GET /domains/:domain
- Domain bilgisi ve bagli manifest ID'sini doner.

> Not: Tum kayitlar bellek ici tutuldugundan servis yeniden baslatildiginda veriler sifirlanir.
