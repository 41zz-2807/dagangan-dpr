# AGENTS.md — Dagang POS (Warung DPR)

Dokumentasi perubahan aplikasi Dagang POS di folder `/home/warnet/docker/dkie`.

## Identitas & Branding

- Nama aplikasi diganti dari "Dagang / Kasir Toko" menjadi **"Warung DPR (Dibawah Pohon Rindang)"**.
- Logo diunduh dari Nextcloud, dicrop menjadi persegi:
  - `frontend/public/icon-192.png`
  - `frontend/public/icon-512.png`
  - `frontend/public/favicon.svg`
- Favicon web diubah dari SVG ke PNG logo.
- Manifest PWA diupdate: `name`/`short_name` jadi "Warung DPR", `apple-mobile-web-app-title` jadi "Warung DPR".

### Halaman Login
- Logo diganti dari `IconStore` jadi gambar bulat `/icon-512.png` (94x94px).
- Judul "Warung DPR", subtitel "(Dibawah Pohon Rindang)".
- `overflow-hidden` agar halaman login tidak bisa di-scroll.
- Footer "Powered By Smart-Plus.id 2026" dihapus dari card login (hanya di footer global).
- Form login method diubah menjadi `POST`.

### Header (AppShell)
- Logo diganti jadi gambar bulat `/icon-192.png`.
- Teks "Warung DPR" + "(Dibawah Pohon Rindang)".
- Menu sidebar ditambahkan: Shift, Stok Opname, Pengeluaran.

### index.html
- Meta description, apple-mobile-web-app-title, title, favicon disesuaikan ke Warung DPR.

### Footer Global (`App.tsx`)
- Ditambahkan footer "Powered By Smart-Plus.id 2026" di bawah Routes, tampil di semua halaman.

## Fitur Kasir

### Tombol +/- di Card Produk
`frontend/src/pages/KasirPage.tsx`:
- Card produk yang sudah masuk keranjang menampilkan tombol **-** dan **+** di bawah card.
- Tombol +/- menggunakan `changeQty` / `addToCart` dengan `e.stopPropagation()`.
- Tombol + disabled jika stok habis.

### Filter Kategori Jadi Dropdown
- Halaman Kasir: filter kategori diubah jadi `<select>` dropdown.
- Halaman Produk: filter kategori diubah jadi `<select>` dropdown.

### Produk Stok 0 Disembunyikan di Kasir
`frontend/src/pages/KasirPage.tsx`:
- Produk dengan `stock <= 0` difilter dan tidak muncul di grid kasir (tidak bisa diklik).

## Fitur Kamera (Gambar Produk)
`frontend/src/components/ImageInput.tsx`:
- Ditambahkan tombol "Ambil foto" dengan `capture="environment"`, `accept="image/*"`.
- Validasi tipe image dan max 8 MB, upload via `apiUpload`.

## Validasi & Notifikasi Error Dekat Tombol Submit
Error dipindah ke footer (di atas tombol submit) dengan validasi frontend:
- **StokPage**: validasi qty, alasan min 3 karakter, delta qty tidak boleh 0.
- **KategoriPage**: nama kategori wajib diisi; bisa aktifkan/nonaktifkan kembali.
- **ProductFormSheet**: validasi nama, harga jual/beli, stok minimum/stok awal.
- **CartSheet**: error di atas tombol Bayar.
- **KasirPage**: notifikasi sticky di bawah keranjang.

## Penjualan — Produk Nonaktif Dicegah
`backend/dagang/services/sale.py`:
- `_lock_products()` filter `Product.is_active.is_(True)`.
- Error jika produk tidak ditemukan/tidak aktif.

## Kategori
`backend/dagang/api/categories.py` & `frontend/src/pages/KategoriPage.tsx`:
- Bisa mengaktifkan kembali kategori yang dinonaktifkan.

## Struk / Receipt (Printer Thermal 80mm)
`backend/dagang/services/receipt.py`:
- Template tabel murni, `@page { size: 80mm auto; margin: 0 }`, area cetak 72mm.
- Font monospace, logo rata tengah, nama "WARUNG DPR".
- Layout sesuai format thermal: info transaksi, item (nama + qty x harga + subtotal), ringkasan, footer.
- Angka pakai titik pemisah ribuan, rata kanan.
- `build_receipt_pdf()` sekarang menggunakan **template HTML yang sama** dengan tampilan layar (`render_public_receipt_page(sale, for_pdf=True)`) sehingga layout PDF identik dengan layar.
- PDF berukuran 80mm, tinggi dinamis, tanpa screenshot resolusi tinggi → file ringan (KB-scale).
- Halaman publik struk berukuran fixed 80mm (tidak melebar di desktop).
- Tombol "Simpan PDF" di halaman publik menghasilkan file PDF asli dengan nama `struk-{invoice_no}.pdf`.

`backend/dagang/config.py`: `STORE_NAME` default "Warung DPR".
`backend/dagang/api/receipt.py`: route PDF (`/pdf`, `/pdf.pdf`, `/struk.pdf`) dengan `as_attachment=True`, download sebagai `.pdf`.
`backend/dagang/__init__.py`: SPA tidak menangkap path `r/`.

## Laporan & Export
`backend/dagang/api/reports.py`:
- Semua agregasi omset filter `Sale.voided_at.is_(None)` (transaksi Void tidak dihitung di Total Omset maupun breakdown Metode Pembayaran).
- Endpoint `GET /api/reports/export?format=xlsx|pdf` — export laporan omset ke Excel/PDF, mengikuti filter tanggal.

`backend/dagang/api/sales.py`:
- Endpoint `GET /api/sales/export?format=xlsx|pdf` — export daftar transaksi ke Excel/PDF, mengikuti filter tanggal.

## Fitur Shift Kasir
`backend/dagang/models/shift.py`: model `Shift` + `ShiftTransaction`.
`backend/dagang/api/shifts.py`:
- `GET /api/shifts/current` — shift aktif saat ini.
- `POST /api/shifts/open` — buka shift (input saldo awal).
- `POST /api/shifts/close` — tutup shift (input uang fisik, hitung selisih).
- `GET /api/shifts/history` — riwayat shift.
- `GET /api/shifts/<id>` — detail shift.

`frontend/src/pages/ShiftPage.tsx`: halaman shift lengkap — status buka/tutup, tombol buka/tutup shift, riwayat shift.
`frontend/src/App.tsx`: route `/shift`.
`frontend/src/components/AppShell.tsx`: menu "Shift" di sidebar.

## Fitur Stok Opname
`backend/dagang/models/stock_opname.py`: model `StockOpname` + `StockOpnameItem`.
`backend/dagang/api/opname.py`:
- `GET /api/opname` — daftar opname.
- `POST /api/opname` — buat opname baru (draft) dengan semua produk aktif.
- `GET /api/opname/<id>` — detail opname.
- `PUT /api/opname/<id>/items` — input stok fisik, selisih otomatis.
- `POST /api/opname/<id>/complete` — selesai opname, generate adjustment stok.

`frontend/src/pages/StokOpnamePage.tsx`: halaman stok opname — daftar produk, input stok fisik, selisih otomatis, tombol simpan & selesai, riwayat.
`frontend/src/App.tsx`: route `/stok/opname`.
`frontend/src/components/AppShell.tsx`: menu "Stok Opname" di sidebar (owner only).

## Fitur Pengeluaran
`backend/dagang/models/pengeluaran.py`: model `Pengeluaran` + `PengeluaranKategori`.
`backend/dagang/api/pengeluaran.py`:
- `GET/POST/DELETE /api/pengeluaran/kategori` — kelola kategori pengeluaran (DELETE mengembalikan 409 `kategori_used` bila masih dipakai).
- `GET/POST /api/pengeluaran` — daftar & tambah pengeluaran (tanggal, kategori, nominal, keterangan, metode bayar).
- `GET/DELETE /api/pengeluaran/<id>` — detail & hapus pengeluaran.
- `GET /api/pengeluaran/summary` — total pengeluaran.
- `GET /api/pengeluaran/export?format=xlsx|pdf` — export laporan pengeluaran.

`frontend/src/pages/PengeluaranPage.tsx`: halaman pengeluaran — tambah pengeluaran, daftar riwayat, filter tanggal/kategori, total, export Excel/PDF, serta daftar **Kategori Pengeluaran** dengan tombol hapus (konfirmasi, tampilkan pesan 409 bila kategori masih dipakai).
`frontend/src/App.tsx`: route `/pengeluaran`.
`frontend/src/components/AppShell.tsx`: menu "Pengeluaran" di sidebar dengan ikon dolar (`IconMoney`).

## Perbaikan Tanggal / Timestamp
- `frontend/src/components/TransaksiDetailSheet.tsx`: subtotal tanggal tidak lagi dobel (hanya `formatTanggal`).
- `frontend/src/pages/AuditPage.tsx`: format tanggal tidak dobel; input tanggal pakai format `dd/mm/yyyy`.
- `frontend/src/pages/StokPage.tsx`: pergerakan stok hanya `formatTanggal` (tanpa waktu dobel); ditambahkan filter tanggal pergerakan.
- `frontend/src/pages/UserPage.tsx`: last login hanya tanggal (tanpa waktu dobel).
- `frontend/src/pages/TransaksiPage.tsx`: hanya `formatTanggalPendek` (tanpa waktu dobel).

## Model Baru (Database)
`backend/dagang/models/__init__.py` — menambahkan:
- `Shift`, `ShiftTransaction`
- `StockOpname`, `StockOpnameItem`
- `Pengeluaran`, `PengeluaranKategori`

Tabel dibuat otomatis via `db.create_all()` di `backend/entrypoint.sh` setelah migrasi Alembic. Kategori pengeluaran default di-seed (Operasional, Gaji Karyawan, Sewa, Listrik, Internet, Pembelian Stok, Lainnya).

## File Publik
- `frontend/public/icon-192.png`, `icon-512.png`, `favicon.svg`
- `frontend/public/manifest.webmanifest`

## Build
Semua perubahan frontend di-build ulang via `docker compose up -d --build`.

## Perbaikan Audit (Okt 2026)

### Shift Kasir
`backend/dagang/api/shifts.py`:
- Penjualan tunai dihitung **netto**: `sum(Payment.amount - Payment.change_amount)` untuk metode cash. Sebelumnya memakai uang diterima, sehingga kembalian ikut dihitung sebagai penjualan.
- `expected_cash = opening_balance + cash_sales`; `difference = cash_in_drawer - expected_cash`. Sebelumnya saldo awal diabaikan.
- Batas atas waktu tutup shift ditambahkan (`Sale.created_at <= closed_at`).
- Saldo awal dan uang fisik negatif ditolak (422).
- `backend/dagang/models/shift.py`: `to_dict()` mengembalikan `expected_cash` (null saat shift masih terbuka).
- `backend/dagang/services/sale.py`: setiap penjualan menautkan `ShiftTransaction` ke shift kasir yang sedang terbuka (jika ada). Shift tetap boleh ditutup tanpa tautan; ringkasan uang laci memakai rentang waktu shift.
- `frontend/src/pages/ShiftPage.tsx`: riwayat menampilkan penjualan tunai netto dan nilai seharusnya di laci.

### Struk / Receipt
`backend/dagang/services/receipt.py`:
- Ditambahkan helper `without_rp()`; literal bug `"Rp\\u00a0"` (dua backslash) diganti pemakaian helper, sehingga baris item dan TOTAL tidak lagi menampilkan `Rp Rp`.
- Fungsi mati `render_receipt_html` dan definisi `build_receipt_pdf` yang terduplikasi dihapus. PDF dan halaman publik memakai template yang sama.
- Nama toko dan footer diambil dari konfigurasi `STORE_NAME` / `STORE_FOOTER`, bukan hardcoded.
- Docstring ukuran struk diseragamkan ke 80mm.

### Stok Opname
`backend/dagang/api/opname.py`:
- Saat `complete`, selisih dihitung ulang dari stok terkini (`physical_stock - product.stock`) dengan produk dikunci `FOR UPDATE`, bukan memakai snapshot `difference` yang bisa basi.
- `system_stock` dan `difference` item diperbarui sesuai penyesuaian yang benar-benar diterapkan; movement memakai delta aktual.
- Item yang tidak diubah operator (selisih 0) dilewati, agar penjualan yang terjadi setelah opname dibuat tidak ikut dibatalkan.
- Stok fisik negatif ditolak (422).

### Pengeluaran
`backend/dagang/models/pengeluaran.py`:
- `cascade="all, delete-orphan"` pada relasi kategori dihapus agar menghapus kategori tidak ikut menghapus catatan pengeluaran.
`backend/dagang/api/pengeluaran.py`:
- Kategori yang masih dipakai pengeluaran tidak bisa dihapus; API mengembalikan 409 `kategori_used`.

Tidak ada perubahan skema database, sehingga tidak perlu migrasi Alembic baru.

## SKU & Barcode Disembunyikan dari UI (Okt 2026)

Field SKU dan Barcode dihapus dari antarmuka produk, tetapi **tetap disimpan dan dibuat otomatis oleh backend** agar data lama, stok, dan integritas database tidak rusak.

- `frontend/src/components/ProductFormSheet.tsx`: field `sku`/`barcode` dihapus dari `FormState`, `emptyForm`, payload, dan grid input. Subtitle sheet memakai nama produk.
- `frontend/src/pages/ProdukPage.tsx`: baris SKU diganti nama kategori; placeholder pencarian menjadi "Cari nama produk...".
- `frontend/src/pages/KasirPage.tsx`: pemindaian barcode dihapus (query `/products/barcode/:code`, handler Enter, dan teks "pindai barcode"); pencarian hanya berdasarkan nama/kategori.
- `frontend/src/types.ts`, API, dan kolom database `sku`/`barcode` tidak diubah. Backend tetap meng-generate SKU (`PRD-xxxx`) dan barcode numerik saat produk dibuat tanpa nilai tersebut.
- Tidak perlu migrasi Alembic.

## Tombol Hapus Produk & Kategori Produk (Okt 2026)

`DELETE` sekarang berarti **hapus permanen**, bukan nonaktifkan. Nonaktifkan tetap tersedia lewat `PATCH { is_active: false }`.

`backend/dagang/api/products.py`:
- `DELETE /api/products/<id>` menghapus produk permanen.
- Produk yang tercatat di `stock_opname_items` ditolak 409 `product_in_opname` (FK tanpa cascade) dan disarankan dinonaktifkan.
- `stock_movements` terkait dihapus lebih dulu (FK CASCADE), lalu produk dihapus. `sale_items.product_id` menjadi NULL lewat `ON DELETE SET NULL`, sehingga riwayat transaksi tetap utuh karena nama/harga sudah snapshot.
- Gambar produk ikut dihapus dari disk; audit mencatat `product.delete` dengan data `before`.

`backend/dagang/api/categories.py`:
- `DELETE /api/categories/<id>` menghapus permanen; 409 `category_used` bila masih ada produk (aktif maupun nonaktif) yang memakai kategori.
- Audit mencatat `category.delete`.

`frontend/src/pages/ProdukPage.tsx`: tombol hapus (ikon tempat sampah) di setiap kartu produk + konfirmasi; error API ditampilkan di atas daftar. Kartu diubah dari `<button>` tunggal menjadi `<div>` dengan tombol edit dan tombol hapus terpisah agar HTML valid.
`frontend/src/pages/KategoriPage.tsx`: tombol hapus permanen di setiap baris + konfirmasi; tombol "Nonaktifkan" memakai `PATCH`, bukan `DELETE`.
`frontend/src/components/ProductFormSheet.tsx`: tombol "Nonaktifkan" memakai `PATCH { is_active: false }`.

Tidak ada perubahan skema database.

## Splash Animasi Pembayaran (Okt 2026)

Status: **disetujui & dipakai** (23 Okt 2026).

Setelah kasir menekan tombol Bayar dan transaksi tersimpan, muncul overlay animasi **"Pembayaran diterima"** selama 1 detik sebelum halaman Transaksi Berhasil tampil. Splash hanya visual: transaksi sudah tersimpan sebelum animasi tampil, dan overlay tidak bisa diklik.

- `frontend/src/components/PaymentSuccessSplash.tsx`: overlay penuh dengan uang masuk ke dompet, koin, centang, nominal yang dibayar, dan kembalian (jika ada).
- `frontend/src/index.css`: keyframes `splash-*` (drop uang, dompet, koin, centang, nominal, fade-out). Menghormati `prefers-reduced-motion`.
- `frontend/src/pages/KasirPage.tsx`: state `showSplash` di-set bersamaan dengan `lastSale` agar tidak ada kedipan halaman sukses; timer 1000 ms mematikannya.
- Tidak ada perubahan backend/skema.
