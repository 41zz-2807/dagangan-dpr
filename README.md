# Dagang — Aplikasi Kasir (POS) Mobile-first

Aplikasi point-of-sale untuk **satu toko dengan beberapa kasir**.
Backend Flask (API-only JSON) + PostgreSQL 15 di container terpisah, frontend React + Vite
(Tailwind) yang di-build dan disajikan oleh container Flask yang sama.

- Publik: **https://dagangan.smart-plus.id**
- Lokal/verifikasi: **http://localhost:8787**
- Plan & struktur folder: [`docs/PLAN.md`](docs/PLAN.md)

---

## 1. Arsitektur

```
cloudflared (container existing, network war-nt-web_default)
      │  http://dagang-apps:8787
      ▼
dagang-apps ── dagang-net (internal) ── dagang-db (postgres:15-alpine)
      │
      └── bind mount host: ./data  {postgres, uploads, logs, backups}
```

| Service | Container | Port host | Network | Restart |
|---|---|---|---|---|
| Aplikasi (Flask + gunicorn + static React) | `dagang-apps` | `8787:8787` | `dagang-net` + `war-nt-web_default` | `unless-stopped` |
| Database (PostgreSQL 15) | `dagang-db` | **tidak dipublish** | `dagang-net` (internal) | `unless-stopped` |

`dagang-net` memakai `internal: true` → database tidak pernah bisa diakses dari luar.
Tidak ada bind mount selain `./data`.

---

## 2. Menjalankan

```bash
cp .env.example .env
# isi .env: POSTGRES_PASSWORD, SECRET_KEY, OWNER_PASSWORD  (wajib)
docker compose up -d --build
docker compose ps
curl -s http://localhost:8787/api/health
```

Saat `dagang-apps` start (setelah DB sehat) otomatis:
1. menunggu PostgreSQL siap,
2. `alembic upgrade head` (migrasi),
3. membuat/menyinkronkan akun **owner** dari `OWNER_USERNAME` / `OWNER_PASSWORD`,
4. menjalankan gunicorn di `0.0.0.0:8787`.

> Mengubah `OWNER_PASSWORD` di `.env` lalu `docker compose up -d` akan memperbarui
> password akun owner tersebut.

Perintah bantu: `make help` (up, logs, backup, restore, migrate, create-user, ...).

### Verifikasi cepat

```bash
./scripts/smoke_test.sh      # 87 pemeriksaan: auth, role, audit, produk/kategori/stok/upload, penjualan, void, struk, laporan
```

Uji UI end-to-end (Chromium/Playwright, alur kasir & riwayat transaksi):

```bash
cd tests/ui && npm install && npx playwright install chromium
OWNER_PASSWORD=... node ui_test.mjs           # alur kasir (tahap 3)
OWNER_PASSWORD=... node transaksi_test.mjs    # riwayat + void + struk (tahap 4)
OWNER_PASSWORD=... node laporan_test.mjs      # omset, audit log, user (tahap 5)
```

---

## 3. Variabel environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | ya | Kredensial database di container `dagang-db` |
| `SECRET_KEY` | ya | Kunci tanda tangan JWT (minimal 32 karakter) |
| `OWNER_USERNAME` / `OWNER_PASSWORD` | ya | Akun owner pertama (dibuat otomatis) |
| `BASE_URL` | ya | URL publik, dipakai untuk link struk absolut, mis. `https://dagangan.smart-plus.id` |
| `CLOUDFLARED_NETWORK` | ya | Nama network eksternal container cloudflared, mis. `war-nt-web_default` |
| `TZ` | tidak | Default `Asia/Jakarta` |
| `COOKIE_SECURE` | tidak | `auto` (default: `Secure` mengikuti skema request), `true`, atau `false` |
| `GUNICORN_WORKERS` / `GUNICORN_THREADS` | tidak | Default `3` / `4` |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | tidak | Default `5` percobaan / `10` menit |
| `MAX_UPLOAD_MB` | tidak | Batas ukuran upload gambar, default `8` |
| `STORE_NAME` / `STORE_ADDRESS` / `STORE_PHONE` / `STORE_FOOTER` | tidak | Identitas toko yang dicetak di struk |
| `SMTP_*` | tidak | Email struk, default **mati** (`SMTP_ENABLED=false`) |

`DATABASE_URL` tidak perlu diisi manual — compose merakitnya dengan host `dagang-db`.

---

## 4. Cloudflare tunnel

Tunnel yang ada sudah diarahkan ke `http://dagang-apps:8787`.
Agar domain `dagangan.smart-plus.id` mengarah ke origin ini, tambahkan di
**Cloudflare Zero Trust → Tunnels → Public Hostname**:

| Subdomain | Service | Path |
|---|---|---|
| `dagangan.smart-plus.id` | `http://dagang-apps:8787` | — |

Container `dagang-apps` sudah bergabung ke network `war-nt-web_default`, sehingga
`dagang-apps` bisa dijangkau dari dalam container cloudflared.

Karena HTTPS berakhir di cloudflared, Flask berjalan di belakang proxy:
`ProxyFix` (X-Forwarded-Proto/Host/For) aktif, cookie auth memakai `Secure` + `SameSite=Lax`,
dan link struk dibangun dari `BASE_URL`.

---

## 5. Role & hak akses (ditegakkan di backend)

| Aksi | owner | kasir |
|---|---|---|
| Login/logout, ganti password | ya | ya |
| Buat penjualan (cash/transfer/QRIS) | ya | ya |
| Lihat omset | harian + rentang tanggal | **harian saja** |
| Lihat transaksi | semua | default miliknya sendiri hari ini |
| Void transaksi | ya | **tidak** |
| CRUD produk & kategori, harga, upload gambar | ya | **tidak** |
| Kelola user (kasir) | ya | **tidak** |
| Manage stok (adjust + alasan) | ya | ya (wajib isi alasan) |
| Lihat audit log | ya | **tidak** |

Semua pembatasan ditegakkan di API (`@roles_required`), bukan hanya di UI.

---

## 6. Endpoint yang tersedia (tahap 1–5)

Lihat [`docs/API.md`](docs/API.md) untuk detail lengkap.

| Method | Path | Akses |
|---|---|---|
| GET | `/api/health` | publik |
| POST | `/api/auth/login` | publik (rate limited) |
| POST | `/api/auth/logout` | publik (membersihkan cookie) |
| POST | `/api/auth/refresh` | cookie refresh |
| GET | `/api/auth/me` | login |
| POST | `/api/auth/change-password` | login |
| GET/POST | `/api/users` | owner |
| PATCH/DELETE | `/api/users/<id>` | owner |
| GET | `/api/audit` | owner (read-only) |
| GET/POST | `/api/categories` | baca: semua role · tulis: owner |
| PATCH/DELETE | `/api/categories/<id>` | owner |
| GET | `/api/products`, `/api/products/<id>`, `/api/products/barcode/<bc>` | semua role |
| POST/PATCH/DELETE | `/api/products` | owner |
| POST | `/api/products/<id>/image` | owner |
| GET | `/api/stock/summary`, `/api/stock/movements`, `/api/stock/low` | semua role |
| POST | `/api/stock/adjust` | semua role (alasan wajib) |
| POST | `/api/uploads/product-image` | owner |
| GET | `/api/uploads/<path>` | publik (hanya file gambar server) |
| POST | `/api/sales` | owner, kasir |
| GET | `/api/sales`, `/api/sales/<id>` | owner (semua) · kasir (miliknya) |
| POST | `/api/sales/<id>/void` | owner |
| GET | `/api/sales/<id>/receipt.pdf` | owner, kasir (miliknya) |
| GET | `/r/<receipt_token>` (+ `/pdf`) | publik (struk untuk dibagikan) |
| GET | `/api/reports/summary`, `/api/reports/daily`, `/api/reports/top-products` | owner (rentang bebas) · kasir (harian, miliknya) |

---

## 7. Keamanan

- Password di-hash **argon2id** (argon2-cffi).
- JWT disimpan di cookie **httpOnly** (`SameSite=Lax`), CSRF dilindungi double-submit token
  (`X-CSRF-TOKEN` dari cookie `csrf_access_token`).
- Rate limit login: 10/menit per IP (Flask-Limiter, in-memory per worker) **dan** blokir
  per-username setelah 5 kali gagal selama 10 menit (disimpan di tabel `login_attempts`,
  jadi berlaku lintas worker gunicorn).
- Header keamanan: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`.
- Input divalidasi di server (pydantic); harga/total/stok selalu dihitung ulang di server.
- Tidak ada secret di repo — `.env` tidak di-commit.
- Atribut `Secure` pada cookie mengikuti skema request (`COOKIE_SECURE=auto`): HTTPS → `Secure`,
  HTTP lokal (port 8787) → tanpa `Secure` agar verifikasi lokal tetap bisa login.

---

## 8. Audit log

Semua aktivitas penting (login/logout/gagal login, CRUD, adjust stok, void, dst) dicatat:

- tabel `audit_logs` (hanya bisa dibaca lewat API owner, tidak bisa diedit/dihapus dari aplikasi),
- file JSON Lines `/data/logs/audit-YYYY-MM-DD.log` (rotasi harian).

---

## 9. Backup & restore

```bash
make backup                     # atau ./scripts/backup.sh
# -> data/backups/datang-<timestamp>.sql.gz (rotasi 14 hari) + symlink dagang-latest.sql.gz

make restore FILE=latest        # atau ./scripts/restore.sh data/backups/dalang-xxx.sql.gz
```

Penjadwalan otomatis sudah terpasang di crontab host:
```cron
17 2 * * * /home/warnet/docker/dkie/scripts/backup.sh >> /home/warnet/docker/dkie/data/logs/backup.log 2>&1
```
Rotasi berkas lama: 14 hari. Restore menimpa seluruh isi database (minta konfirmasi).

---

## 11. Struktur folder

Lihat [`docs/PLAN.md`](docs/PLAN.md).

```
dkie/
├── docker-compose.yml      # 2 service + network
├── backend/                # Flask API (app factory, models, api, services, alembic)
├── frontend/               # React + Vite + Tailwind (PWA)
├── scripts/                # backup.sh, restore.sh, make_icons.py, smoke_test.sh
├── tests/ui/               # uji end-to-end Playwright (kasir, transaksi, laporan)
├── docs/                   # PLAN.md, API.md
└── data/                   # satu-satunya bind mount host
```

---

## 12. Fitur utama

| Layar | Isi |
|---|---|
| **Kasir** | grid produk, pencarian, pindai barcode, keranjang (bottom sheet), bayar tunai/transfer/QRIS, kembalian otomatis |
| **Transaksi** | riwayat dengan filter tanggal/metode/status, detail, void (owner), cetak PDF, bagikan struk |
| **Struk** | PDF 80mm (WeasyPrint) + halaman publik `/r/<token>` untuk dikirim ke pelanggan |
| **Stok** | ringkasan, daftar stok, adjust (+/- atau set nilai, alasan wajib), riwayat pergerakan |
| **Produk / Kategori** | CRUD + harga, gambar produk (JPG/PNG/WebP, maks 8 MB), soft delete |
| **Omset** | dashboard harian, grafik batang, produk terlaris, metode bayar, rekap per kasir |
| **User** | tambah kasir, ubah role, nonaktifkan, reset password |
| **Audit** | seluruh aktivitas (aksi, user, tanggal) dari DB + file log |

---

## 13. Status pengerjaan

| Tahap | Isi | Status |
|---|---|---|
| 1 | Scaffold, Docker, Alembic, auth + role, audit dasar, health | **selesai** |
| 2 | Produk & kategori, upload gambar, stok | **selesai** |
| 3 | Layar kasir, cart, checkout 3 metode, transaksi atomik | **selesai** |
| 4 | Riwayat transaksi, void, struk PDF 80mm, bagikan | **selesai** |
| 5 | Omset/laporan owner, halaman audit log, manajemen user | **selesai** |
| 6 | PWA (manifest + SW), polish UI, backup otomatis + restore, README final | **selesai** |

### Ringkasan verifikasi

| Suite | Hasil |
|---|---|
| `./scripts/smoke_test.sh` (API) | 87/87 lulus |
| `tests/ui/ui_test.mjs` (alur kasir, Chromium 390px) | 18/18 lulus |
| `tests/ui/transaksi_test.mjs` (riwayat, void, struk) | 16/16 lulus |
| `tests/ui/laporan_test.mjs` (omset, audit, user) | 18/18 lulus |
| Layout responsif (320/360/390/768/1280 px) | tanpa overflow horizontal |
