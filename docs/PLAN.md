# Rencana & Struktur Folder — "Dagang" POS (mobile-first)

Satu toko, beberapa kasir. Backend Flask (API-only JSON), frontend React+Vite yang di-build
dan disajikan oleh container Flask yang sama, PostgreSQL 15 terpisah di container sendiri.

## 1. Arsitektur runtime

```
Internet ── cloudflared (container existing, network: war-nt-web_default)
              │  http://dagang-apps:8787
              ▼
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │ dagang-apps (container)  │        │ dagang-db (container)    │
   │ Flask + gunicorn :8787   │◄──────►│ postgres:15-alpine       │
   │ + static React build     │  dagang│ (tanpa port published)   │
   │ + alembic + seed owner  │  -net  │                          │
   └──────────────────────────┘        └──────────────────────────┘
        │  join juga: war-nt-web_default (external, milik cloudflared)
        │
        └── volume host (SATU folder bind mount): ./data
              ├── postgres/  → /var/lib/postgresql/data
              ├── uploads/   → /data/uploads   (gambar produk)
              ├── logs/      → /data/logs      (access/error/audit)
              └── backups/   → /data/backups   (pg_dump)
```

- HTTPS berakhir di cloudflared → Flask berada di belakang proxy. `ProxyFix` aktif
  (X-Forwarded-Proto/Host/For), cookie JWT `Secure` otomatis mengikuti skema request
  (`http` lokal → non-secure, `https` publik → secure), `SameSite=Lax`, `HttpOnly`.
- Semua URL absolut (tautan struk) dibangun dari `BASE_URL=https://dagangan.smart-plus.id`.
- `dagang-net` = `internal: true` → Postgres tidak pernah terekspos keluar.

## 2. Struktur folder

```
dkie/
├── docker-compose.yml          # 2 service: dagang-apps, dagang-db
├── .env / .env.example         # .env tidak di-commit
├── .dockerignore
├── Makefile                    # helper: up, logs, backup, seed, migrate
├── README.md                   # cara pakai, restore, deploy, akun
├── docs/
│   ├── PLAN.md                 # dokumen ini
│   └── API.md                  # kontrak endpoint (isi bertahap)
├── scripts/
│   ├── backup.sh               # pg_dump via docker exec + rotasi 14 hari
│   └── restore.sh              # restore dari file .sql.gz
├── data/                       # SATU-satunya bind mount host
│   ├── postgres/ uploads/ logs/ backups/
├── backend/
│   ├── Dockerfile              # multi-stage: build React -> python runtime
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── entrypoint.sh           # tunggu DB -> alembic upgrade -> seed owner -> gunicorn
│   ├── wsgi.py
│   ├── alembic/
│   │   ├── env.py              # env.py berbasis app context Flask
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 0001_initial.py # seluruh inti schema (users..audit_logs)
│   │       └── 0002_*.py       #(created bertahap sesuai kebutuhan)
│   ├── dagang/
│   │   ├── __init__.py         # create_app() factory + blueprint + error handler
│   │   ├── config.py           # konfigurasi berbasis env
│   │   ├── extensions.py       # db, migrate, jwt, limiter
│   │   ├── cli.py              # seed-owner, wait-db, create-user
│   │   ├── models/             # SQLAlchemy 2.0 (Mapped/mapped_column)
│   │   │   ├── base.py user.py category.py product.py
│   │   │   ├── sale.py payment.py stock_movement.py audit_log.py
│   │   ├── schemas/            # validasi pydantic v2
│   │   ├── api/                # blueprint JSON API
│   │   │   ├── health.py auth.py users.py products.py categories.py
│   │   │   ├── sales.py stock.py reports.py audit.py uploads.py receipt.py
│   │   ├── services/           # domain logic
│   │   │   ├── audit.py (DB + file) security.py (argon2, rate limit)
│   │   │   ├── invoice.py stock.py image.py receipt.py
│   │   └── utils/              # decorators (role), errors, money, responses
│   └── tests/                  # pytest (fase akhir, minimal)
└── frontend/
    ├── Dockerfile              # (dipakai backend/Dockerfile via build context root)
    ├── package.json  vite.config.ts  tailwind.config.js  postcss.config.js
    ├── index.html
    ├── public/                 # manifest.webmanifest, sw.js, icons
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── lib/                # api client (cookie + CSRF), auth, query, format rupiah
        ├── components/         # AppShell, ProtectedRoute, ui, ProductCard, CartSheet, ...
        └── pages/              # login, kasir, transaksi, stok, omset, dashboard,
                               # produk, kategori, user, audit, struk publik
```

## 3. Tahap pengerjaan

| Tahap | Isi | Status |
|---|---|---|
| 1 | Scaffold repo, Dockerfile, docker-compose, Alembic, auth+role, audit log dasar, health, verifikasi :8787 | selesai |
| 2 | Master produk & kategori, upload gambar (Pillow: thumb + sedang), stok | selesai |
| 3 | Layar kasir, cart bottom sheet, checkout 3 metode (cash/transfer/qris), transaksi atomik | selesai |
| 4 | Riwayat transaksi, void (owner), struk PDF WeasyPrint 80mm, bagikan (Web Share/wa.me) | selesai |
| 5 | Omset harian kasir, dashboard & laporan owner, halaman audit log | selesai |
| 6 | PWA (manifest+SW), polish UI, backup otomatis + restore, README final | selesai |

## 4. Aturan inti yang ditegakkan di server

- Semua harga/total/stok dihitung ulang di server; payload client tidak dipercaya.
- Checkout satu transaksi DB: `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty`
  (baris terpengaruh = 0 → 409, stok tidak pernah minus). Two kasir aman pada produk yang sama.
- Void = `status='void'` + stock_movement pembalik, tidak menghapus data (owner saja).
- Uang `NUMERIC(14,2)` / `Decimal`; waktu `TIMESTAMPTZ` (UTC, sesi DB di Asia/Jakarta).
- Audit log: tabel `audit_logs` **dan** file `/data/logs/audit-YYYY-MM-DD.log` (JSON Lines).
  Tidak bisa diedit/dihapus lewat aplikasi.
- Role ditegakkan di backend (`@roles_required`), bukan sekadar disembunyikan di UI.
- CSRF: double-submit token (`csrf_access_token` + header `X-CSRF-TOKEN`) + cek Origin.
- Login dibatasi rate limit (IP + per-username) dan password di-hash argon2id.
