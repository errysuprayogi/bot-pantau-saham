# bot-pantau-saham

Bot Telegram harian (Bahasa Indonesia) yang mengirim rangkuman pasar IDX, berita, pergerakan bandar, dan akumulasi/jual asing — semuanya dari data Stockbit via MCP.

## Isi laporan

**Laporan pagi (PRE-MARKET BRIEFING)** — 09:15 WIB, Senin–Jumat
- IHSG (harga, perubahan, persen)
- Saham paling diakumulasi asing (net buy) & paling dijual asing (net sell)
- Radars modal besar / bandar (big money net value)
- (tidak memuat watchlist — khusus sesi sore)

**Laporan sore (RECAP HARIAN)** — 18:15 WIB, Senin–Jumat
- IHSG, top gainer & top loser (waran otomatis disaring)
- Akumulasi / jual bersih asing
- Radar bandar per saham: verdict akumulasi/distribusi + broker akumulator & distributor terbesar (dikelompokkan Asing/BUMN/Lokal)
- Watchlist (sore saja): daftar saham + verdict bandar + arah broker dominan (`Diborong`/`Dijual asing/lokal/bumn` + top 3 broker)
- Review watchlist dalam kalimat ringkas
- Berita utama (5 berita terbaru dari feed berita)

Waktu/jadwal bisa diubah di `.env` (`MORNING_CRON`, `EVENING_CRON`, zona `Asia/Jakarta`). Setiap pesan dipecah otomatis bila lebih dari 3800 karakter. Data hanya dari sesi terakhir yang tersedia bila pasar sedang tutup.

## Watchlist

Nama watchlist yang dilaporkan dikendalikan konstanta `WATCHLIST_NAME` di `src/reports.js` (default `"Porto"`). Watchlist dipilih berdasarkan nama; bila tidak ketemu, dipakai watchlist default akun. Setiap saham memperlihatkan:

- `<saham> <harga> (perubahan) | <verdict bandar>` — mis. `🟡 Netral (9 broker)`
- Baris broker dominan: `Diborong`/`Dijual` + jenis (asing/lokal/bumn) + 3 kode broker dengan nominal, mis. `Diborong asing (BB Rp18,5 M, BK Rp12,3 M, KZ Rp12,2 M)`

Watchlist hanya dikirim pada **laporan sore**.

## Persyaratan

- Windows dengan **Node.js >= 18** (default: `C:\Program Files\nodejs\node.exe`)
- Paket `stockbit-mcp` terpasang, path script berdiri sendiri (default: `C:\Users\eriks\Downloads\stockbit-mcp\dist\bin\stockbit-mcp.js`) — yang menghubungkan bot ke data Stockbit. Ubah di `.env` bila berbeda.
- Akun Stockbit yang sudah login di sesi browser/CLI stockbit (data dibaca lewat `STOCKBIT_TOOLS=core`).

## Setup

1. **Buat bot Telegram**
   - Buka chat **@BotFather**, kirim `/newbot`, ikuti instruksi.
   - Salin **token** (format `123456:ABC-...`).
2. **Isi `.env`** (salin dari `.env.example` bila belum ada):
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-...
   # TELEGRAM_CHAT_ID=      # opsional; tanpa ini, chat id terdaftar otomatis via /start
   MORNING_CRON=15 9 * * 1-5
   EVENING_CRON=15 18 * * 1-5
   # Untuk mode daemon yang melayani perintah Telegram, matikan cron internal:
   # MORNING_ENABLED=0
   # EVENING_ENABLED=0
   ```
3. **Pasang dependensi** (sekali saja):
   ```
   npm install
   ```
4. **Jalankan** dan daftarkan chat id:
   ```
   start.bat
   ```
   Buka bot di Telegram, kirim `/start`. Bot menyimpan chat id ke `state.json` dan membalas. Setelah itu pesan terkirim otomatis sesuai jadwal (lihat bagian Task Scheduler).

## Jalankan sekali / tes kirim

```
start-once.bat            # jalankan laporan pagi+sore sekali lalu keluar
start-once.bat --morning  # hanya laporan pagi
start-once.bat --evening  # hanya laporan sore
node index.js --once --no-send   # cetak ke console saja, tidak kirim Telegram
```

## Jadwal via Windows Task Scheduler

Ada **tiga** tugas terdaftar (path sudah mengacu ke folder `bot-pantau-saham`):

| Tugas | Pemicu | Perintah |
|---|---|---|
| `StockbitBotMorning` | Sen–Jum 09:15 WIB | `start-once.bat --morning` |
| `StockbitBotEvening` | Sen–Jum 18:15 WIB | `start-once.bat --evening` |
| `StockbitBotDaemon` | Saat login Windows | `start.bat` (daemon, jalan terus) |

Semua tugas berjalan **interactive only** (harus login Windows). `StartWhenAvailable=true` untuk ketiganya (kalau jam terlewat, dijalankan begitu sistem tersedia) dan tanpa batasan baterai.

> **Daemon** (`StockbitBotDaemon`) adalah satu-satunya proses yang melakukan polling Telegram — ini yang membuat perintah `/now`, `/pagi`, `/sore` merespons. Supaya tidak terjadi dobel kirim, **cron internal daemon dimatikan** lewat `.env` (`MORNING_ENABLED=0`, `EVENING_ENABLED=0`); kiriman harian sepenuhnya menjadi tanggung jawab dua tugas `--once` di atas, yang tidak polling sehingga aman berjalan berdampingan dengan daemon.

## Perintah bot

Aktif selama daemon berjalan (atau `node index.js` tanpa `--once`).

- `/start` — daftarkan chat ini untuk menerima laporan & cek status
- `/now` — kirim laporan hari ini sekarang (pagi+sore)
- `/pagi` — kirim laporan pagi sekarang
- `/sore` — kirim laporan sore sekarang
- `/test` — sama dengan `/now`

## Update token Stockbit di VM GCP (lewat HAR)

Saat token Stockbit di VM kadaluarsa/ditolak (bot berhenti mengirim atau `stockbit-auth status` menunjukkan *REJECTED*), perbarui tanpa perlu login browser di VM:

1. **Export HAR**: di browser (Windows) buka `stockbit.com`, pastikan sudah login akun Stockbit, buka *DevTools (F12) → Network → centang Preserve log*, refresh halaman, lalu *Export HAR…*. Simpan sebagai `Downloads\stockbit.com.har` (atau di mana saja).
2. **Jalankan script auto** (WSL, gcloud harus sudah login):
   ```
   bash deploy/update-token.sh
   # HAR lain:  bash deploy/update-token.sh /home/anda/foo.har
   ```
   Atau di Windows: double-click `deploy\update-token.bat` (default HAR `Downloads\stockbit.com.har`).
3. Script melakukan: scp HAR ke VM via IAP → `stockbit-auth import-har` (user `stockbitbot`, store `/var/lib/stockbitbot/.stockbit`) → hapus HAR dari VM → restart service `stockbitbot` → verifikasi sesi.
4. Cek hasil: `sudo journalctl -u stockbitbot --since '1 min ago'` di VM, atau kirim perintah `/now` ke bot.

> HAR berisi kredensial plaintext — jangan dibagikan, dan script otomatis menghapusnya dari VM setelah impor.
>
> ⚠ **HAR wajib fresh setiap kali.** HAR menyimpan *refresh token* yang family-nya berubah begitu token itu dipakai (saat bot membaca data). HAR yang sama **tidak bisa dipakai dua kali** — impor ulang = token ditolak (401). Selalu *export ulang* dari browser sebelum update token.

## Catatan

- **Informasi, bukan rekomendasi investasi.** Data berasal dari Stockbit (subset dari sesi terakhir; bila pasar libur, menampilkan sesi terakhir yang ada).
- Nilai bandarmologi bisa dirangkum dari data broker yang terpotong oleh batas API Stockbit — angka adalah indikasi arah, bukan total mutlak.
- Data asing (`netForeignBuy`/`netForeignSell`) baru tersedia sesudah rilis broker (~18:00 WIB); laporan pagi menampilkan data sesi terakhir yang sudah terbit.