# Peer-Only Smoke Test Checklist

## Prerequisites
- Extension yüklenmiş ve güncel panel/resolver sürümü aktif.
- Storage fallback ve inline registry toggles kapalı (varsayılan peer-first).
- En az iki uzak peer hazır (mümkünse farklı ağlarda).
- Signaling/TURN servisleri sağlıklı (`sudo systemctl status dweb-signaling coturn`).

## Adımlar
1. **Panel**: Signaling’e bağlan ve hedef peer listesinin güncel olduğunu doğrula.
2. **Publish**: Küçük bir uygulamayı yükle; yükleme biter bitmez replication panelindeki quorum sayacını takip et.
3. **Replication**: En az iki uzak ACK gelene kadar bekle; register-domain düğmesinin kilitten çıktığını doğrula.
4. **Bind**: Domain’i bağla ve registry loglarında kaydın güncellendiğini kontrol et.
5. **Resolve**: Resolver eklentisiyle domain’i çöz; status şeritinde son chunk kaynağının “Peer” ve toplamların peer ağırlıklı olduğunu doğrula.
6. **Fallback Kontrolü**: Loglarda storage/registry fallback nedeninin görünmediğini, badge’in fallback metni göstermediğini teyit et.

## Notlar
- TURN/ICE telemetri için `docs/HANDOVER.md` içindeki ölçüm adımlarını eş zamanlı uygula.
- Test sonunda peer loglarını ve resolver status şeridinin ekran görüntüsünü arşivle (bulgular raporlama panosuna işlenecek).
