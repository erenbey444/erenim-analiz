# Greyhound veri güncellemeleri ve yayına geçiş

## Şu anki durum

Tasarım kullanıcı tarafından onaylandı. `public/greyhound/index.html` onaylanan arayüzün gerçek 93 yarışlık kopyasıdır. Mevcut futbol uygulamasının giriş noktaları değiştirilmedi. Bu dosya hâlâ tarayıcıda çalışan ön izlemedir; merkezi arşiv, gerçek yönetici girişi veya otomatik aktarım bağlı değildir. Ön izlemede içe aktarılan veriler sayfa yenilenince kaybolur; üretim için bu davranış kabul edilmez.

Mevcut Vercel projesi ve aynı adlı Supabase projesi bulundu. Supabase tablo listeleme ve `select 1` sorguları bağlantı zaman aşımıyla başarısız oldu; proje ayrıntısı ACTIVE_HEALTHY döndü. Başarısız bağlantı çözülmeden şema, kullanıcı veya üretim ayarları değiştirilmedi. Yeni ücretli proje açılmadı.

## İlk üretim akışı: yönetici Excel yüklemesi

1. Yetkili yönetici Excel'i seçer. Dosya şablonu, kayıt kimlikleri, altı oran ve sonuç alanları sunucuda doğrulanır. Oranlar tam sayı yüzde birimlerine çevrilir; yuvarlanmaz.
2. Sunucu içe aktarmayı önce taslak olarak kaydeder; yeni, aynı, tamamlanan, çakışan ve reddedilen kayıtları sayar.
3. Kullanıcı kontrol özetini görür. Yalnız yeni yarışlar ve izin verilmiş düzeltmeler işlemsel şekilde merkezi arşive yazılır.
4. Her değişiklik önceki değerler, kaynak dosya özeti, zaman ve kullanıcı bilgisiyle denetim kaydına eklenir.
5. Site verileri merkezi arşivden okur; kullanıcıların yeniden HTML indirmesi veya site kodunun her veri için tekrar yayımlanması gerekmez.

Örnek: mevcut arşiv 93 kayıt ve yeni dosya aynı 93 kayıt artı 27 yeni yarış içeriyorsa, toplam 120 olur. Mevcut kayıtlarda farklılık varsa otomatik olarak aynı sayılmaz; inceleme listesine girer.

## Kayıt birleştirme kuralları

| Gelen kayıt | İşlem |
|---|---|
| Yeni ve geçerli yarış ID | Yeni kayıt |
| Aynı ID ve aynı içerik | Atla; mükerrer say |
| Aynı ID, önceden boş sonuç şimdi dolu | Tamamlama adayı; kaynağı doğrula ve değişiklik geçmişini koru |
| Aynı ID, önceden dolu sonuç şimdi farklı | Çakışma; yetkili incelemesi olmadan üzerine yazma |
| Oranlar veya yarış zamanı farklı | Kimlik/kaynak incelemesi; otomatik birleştirme yapma |
| OCR çıktısında çelişki | Karantinada tut; tamamlanmış sonuç üretme |
| Eski OCR sonucu kullanıcı düzeltmesiyle çelişiyor | Kullanıcı düzeltmesini koru; yeni OCR eski düzeltmeyi silmez |

Kimlik anahtarı sağlayıcı/modül ve sağlayıcının belgelenmiş yarış ID kapsamına göre seçilmeli. Aynı altı oran farklı yarışlarda tekrar edebileceğinden oran dağılım anahtarı benzersiz olay kimliği olarak kullanılmaz. `Sıra No` dosya içindeki kaynağı göstermek içindir; mükerrer anahtarı değildir.

## İkinci aşama: bilgisayardan otomatik aktarım

Windows kayıt programının kullandığı kalıcı arşiv yolu henüz erişilip doğrulanmadı. Bağımsız yardımcı program yazımı bitmiş kopyayı veya tutarlı SQLite yedeğini salt okunur inceler. Kayıt programını durdurmaz, üretim dosyasına yazmaz. Excel yalnızca elle dışa aktarılıyorsa, otomasyon için gerçek kalıcı veri kaynağı veya programın otomatik dışa aktarımı gerekir.

Yardımcı kendi klasöründe kuyruk ve aktarım işaretini saklar. Ağ kesilirse tekrar dener; sunucu onaylamadan kuyruktaki kaydı tamamlanmış saymaz. Sunucu tekrar gelen paketi idempotent işler. Kayıt tamamlamaları/düzeltmeleri de yeni yarışlardan ayrı izlenir. Tamamı doğrulanmadan “otomatik aktarım aktif” gösterilmez.

Kimlik bilgileri tarayıcı HTML'ine veya bu depoya konmaz. Yönetici girişi sunucu tarafında doğrulanır. Aktarım hesabına yalnız ilgili modüle yazma yetkisi verilir. Veriler genel sitede okunabilir, arşive yazma yetkisi yöneticiyle sınırlıdır.

## Sıradaki uygulanabilir adımlar

- Veri tabanı bağlantı zaman aşımını gider; mevcut tabloları ve güvenlik kurallarını oku.
- Mevcut futbol verilerini ve geri dönüş noktasını doğrula.
- Yarış tabloları ve işlem geçmişini ekle; kimlik doğrulama ve sunucu doğrulamasını kur.
- Gerçek 93 kaydı merkezi arşive aktar; 84 dolu sonuç ve 9 çelişkili kaydı mutabık kıl.
- Excel tekrar yükleme, eksik sonuç tamamlama ve eski OCR'nin kullanıcı düzeltmesini silememesi testlerini geçir.
- Onaylanan ana sayfayı merkezi arşive bağlayarak üretime geçir.
- Windows erişimi sağlanınca kayıt kaynağını bul ve bağımsız yardımcı pilotunu kur.

Bu dal hazırlık içindir. Veri tabanı kurulumu veya üretim yayını tamamlandı olarak sunulmamalıdır.

## Statik arşiv yayını

Kullanıcı alan adında görmek için açıkça yayın talimatı verdi. Bu sürümde ana sayfa onaylanan tasarıma yönlenir; mevcut React futbol uygulaması `/futbol`, UNO `/uno` yolunda korunur. 93 yarış HTML'e gömülü arşiv kopyasından aranır. Merkezi veri tabanına yazma veya otomatik aktarım bu yayına dahil değildir; Excel işlemleri açık sayfada geçerlidir ve arayüz bunu belirtir.

Yayın öncesi geri dönüş noktası: Vercel dpl_WctywtEhChSFnPbuztSAAf3tK5v1; önceki üretim kaynak commit 598e775952e320a9dcb8c70b05f03ada844d6dbd.
