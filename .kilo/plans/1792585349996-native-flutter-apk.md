# Plan: Native Flutter POS (Warung DPR) — phased, matching web backend

## Goal
Build a new native Flutter app that talks to the existing Flask backend (`https://dagangan.smart-plus.id/api`), replacing the offline `/work` app. Phased rollout; phase 1 delivers a usable kasir (login → produk → cart → checkout).

## Base URL / API
- Base: `https://dagangan.smart-plus.id`
- API prefix: `/api`
- Auth: POST `/api/auth/login` (JSON {username,password}) → JWT in httpOnly cookie (web) or token in response? Need to verify response shape. Flask uses cookie auth; Flutter must handle cookies via `http` + cookie jar or use token if returned.
- Products: GET `/api/products` → list; GET `/api/products/<id>`.
- Sales: POST `/api/sales` (items, payments, discount, customer, note).
- Stock: POST `/api/stock/adjust`.
- Reports: GET `/api/reports/summary?from=&to=`.

## Phases

### Phase 1 — Kasir core (MVP)
- Scaffold new project in container: `/app/warung_native` (flutter create).
- Dependencies: http, shared_preferences, provider (or riverpod), intl.
- Screens: Splash, Login, Home (menu), ProductGrid, Cart (bottom sheet), Checkout (payment method), Success.
- Services: ApiClient with base URL + auth (store token in shared_preferences if API returns it; else cookie jar).
- State: CartProvider (items, qty, totals).
- Build APK, set icon = web logo (PNG), name "Warung DPR", version 1.0.0, upload to /apk.

### Phase 2 — Stok & Produk (owner)
- Stock summary, adjust stok, low stock.
- Product CRUD (owner), image upload (multipart).
- Categories.

### Phase 3 — Transaksi & Laporan
- Riwayat transaksi, detail, void (owner).
- Omset dashboard, top products, by method/cashier.
- Pengeluaran list + create.

### Phase 4 — User, Shift, Opname
- User management (owner).
- Shift open/close.
- Stok opname.

## Decisions needed
1. Auth mechanism for Flutter: does `/api/auth/login` return a token in JSON, or only sets cookie? Need to inspect response. If cookie-only, use `cookie_jar` package + `dio`.
2. Offline capability: phase 1 online-only (simpler); offline sync later.
3. State management: Provider (simplest) vs Riverpod.

## Validation
- Phase 1: login with owner/kasir, browse products, add to cart, checkout cash, see success.
- Build APK in container, install on device, no crash.

## Risks
- API response shapes must match (inspect `types.ts` / backend serializers).
- Image upload multipart.
- No device for runtime debug (need logcat from user).

## Open question
Should phase 1 be online-only or include offline queue? (Recommendation: online-only first.)