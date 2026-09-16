# ERENİM ANALİZ

Futbol maçları için geçmiş oran eşleşmeleri, veri dağılımları, KG Var/Yok, 2.5 Alt/Üst, H2H ve kupon takibi sunan React/Vite uygulaması.

## Yerel çalıştırma

```bash
npm install
npm run dev
```

## Vercel

Proje Vercel'e doğrudan bu GitHub reposundan bağlanacak şekilde hazırlanmıştır.

`npm run build` öncesinde `scripts/fetch-history.mjs`, 5 yıllık Sahadan arşivini geçici kaynak sunucudan indirip `public/resources/` içine yerleştirir. Daha sonra bu veri kalıcı veritabanına taşınabilir.

## Not

Canlı oran endpoint'i Vercel Serverless Function olarak `api/current.js` altında çalışır.
