# Warung DPR — Aplikasi Kasir (POS)

Aplikasi point-of-sale mobile-first untuk warung/toko. Backend Flask + PostgreSQL, frontend React (PWA).

- **URL:** https://dagangan.smart-plus.id
- **Lokal:** http://localhost:8787

## Menjalankan

```bash
cp .env.example .env   # isi POSTGRES_PASSWORD, SECRET_KEY, OWNER_PASSWORD
docker compose up -d --build
curl -s http://localhost:8787/api/health
```

## Fitur Utama

- **Kasir** — grid produk, pencarian, keranjang, bayar tunai/transfer/QRIS, kembalian otomatis
- **Transaksi** — riwayat, filter tanggal, detail, void (owner), cetak/bagikan struk
- **Struk** — PDF 80mm + halaman publik `/r/<token>` (berlaku 30 hari)
- **Stok** — adjust stok, riwayat pergerakan, stok opname
- **Produk/Kategori** — CRUD, harga, gambar, kategori produk & pengeluaran
- **Omset** — dashboard harian, produk terlaris, metode bayar, rekap per kasir (owner)
- **Shift Kasir** — buka/tutup shift, hitung selisih uang
- **Pengeluaran** — catat pengeluaran, filter, export Excel/PDF
- **User & Audit** — kelola kasir, log aktivitas (owner)

## Role

- **Owner**: akses penuh (produk, kategori, user, omset, audit, void)
- **Kasir**: penjualan, stok, shift, pengeluaran miliknya

## Backup & Restore

```bash
./scripts/backup.sh
./scripts/restore.sh data/backups/dagang-latest.sql.gz
```

## Tech Stack

Flask + Gunicorn + PostgreSQL 15 (Docker) · React + Vite + Tailwind (PWA) · Cloudflare Tunnel

---

Lihat [`AGENTS.md`](AGENTS.md) untuk detail perubahan dan [`docs/PLAN.md`](docs/PLAN.md) untuk struktur folder.