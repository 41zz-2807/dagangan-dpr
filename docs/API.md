# Kontrak API — Dagang POS (tahap 1–5)

Base URL: `/api` (origin sama dengan UI).
Seluruh response error memakai bentuk:

```json
{ "error": { "code": "forbidden", "message": "Anda tidak memiliki izin untuk tindakan ini." } }
```

Autentikasi: JWT di cookie httpOnly (`access_token_cookie`, `SameSite=Lax`).
Untuk request selain GET/POST-PUT-PATCH-DELETE harus mengirim header:

```
X-CSRF-TOKEN: <nilai cookie csrf_access_token>
```

---

## Health

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/health` | publik | `{"status":"ok","database":"ok","version":"0.1.0","time":"..."}` (503 bila DB error) |
| GET | `/api/health/ready` | publik | alias |

## Auth

| Method | Path | Akses | Body / Keterangan |
|---|---|---|---|
| POST | `/api/auth/login` | publik | `{username, password}` → set cookie access+refresh+csrf. 401 kredensial salah, 403 akun nonaktif, 429 terkunci |
| POST | `/api/auth/logout` | publik | membersihkan cookie; tetap 200 walau token invalid |
| POST | `/api/auth/refresh` | refresh cookie | perbarui access token (header CSRF memakai `csrf_refresh_token`) |
| GET | `/api/auth/me` | login | `{user: {...}}` |
| POST | `/api/auth/change-password` | login | `{old_password, new_password}` |

Bentuk user:

```json
{
  "id": 1,
  "username": "owner",
  "full_name": "Owner Toko",
  "display_name": "Owner Toko",
  "role": "owner",
  "is_active": true,
  "last_login_at": "2026-10-21T17:32:50+07:00",
  "created_at": "2026-10-21T17:32:34+07:00"
}
```

## User (owner)

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/users` | owner | filter: `q`, `role`, `is_active` |
| POST | `/api/users` | owner | `{username, password, full_name?, role?}` (role default `kasir`) |
| PATCH | `/api/users/<id>` | owner | `{full_name?, role?, is_active?, password?}` |
| DELETE | `/api/users/<id>` | owner | menonaktifkan akun (bukan hapus data) |

Aturan: tidak bisa menurunkan role/nonaktifkan akun sendiri; minimal satu owner aktif.

## Audit (owner, read-only)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/audit` | filter: `user_id`, `action`, `entity`, `from`, `to` (YYYY-MM-DD), `page`, `per_page` (max 200) |

```json
{
  "items": [
    {
      "id": 12,
      "user_id": 1,
      "username": "owner",
      "action": "user.create",
      "entity": "users",
      "entity_id": "2",
      "before": null,
      "after": { "username": "kasir1", "role": "kasir", "is_active": true },
      "ip": "172.23.0.1",
      "user_agent": "curl/8.14.1",
      "created_at": "2026-10-21T17:32:56+07:00"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 50,
  "pages": 1
}
```

## Aksi audit yang tercatat

`auth.login`, `auth.login_failed`, `auth.login_blocked`, `auth.logout`,
`auth.change_password`, `auth.change_password_failed`, `auth.seed_owner`,
`user.create`, `user.update`, `user.deactivate`,
`category.create`, `category.update`, `category.deactivate`,
`product.create`, `product.update`, `product.deactivate`, `product.price_change`,
`product.image_upload`, `upload.product_image`, `stock.adjust`,
`sale.create`, `sale.void`.

---

# Tahap 2 — Kategori, Produk, Stok, Unggah

## Kategori

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/categories` | owner, kasir | filter: `q`, `is_active`. Kasir hanya melihat kategori aktif |
| POST | `/api/categories` | owner | `{name, description?}` → 409 `name_exists` bila nama bentrok |
| PATCH | `/api/categories/<id>` | owner | `{name?, description?}` |
| DELETE | `/api/categories/<id>` | owner | hapus permanen; 409 `category_used` bila masih dipakai produk |

```json
{
  "items": [
    {
      "id": 1,
      "name": "Makanan",
      "description": "Produk makanan",
      "is_active": true,
      "created_at": "2026-10-21T17:54:54.391334+07:00",
      "product_count": 1,
      "active_product_count": 1
    }
  ]
}
```

## Produk

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/products` | owner, kasir | filter: `q` (nama/SKU/barcode), `category_id`, `is_active`, `low_stock`, `page`, `per_page` (max 200). Kasir hanya melihat produk aktif |
| GET | `/api/products/<id>` | owner, kasir | detail produk |
| GET | `/api/products/barcode/<barcode>` | owner, kasir | lookup cepat barcode (produk aktif saja) |
| POST | `/api/products` | owner | `{sku?, name, price_sale, price_purchase?, category_id?, barcode?, stock?, min_stock?, unit?, description?, image_path?, is_active?}` |
| PATCH | `/api/products/<id>` | owner | ubah sebagian field (stok **tidak** boleh diubah di sini) |
| DELETE | `/api/products/<id>` | owner | hapus permanen; riwayat penjualan tetap tersimpan (snapshot); 409 `product_in_opname` bila produk tercatat di stok opname |
| POST | `/api/products/<id>/image` | owner | unggah gambar lalu tautkan ke produk (multipart `file`) |

Aturan: `sku` &amp; `barcode` opsional — bila dikosongkan akan **di-generate otomatis**:
- `sku`: 3 huruf pertama nama kategori (uppercase) + nomor berurutan, mis. `MAK-0001`; bila tanpa kategori → `PRD-0001`;
- `barcode`: angka 12 digit berurutan.
Kedua tetap dicek keunikannya (409 `sku_exists` / `barcode_exists` bila bentrok). Harga &gt; 0, `stock` awal dicatat sebagai pergerakan `initial`.

```json
{
  "product": {
    "id": 1,
    "sku": "MKN-001",
    "barcode": "8999999999999",
    "name": "Indomie Goreng",
    "description": null,
    "price_sale": "15000.00",
    "price_purchase": "12000.00",
    "stock": 19,
    "min_stock": 5,
    "unit": "pcs",
    "image_path": "2026/10/b14df0aeb3a3ada7eafcff1f50ff4cfa.jpg",
    "is_active": true,
    "is_low_stock": false,
    "created_at": "2026-10-21T17:54:54.535875+07:00",
    "updated_at": "2026-10-21T17:55:14.801855+07:00",
    "category": { "id": 1, "name": "Makanan" },
    "image_url": "/api/uploads/2026/10/b14df0aeb3a3ada7eafcff1f50ff4cfa.jpg",
    "thumb_url": "/api/uploads/2026/10/b14df0aeb3a3ada7eafcff1f50ff4cfa_thumb.jpg"
  }
}
```

## Stok

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/stock/summary` | owner, kasir | `{total_products, total_units, low_stock_count}` |
| GET | `/api/stock/movements` | owner, kasir | filter: `product_id`, `movement_type`, `page`, `per_page` |
| GET | `/api/stock/low` | owner, kasir | produk aktif dengan `stock <= min_stock` |
| POST | `/api/stock/adjust` | owner, kasir | `{product_id, mode: "delta"\|"set", qty, reason}` |

Aturan: `reason` wajib (422 `reason_required`), stok tidak boleh minus (409 `insufficient_stock`),
penyesuaian memakai `SELECT ... FOR UPDATE` sehingga aman saat dua kasir adjustment bersamaan.
Tipe pergerakan: `adjust` (penyesuaian manual), `restock` (stok awal produk),
`sale` (tahap 3), `void` (pembatalan, tahap 4).

```json
{
  "items": [
    {
      "id": 11,
      "product_id": 5,
      "product_name": "Produk Smoke",
      "qty": -1,
      "movement_type": "adjust",
      "reason": "Rusak di gudang",
      "user_id": 8,
      "username": "kasir1",
      "sale_id": null,
      "ref": null,
      "created_at": "2026-10-21T17:59:38.593451+07:00"
    }
  ],
  "total": 11,
  "page": 1,
  "per_page": 50,
  "pages": 1
}
```

## Unggah gambar

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/uploads/product-image` | owner | multipart `file` → `{image: {image_path, thumb_path, url, thumb_url, width, height, size_bytes}}` |
| GET | `/api/uploads/<path>` | publik | menyajikan file gambar (hanya nama yang dibuat server) |

Aturan: JPG/PNG/WEBP, maksimal 8 MB dan 40 MP, EXIF diputar, versi sedang maksimum 1024px
+ thumbnail 320px (keduanya JPEG), nama file acak 32 hex, disimpan di `/data/uploads/<tahun>/<bulan>/`.

---

# Tahap 3 — Penjualan (Kasir)

## Transaksi

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/sales` | owner, kasir | buat transaksi; total & kembalian dihitung ulang di server |
| GET | `/api/sales` | owner, kasir | daftar transaksi (kasir: miliknya sendiri, default hari ini) |
| GET | `/api/sales/<id>` | owner, kasir | detail transaksi (kasir hanya transaksinya sendiri) |

Body `POST /api/sales`:

```json
{
  "items": [{ "product_id": 1, "qty": 2 }],
  "payments": [{ "method": "cash", "amount": "50000", "reference": null }],
  "discount": "0",
  "customer_name": null,
  "customer_phone": null,
  "note": null
}
```

Aturan server:
- harga, subtotal, diskon, total, dan kembalian **dihitung ulang** (payload client tidak dipercaya);
- stok produk dikunci `SELECT ... FOR UPDATE` → stok tidak pernah minus (409 `insufficient_stock`);
- `discount > 0` hanya boleh oleh owner (403 untuk kasir), dan tidak boleh melebihi subtotal (422);
- `payments`: `cash` wajib menyertakan `amount` (uang diterima) → kembalian = amount − total;
  `transfer`/`qris` boleh tanpa `amount` (server isi total) dan tidak boleh lebih dari total (422 `payment_excess`);
- `sum(payments) >= total` (selain itu 422 `payment_insufficient`);
- nomor invoice `TRX-YYYYMMDD-00001` dibuat dari sequence PostgreSQL (aman saat paralel);
- setiap penjualan membuat `stock_movements` bertipe `sale` dan tercatat di audit (`sale.create`).

Filter `GET /api/sales`: `from`, `to` (YYYY-MM-DD), `cashier_id` (owner), `method`,
`status` (`paid`/`void`), `q` (no. invoice / nama produk), `page`, `per_page`.

```json
{
  "sale": {
    "id": 1,
    "invoice_no": "TRX-20261021-00001",
    "cashier": { "id": 1, "username": "owner", "display_name": "Owner Toko" },
    "subtotal": "30000.00",
    "discount": "0.00",
    "total": "30000.00",
    "status": "paid",
    "customer_name": null,
    "customer_phone": null,
    "receipt_token": "7b0e43f452caf5283eba55f8fb90d959",
    "created_at": "2026-10-21T18:17:01.666025+07:00",
    "voided_at": null,
    "void_reason": null,
    "items": [
      {
        "id": 1,
        "product_id": 1,
        "qty": 2,
        "product_name": "Indomie Goreng",
        "product_sku": "MKN-001",
        "unit_price": "15000.00",
        "subtotal": "30000.00"
      }
    ],
    "payments": [
      {
        "id": 1,
        "method": "cash",
        "amount": "50000.00",
        "reference": null,
        "change_amount": "20000.00",
        "created_at": "2026-10-21T18:17:01.666025+07:00"
      }
    ],
    "voided_by": null
  }
}
```

---

# Tahap 4 — Pembatalan & Struk

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/sales/<id>/void` | **owner** | `{reason}` (min 3 karakter) → status `void`, stok dikembalikan |
| GET | `/api/sales/<id>/receipt.pdf` | owner, kasir (miliknya) | struk PDF 80mm (inline) |
| GET | `/r/<receipt_token>` | publik | halaman struk HTML (untuk dibagikan ke pelanggan) |
| GET | `/r/<receipt_token>/pdf` | publik | struk PDF 80mm |
| GET | `/r/<receipt_token>/json` | publik | data struk JSON |

Aturan void:
- hanya owner (kasir → 403), transaksi yang sudah void → 409 `already_void`, alasan wajib (422);
- stok produk dikembalikan dan dicatat sebagai `stock_movements` bertipe `void`;
- data transaksi **tidak dihapus**; status jadi `void`, `voided_at`/`voided_by`/`void_reason` terisi;
- tercatat di audit sebagai `sale.void`.

Identitas toko pada struk diambil dari env: `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE`, `STORE_FOOTER`.

---

# Tahap 5 — Laporan Omset

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/reports/summary` | owner, kasir | ringkasan omset untuk rentang aktif |
| GET | `/api/reports/daily` | owner, kasir | deret omset per tanggal |
| GET | `/api/reports/top-products` | owner, kasir | produk terlaris (`limit`, max 50) |

Filter: `from`, `to` (YYYY-MM-DD).
**Owner** boleh memilih rentang bebas (maks. 366 hari). **Kasir** hanya boleh melihat
omset hariannya sendiri — rentang dipaksa ke hari ini dan transaksinya hanya miliknya.

Transaksi berstatus `void` tidak dihitung dalam omset.

```json
{
  "range": { "from": "2026-10-21", "to": "2026-10-21" },
  "omset": "45000.00",
  "transaksi": 2,
  "produk_terjual": 3,
  "diskon": "0.00",
  "rata_rata": "22500.00",
  "low_stock_count": 1,
  "by_method": [{ "method": "cash", "count": 1, "amount": "50000.00" }],
  "by_cashier": [
    { "username": "owner", "display_name": "Owner Toko", "count": 2, "amount": "45000.00" }
  ]
}
```

---

Endpoint tahap berikutnya (belum diimplementasikan): kirim struk via email (SMTP, masih dimatikan
secara default). Backup/restore sudah tersedia lewat `scripts/backup.sh` & `scripts/restore.sh`.
