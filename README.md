# Saham Indonesia Analyzer

Backend Node.js + UI sederhana untuk menganalisa saham Indonesia (IDX) menggunakan GoAPI dan menghasilkan sinyal beli/jual berdasarkan empat indikator teknikal:

- **Golden Cross / Death Cross** (MA50 vs MA200)
- **Bollinger Bands** (20, 2)
- **RSI** (14, Wilder smoothing)
- **Volume Breakout** (volume hari ini vs rata-rata 20 hari, ambang 2x)

Empat sinyal digabungkan menjadi satu rekomendasi: `STRONG BUY`, `BUY`, `HOLD`, `SELL`, atau `STRONG SELL`.

> **Penting:** GoAPI hanya menyediakan **data pasar**, bukan eksekusi order. Tombol Beli/Jual di UI adalah **paper trading** (simulasi disimpan di memori server). Untuk eksekusi nyata, Anda butuh API broker (Stockbit, Mirae, Mandiri Sekuritas, dll). Hasil analisa ini bukan rekomendasi investasi.

## Cara menjalankan

```bash
cd "Stock Trend Outlook"
npm install
npm start
```

Buka http://localhost:3000, masukkan kode emiten (mis. `BBCA`, `TLKM`, `ASII`, `BBRI`), klik **Analisa**.

Token GoAPI sudah tersimpan di `.env`. Kalau token Anda berbeda, edit `.env`:

```
GOAPI_TOKEN=token-anda
PORT=3000
GOAPI_BASE=https://api.goapi.io
```

## Endpoint backend

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/api/analyze/:emiten` | Ambil data historis dari GoAPI lalu hitung 4 indikator + rekomendasi. |
| POST | `/api/orders` | Catat order paper trading. Body: `{ emiten, side: BUY\|SELL, qty, price }`. |
| GET | `/api/orders` | Daftar semua order paper. |
| DELETE | `/api/orders/:id` | Hapus order paper. |
| GET | `/api/health` | Cek server. |

## Catatan tentang endpoint GoAPI

Server mencoba beberapa kandidat path historis (`/stock/idx/{symbol}/historical`, `/stock/idx/historical/{symbol}`, `/stock/idx/{symbol}/prices`) karena dokumentasi GoAPI berubah dari waktu ke waktu. Kalau respons tidak ter-parse, periksa `console` server — log akan menunjukkan endpoint mana yang merespons. Sesuaikan `fetchHistorical` di `server.js` jika perlu.

## Struktur

```
Stock Trend Outlook/
├── server.js          Express server + integrasi GoAPI
├── indicators.js      Perhitungan SMA, BB, RSI, volume breakout, golden cross
├── public/index.html  UI satu halaman dengan Chart.js
├── package.json
├── .env               Token GoAPI
└── README.md
```
