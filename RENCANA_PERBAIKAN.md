# Rencana Perbaikan & Pengembangan Warung DPR (Dagang POS)

## Status: Sudah dianalisis - siap diimplementasikan

## Prioritas: HIGH / MEDIUM / LOW

---

## 1. BUG FIXES (Prioritas Tinggi)

### 1.1 Timestamp muncul dobel
- **Lokasi:** `frontend/src/lib/format.ts`, `frontend/src/components/TransaksiDetailSheet.tsx`, `frontend/src/pages/AuditPage.tsx`, `frontend/src/pages/StokPage.tsx`, `frontend/src/pages/UserPage.tsx`
- **Root cause:** `formatTanggal` sudah menggunakan `dateTimeFormatter` yang menampilkan tanggal + waktu, dan beberapa komponen menambahkan `formatWaktu` terpisah
- **Solusi:**
  - **Frontend:** Cek penggunaan `formatTanggal + formatWaktu` di mana saja, ganti jadi hanya `formatTanggal` atau hanya `formatWaktu` sesuai kebutuhan
  - **AuditPage:** `formatTanggal(entry.created_at) + " " + formatWaktu(entry.created_at)` → cukup `formatTanggal(entry.created_at)`
  - **TransaksiDetailSheet:** periksa subtitle yang concat tanggal+waktu
- **Prioritas:** HIGH

### 1.2 Perhitungan Omset vs Metode Pembayaran tidak konsisten
- **Lokasi:** `backend/dagang/api/reports.py` (summary, daily), `backend/dagang/services/sale.py`
- **Root cause:** Query laporan memakai `Sale.status == Sale.STATUS_PAID` tapi bisa ada transaksi void yang masih terhitung, atau perhitungan payment berbeda
- **Solusi:**
  - **Backend:** Pastikan semua agregasi (omset, by_method) selalu filter `Sale.status == 'paid'` dan `Sale.voided_at IS NULL`
  - **Backend:** Di `by_method`, join ke `Payment` dengan filter yang sama (hanya paid sales)
  - **Validasi:** Bandingkan total omset = sum(by_method.amount)
- **Prioritas:** HIGH

### 1.3 Login form method GET
- **Lokasi:** `frontend/src/pages/LoginPage.tsx`
- **Solusi:** Ubah form jadi `method="post"` dan pastikan tidak ada submit GET. Saat ini form pakai `onSubmit` handler (JS) jadi aman, tapi sebaiknya eksplisit jadi `method="post"` untuk keamanan/standar
- **Prioritas:** HIGH

### 1.4 Produk stok 0 masih muncul di Kasir
- **Lokasi:** `frontend/src/pages/KasirPage.tsx`
- **Root cause:** Filter produk tidak exclude stok 0
- **Solusi:**
  - **Frontend:** Filter `products.filter(p => p.stock > 0)` sebelum render grid, atau disable + hide
  - **Backend (opsional):** Tambah `stock > 0` di query products untuk endpoint kasir
- **Prioritas:** HIGH

### 1.5 Format tanggal di filter Audit
- **Lokasi:** `frontend/src/pages/AuditPage.tsx`
- **Solusi:** Ubah input type date atau format display jadi dd/mm/yyyy. Browser `type="date"` sudah locale-aware, tapi pastikan formatting konsisten pakai `formatTanggalPendek`
- **Prioritas:** HIGH

### 1.6 Struk Publik (Public Receipt) - 80mm
- **Lokasi:** `backend/dagang/services/receipt.py` (sudah diupdate), `backend/dagang/api/receipt.py`
- **Masalah saat ini:**
  - Tombol "Simpan PDF" link ke `pdf.pdf` - sudah diubah jadi attachment, tapi perlu pastikan berfungsi
  - Layout masih bisa melebar di desktop
- **Solusi:**
  - **Backend:** Pastikan `render_receipt_html` pakai `@page { size: 80mm auto; margin: 0 }`, `.receipt { width: 80mm; margin: 0; padding: 0 2mm }`
  - **Backend:** Endpoint PDF pakai `as_attachment=True`, `mimetype: application/pdf`
  - **Frontend (public):** Bisa pakai `html2canvas` + `jsPDF` sebagai fallback, atau langsung link ke PDF
  - **Rekomendasi:** Lebih stabil pakai backend PDF (WeasyPrint) seperti sekarang
- **Prioritas:** HIGH

---

## 2. FITUR BARU

### 2A. Export Excel & PDF (Omset & Transaksi)
- **Lokasi:** `frontend/src/pages/OmsetPage.tsx`, `frontend/src/pages/TransaksiPage.tsx`
- **Backend:** Tambah endpoint export
  - `GET /api/reports/export?format=xlsx&from=...&to=...`
  - `GET /api/reports/export?format=pdf&from=...&to=...`
  - `GET /api/sales/export?format=xlsx|pdf&...` (ikuti filter aktif)
- **Frontend:** Tombol "Export Excel" / "Export PDF" di header filter
- **Library:** `openpyxl` / `xlsxwriter` (Python), `reportlab`/`weasyprint` (PDF), atau `xlsx` (JS)
- **Prioritas:** MEDIUM-HIGH

### 2B. Shift Kasir (Buka/Tutup Shift + Cash Drawer)
#### Database schema baru
Buat tabel `shifts`:
```sql
shifts (
  id SERIAL PRIMARY KEY,
  cashier_id INT FK users(id),
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP NULL,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(14,2) NULL,
  cash_sales NUMERIC(14,2) DEFAULT 0,
  cash_in_drawer NUMERIC(14,2) NULL,
  difference NUMERIC(14,2) NULL,
  notes TEXT NULL,
  status VARCHAR(10) DEFAULT 'open'
)
```
Buat tabel `shift_transactions`:
```sql
shift_transactions (
  id SERIAL PRIMARY KEY,
  shift_id INT FK shifts(id),
  sale_id INT FK sales(id),
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### Backend
- Model: `backend/dagang/models/shift.py`
- Migration: `alembic revision -m "add_shifts"`
- Service: `backend/dagang/services/shift.py`
- API: `backend/dagang/api/shifts.py`

#### Frontend
- Halaman `/shift` atau modal di kasir
- Tombol "Buka Shift" saat pertama kali masuk kasir
- Modal "Tutup Shift" dengan input uang fisik
- Halaman Riwayat Shift
- **Prioritas:** MEDIUM-HIGH

### 2C. Stok Opname & History Pergerakan Lebih Detail
#### Database
Buat tabel `stock_opnames` dan `stock_opname_items` seperti di rencana

#### Backend
- Model + migration
- Service `backend/dagang/services/opname.py`
- API `backend/dagang/api/opname.py`
- Perluas filter `/api/stock/movements`

#### Frontend
- Tab "Stok Opname" di halaman Stok
- Form opname dengan kolom Stok Sistem vs Stok Fisik vs Selisih
- Tombol "Selesaikan Opname" → generate stock movements adjust
- Filter pergerakan stok diperluas
- **Prioritas:** MEDIUM-HIGH

---

## 3. FITUR TAMBAHAN (Prioritas Sedang - Rendah)

| Fitur | Keterangan | Prioritas |
|---|---|---|
| Cetak struk thermal Bluetooth/USB | Bisa pakai Web Serial API / Web Bluetooth / ESC/POS library | LOW |
| Notifikasi stok menipis | Badge/dashboard + optional WhatsApp via provider | LOW |
| Role permission granular | Middleware lebih detail (permissions table) | MEDIUM |
| Multi-cabang/multi-toko | Schema perubahan besar (branch_id di semua tabel) | LOW |
| Dark mode | Tailwind dark mode + localStorage | LOW |

---

## Urutan Pengerjaan (Rekomendasi)

### Phase 1: Bug Fixes (1-2 hari)
1. Fix timestamp dobel
2. Fix perhitungan omset vs metode pembayaran (filter void)
3. Fix login form method
4. Hide/disable produk stok 0 di Kasir
5. Fix format tanggal Audit
6. Perbaiki layout struk publik 80mm

### Phase 2: Export (0.5-1 hari)
1. Backend export endpoints (xlsx/pdf)
2. Frontend tombol export di Omset & Transaksi

### Phase 3: Shift Kasir (1-2 hari)
1. Migration + model
2. API shift open/close/current/history
3. UI di Kasir + halaman shift history
4. Integrasi ke laporan omset

### Phase 4: Stok Opname (1-2 hari)
1. Migration + model
2. API opname draft/items/complete
3. UI tab opname di Stok
4. Filter pergerakan stok diperluas

### Phase 5: Fitur tambahan (sesuai kebutuhan)
Bisa dikerjakan bertahap sesuai prioritas bisnis

---

## Catatan Teknis

- **Database:** Gunakan migration Alembic untuk semua perubahan schema
- **Testing:** Jalankan `./scripts/smoke_test.sh` setelah perubahan backend
- **Rollback:** Siapkan backup DB sebelum migration besar (`./scripts/backup.sh`)
- **Permissions:** Validasi input, pakai `@roles_required`, jangan expose sensitive data
- **Timezone:** Konsisten pakai `Asia/Jakarta` (sudah di config)
- **Security:** Hindari query tanpa filter voided/paid di laporan

**Mulai dari Phase 1 (bug fixes) karena paling berdampak ke user harian.**
