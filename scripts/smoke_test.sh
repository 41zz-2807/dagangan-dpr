#!/usr/bin/env bash
# Smoke test API Dagang (tahap 1: auth, role, audit, SPA).
#
# Pakai: ./scripts/smoke_test.sh
# Environment: BASE_URL (default http://localhost:8787)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
TMP_DIR="$(mktemp -d)"
PASS=0
FAIL=0

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi

OWNER_USERNAME="${OWNER_USERNAME:-owner}"
OWNER_PASSWORD="${OWNER_PASSWORD:?OWNER_PASSWORD belum diset (lihat .env)}"

cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1 (dapat: $2)"; FAIL=$((FAIL+1)); }
check() { # check <label> <expected> <actual>
  if [[ "$2" == "$3" ]]; then ok "$1 ($3)"; else fail "$1" "$3 (harap: $2)"; fi
}

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
csrf_from() { grep "$1" "$2" | awk '{print $7}'; }

echo "== 1. Health =="
HEALTH="$(curl -s "${BASE_URL}/api/health")"
echo "  ${HEALTH}"
check "status ok" "ok" "$(echo "$HEALTH" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])' 2>/dev/null)"

echo "== 2. Login owner =="
LOGIN_CODE="$(code -c "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${OWNER_USERNAME}\",\"password\":\"${OWNER_PASSWORD}\"}")"
check "login owner" "200" "${LOGIN_CODE}"
CSRF="$(csrf_from csrf_access_token "${TMP_DIR}/owner.jar")"
[[ -n "${CSRF}" ]] && ok "csrf_access_token tersedia" || fail "csrf_access_token tersedia" "kosong"

echo "== 3. Autentikasi =="
check "GET /api/auth/me (login)" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/auth/me")"
check "GET /api/users tanpa cookie" "401" "$(code "${BASE_URL}/api/users")"

echo "== 4. Proteksi CSRF =="
check "POST /api/users tanpa X-CSRF-TOKEN" "401" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/users" \
     -H 'Content-Type: application/json' -d '{"username":"x","password":"rahasia123"}')"

echo "== 5. Role owner =="
KASIR_NAME="smoke_$(date +%s)"
CREATE_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/users" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
  -d "{\"username\":\"${KASIR_NAME}\",\"password\":\"rahasia123\",\"role\":\"kasir\",\"full_name\":\"Smoke Test\"}")"
check "create kasir" "201" "${CREATE_CODE}"

KASIR_ID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/users" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(next((u['id'] for u in items if u['username']=='${KASIR_NAME}'), 0))" 2>/dev/null)"
[[ "${KASIR_ID}" != "0" ]] && ok "kasir dibuat (id=${KASIR_ID})" || fail "kasir dibuat" "tidak ditemukan"

check "update kasir (PATCH)" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X PATCH "${BASE_URL}/api/users/${KASIR_ID}" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d '{"full_name":"Smoke Test Update"}')"

echo "== 6. Role kasir =="
code -c "${TMP_DIR}/kasir.jar" -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${KASIR_NAME}\",\"password\":\"rahasia123\"}" >/dev/null
check "kasir -> /api/users (harus 403)" "403" "$(code -b "${TMP_DIR}/kasir.jar" "${BASE_URL}/api/users")"
check "kasir -> /api/audit (harus 403)" "403" "$(code -b "${TMP_DIR}/kasir.jar" "${BASE_URL}/api/audit")"
check "kasir -> /api/auth/me (harus 200)" "200" "$(code -b "${TMP_DIR}/kasir.jar" "${BASE_URL}/api/auth/me")"

echo "== 7. Nonaktifkan kasir =="
check "deactivate kasir" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X DELETE "${BASE_URL}/api/users/${KASIR_ID}" \
     -H "X-CSRF-TOKEN: ${CSRF}")"
check "login kasir nonaktif (harus 403)" "403" \
  "$(code -X POST "${BASE_URL}/api/auth/login" -H 'Content-Type: application/json' \
     -d "{\"username\":\"${KASIR_NAME}\",\"password\":\"rahasia123\"}")"

echo "== 8. Audit log =="
check "audit API owner" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/audit?per_page=5")"
AUDIT_FILE="$(ls -1t "${ROOT_DIR}/data/logs"/audit-*.log 2>/dev/null | head -1)"
if [[ -n "${AUDIT_FILE}" && -s "${AUDIT_FILE}" ]]; then
  ok "file audit tersedia: $(basename "$AUDIT_FILE")"
else
  fail "file audit tersedia" "tidak ditemukan"
fi

echo "== 9. SPA & aset =="
check "GET / (index.html)" "200" "$(code "${BASE_URL}/")"
check "GET /kasir (client route)" "200" "$(code "${BASE_URL}/kasir")"
check "GET /manifest.webmanifest" "200" "$(code "${BASE_URL}/manifest.webmanifest")"
check "GET /api/tidak-ada (JSON 404)" "404" "$(code "${BASE_URL}/api/tidak-ada")"

echo "== 10. Logout =="
check "logout" "200" "$(code -b "${TMP_DIR}/owner.jar" -c "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/auth/logout" -H "X-CSRF-TOKEN: ${CSRF}")"
check "me setelah logout (harus 401)" "401" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/auth/me")"

# ---------------------------------------------------------------- tahap 2 ---
echo "== 11. Kategori & Produk (owner) =="
code -c "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${OWNER_USERNAME}\",\"password\":\"${OWNER_PASSWORD}\"}" >/dev/null
CSRF="$(csrf_from csrf_access_token "${TMP_DIR}/owner.jar")"

CATEGORY_NAME="Smoke Category $(date +%s)"
CATEGORY_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/categories" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
  -d "{\"name\":\"${CATEGORY_NAME}\"}")"
check "create kategori" "201" "${CATEGORY_CODE}"
CATEGORY_ID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/categories" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(next((c['id'] for c in items if c['name']=='${CATEGORY_NAME}'), 0))" 2>/dev/null)"

SKU="SMK-$(date +%s)"
PRODUCT_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/products" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
  -d "{\"sku\":\"${SKU}\",\"name\":\"Produk Smoke\",\"price_sale\":\"15000\",\"price_purchase\":\"12000\",\"stock\":10,\"min_stock\":2,\"category_id\":${CATEGORY_ID}}")"
check "create produk" "201" "${PRODUCT_CODE}"
PRODUCT_ID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products?q=${SKU}" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(items[0]['id'] if items else 0)" 2>/dev/null)"

check "harga tidak diterima string rusak" "422" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/products" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"sku\":\"${SKU}-X\",\"name\":\"Salah\",\"price_sale\":\"-5\"}")"
check "SKU duplikat ditolak" "409" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/products" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"sku\":\"${SKU}\",\"name\":\"Duplikat\",\"price_sale\":\"1000\"}")"
check "update harga produk" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X PATCH "${BASE_URL}/api/products/${PRODUCT_ID}" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d '{"price_sale":"17000"}')"

echo "== 12. Gambar produk =="
TMP_PNG="${TMP_DIR}/gambar.png"
printf 'ini bukan gambar\n' > "${TMP_DIR}/bukan-gambar.txt"
python3 - "${TMP_PNG}" <<'PY'
import struct, sys, zlib
w, h = 60, 40
rows = []
for y in range(h):
    row = bytearray([0])
    for x in range(w):
        row += bytes((x * 4 % 256, y * 6 % 256, 200, 255))
    rows.append(bytes(row))
raw = b"".join(rows)
def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(raw, 6))
png += chunk(b"IEND", b"")
open(sys.argv[1], "wb").write(png)
PY
UPLOAD_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/products/${PRODUCT_ID}/image" \
  -H "X-CSRF-TOKEN: ${CSRF}" -F "file=@${TMP_PNG}")"
check "upload gambar produk" "201" "${UPLOAD_CODE}"
IMG_URL="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products/${PRODUCT_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['product'].get('image_url') or '')" 2>/dev/null)"
if [[ -n "${IMG_URL}" ]]; then
  check "gambar bisa diakses" "200" "$(code "${BASE_URL}${IMG_URL}")"
else
  fail "gambar bisa diakses" "tidak ada image_url"
fi
check "upload file non-gambar ditolak" "400" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/uploads/product-image" \
     -H "X-CSRF-TOKEN: ${CSRF}" -F "file=@${TMP_DIR}/bukan-gambar.txt")"

echo "== 13. Stok =="
check "adjust stok tanpa alasan (harus 422)" "422" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/stock/adjust" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"product_id\":${PRODUCT_ID},\"mode\":\"delta\",\"qty\":-1,\"reason\":\"x\"}")"
check "stok minus ditolak (harus 409)" "409" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/stock/adjust" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"product_id\":${PRODUCT_ID},\"mode\":\"delta\",\"qty\":-9999,\"reason\":\"Melebihi stok\"}")"
check "adjust stok valid" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/stock/adjust" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"product_id\":${PRODUCT_ID},\"mode\":\"delta\",\"qty\":-3,\"reason\":\"Uji smoke test\"}")"
NEW_STOCK="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products/${PRODUCT_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['product']['stock'])" 2>/dev/null)"
check "stok berkurang sesuai delta" "7" "${NEW_STOCK}"
check "daftar pergerakan stok" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/stock/movements?product_id=${PRODUCT_ID}")"
check "ringkasan stok" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/stock/summary")"

echo "== 14. Kasir tidak boleh master data =="
# kasir baru (kasir sebelumnya sudah dinonaktifkan pada langkah 7)
KASIR2_NAME="smoke_kasir_$(date +%s)"
code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/users" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
  -d "{\"username\":\"${KASIR2_NAME}\",\"password\":\"rahasia123\",\"role\":\"kasir\"}" >/dev/null
code -c "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${KASIR2_NAME}\",\"password\":\"rahasia123\"}" >/dev/null
K2CSRF="$(csrf_from csrf_access_token "${TMP_DIR}/kasir2.jar")"
check "kasir create produk (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/products" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" \
     -d '{"sku":"KASIR-1","name":"Tidak Boleh","price_sale":"1000"}')"
check "kasir create kategori (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/categories" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" -d '{"name":"Tidak Boleh"}')"
check "kasir upload gambar (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/uploads/product-image" \
     -H "X-CSRF-TOKEN: ${K2CSRF}" -F "file=@${TMP_PNG}")"
check "kasir adjust stok (harus 200)" "200" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/stock/adjust" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" \
     -d "{\"product_id\":${PRODUCT_ID},\"mode\":\"delta\",\"qty\":-1,\"reason\":\"Uji kasir\"}")"
check "kasir list produk (harus 200)" "200" "$(code -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/products")"

echo "== 15. Audit trail tahap 2 =="
for ACTION in category.create product.create product.price_change stock.adjust product.image_upload; do
  FOUND="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/audit?action=${ACTION}&per_page=1" | python3 -c "
import json,sys
print(json.load(sys.stdin)['total'])" 2>/dev/null)"
  if [[ "${FOUND}" -gt 0 ]]; then ok "audit ${ACTION} tercatat"; else fail "audit ${ACTION} tercatat" "0"; fi
done

echo "== 16. Bersihkan data uji =="
check "hapus produk uji" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X DELETE "${BASE_URL}/api/products/${PRODUCT_ID}" -H "X-CSRF-TOKEN: ${CSRF}")"
check "hapus kategori uji" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" -X DELETE "${BASE_URL}/api/categories/${CATEGORY_ID}" -H "X-CSRF-TOKEN: ${CSRF}")"

echo
echo "== 17. Transaksi penjualan (tahap 3) =="
SALE_MARK="smoke-test-$(date +%s)"
SALE_SKU="SALE-$(date +%s)"
SALE_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/products" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
  -d "{\"sku\":\"${SALE_SKU}\",\"name\":\"Produk Sale Smoke\",\"price_sale\":\"10000\",\"price_purchase\":\"8000\",\"stock\":50,\"min_stock\":5}")"
check "create produk uji sale" "201" "${SALE_CODE}"
SALE_PRODUCT_ID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products?q=${SALE_SKU}" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(items[0]['id'] if items else 0)" 2>/dev/null)"

SALE_BODY="{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":2}],\"payments\":[{\"method\":\"cash\",\"amount\":\"50000\"}],\"note\":\"${SALE_MARK}\"}"
SALE_RESULT="$(curl -s -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d "${SALE_BODY}")"
SALE_ID="$(echo "$SALE_RESULT" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['id'])" 2>/dev/null)"
SALE_TOTAL="$(echo "$SALE_RESULT" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['total'])" 2>/dev/null)"
SALE_CHANGE="$(echo "$SALE_RESULT" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['payments'][0]['change_amount'])" 2>/dev/null)"
SALE_INVOICE="$(echo "$SALE_RESULT" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['invoice_no'])" 2>/dev/null)"
check "create sale cash" "201" "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d "${SALE_BODY}")"
check "total dihitung server" "20000.00" "${SALE_TOTAL}"
check "kembalian dihitung server" "30000.00" "${SALE_CHANGE}"
case "${SALE_INVOICE}" in
  TRX-*-?????) ok "nomor invoice berformat TRX (${SALE_INVOICE})" ;;
  *) fail "nomor invoice berformat TRX" "${SALE_INVOICE}" ;;
esac

STOCK_AFTER="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products/${SALE_PRODUCT_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['product']['stock'])" 2>/dev/null)"
check "stok berkurang sesuai qty" "46" "${STOCK_AFTER}"
MOVEMENT_COUNT="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/stock/movements?product_id=${SALE_PRODUCT_ID}" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(sum(1 for m in items if m['movement_type'] == 'sale'))" 2>/dev/null)"
check "pergerakan sale tercatat" "2" "${MOVEMENT_COUNT}"

check "stok tidak cukup (harus 409)" "409" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":9999}],\"payments\":[{\"method\":\"cash\",\"amount\":\"99999999\"}],\"note\":\"${SALE_MARK}\"}")"
check "pembayaran kurang (harus 422)" "422" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"cash\",\"amount\":\"100\"}],\"note\":\"${SALE_MARK}\"}")"
check "keranjang kosong (harus 422)" "422" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[],\"payments\":[{\"method\":\"cash\",\"amount\":\"1000\"}],\"note\":\"${SALE_MARK}\"}")"
check "transfer tanpa amount (harus 201)" "201" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"transfer\"}],\"note\":\"${SALE_MARK}\"}")"
check "qris dengan referensi (harus 201)" "201" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"qris\",\"reference\":\"QR-SMOKE\"}],\"note\":\"${SALE_MARK}\"}")"
check "diskon owner (harus 201)" "201" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"cash\",\"amount\":\"10000\"}],\"discount\":\"2000\",\"note\":\"${SALE_MARK}\"}")"

echo "== 18. Transaksi oleh kasir =="
KASIR_SALE_CODE="$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/sales" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" \
  -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"cash\",\"amount\":\"10000\"}],\"note\":\"${SALE_MARK}\"}")"
check "kasir create sale" "201" "${KASIR_SALE_CODE}"
check "kasir diskon (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/sales" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" \
     -d "{\"items\":[{\"product_id\":${SALE_PRODUCT_ID},\"qty\":1}],\"payments\":[{\"method\":\"cash\",\"amount\":\"10000\"}],\"discount\":\"1000\",\"note\":\"${SALE_MARK}\"}")"
KASIR_SALES="$(curl -s -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/sales" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(len(set(i['cashier']['username'] for i in items)))" 2>/dev/null)"
check "kasir hanya melihat transaksinya sendiri" "1" "${KASIR_SALES}"
check "kasir tidak bisa buka sale orang lain (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/sales/${SALE_ID}")"
check "owner bisa buka detail sale" "200" \
  "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/sales/${SALE_ID}")"

echo "== 19. Laporan omset =="
check "summary omset owner" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/reports/summary")"
check "omset harian" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/reports/daily")"
check "produk terlaris" "200" "$(code -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/reports/top-products")"
check "kasir summary omset" "200" "$(code -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/reports/summary")"
OWNER_OMSET="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/reports/summary" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d['transaksi'])" 2>/dev/null)"
KASIR_OMSET="$(curl -s -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/reports/summary" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d['transaksi'])" 2>/dev/null)"
if [[ "${OWNER_OMSET}" -gt "${KASIR_OMSET}" ]]; then
  ok "omset owner mencakup transaksi kasir (${OWNER_OMSET} > ${KASIR_OMSET})"
else
  fail "omset owner mencakup transaksi kasir" "owner=${OWNER_OMSET} kasir=${KASIR_OMSET}"
fi
KASIR_RANGE="$(curl -s -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/reports/summary?from=2020-01-01&to=2020-01-05" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d['range']['from'] == d['range']['to'])" 2>/dev/null)"
check "kasir dipaksa omset harian saja" "True" "${KASIR_RANGE}"

echo "== 20. Pembatalan transaksi (void, owner) =="
STOCK_BEFORE_VOID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products/${SALE_PRODUCT_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['product']['stock'])" 2>/dev/null)"
check "void tanpa alasan (harus 422)" "422" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales/${SALE_ID}/void" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d '{"reason":"x"}')"
check "kasir void (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" -X POST "${BASE_URL}/api/sales/${SALE_ID}/void" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${K2CSRF}" -d '{"reason":"batal"}')"
VOID_CODE="$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales/${SALE_ID}/void" \
  -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d '{"reason":"Pelanggan membatalkan"}')"
check "void oleh owner" "200" "${VOID_CODE}"
check "status menjadi void" "void" \
  "$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/sales/${SALE_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['status'])" 2>/dev/null)"
STOCK_AFTER_VOID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/products/${SALE_PRODUCT_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['product']['stock'])" 2>/dev/null)"
check "stok dikembalikan setelah void" "$((STOCK_BEFORE_VOID + 2))" "${STOCK_AFTER_VOID}"
check "void dua kali (harus 409)" "409" \
  "$(code -b "${TMP_DIR}/owner.jar" -X POST "${BASE_URL}/api/sales/${SALE_ID}/void" \
     -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: ${CSRF}" -d '{"reason":"lagi"}')"

echo "== 21. Struk PDF & struk publik =="
PDF_TYPE="$(curl -s -b "${TMP_DIR}/owner.jar" -o /dev/null -w "%{content_type}" "${BASE_URL}/api/sales/${SALE_ID}/receipt.pdf")"
check "struk PDF (api)" "application/pdf" "${PDF_TYPE}"
RECEIPT_TOKEN="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/sales/${SALE_ID}" | python3 -c "
import json,sys
print(json.load(sys.stdin)['sale']['receipt_token'])" 2>/dev/null)"
check "struk publik HTML" "200" "$(code "${BASE_URL}/r/${RECEIPT_TOKEN}")"
check "struk publik PDF" "200" "$(code "${BASE_URL}/r/${RECEIPT_TOKEN}/pdf")"
check "struk token tak dikenal (harus 404)" "404" "$(code "${BASE_URL}/r/token-tidak-ada")"
check "kasir tidak bisa ambil PDF sale orang lain (harus 403)" "403" \
  "$(code -b "${TMP_DIR}/kasir2.jar" "${BASE_URL}/api/sales/${SALE_ID}/receipt.pdf")"

echo "== 22. Audit penjualan =="
for ACTION in sale.create sale.void; do
  SALE_AUDIT="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/audit?action=${ACTION}&per_page=1" | python3 -c "
import json,sys
print(json.load(sys.stdin)['total'])" 2>/dev/null)"
  if [[ "${SALE_AUDIT}" -gt 0 ]]; then ok "audit ${ACTION} tercatat"; else fail "audit ${ACTION} tercatat" "0"; fi
done

echo "== 23. Bersihkan data uji penjualan =="
KASIR2_ID="$(curl -s -b "${TMP_DIR}/owner.jar" "${BASE_URL}/api/users?q=${KASIR2_NAME}" | python3 -c "
import json,sys
items = json.load(sys.stdin)['items']
print(items[0]['id'] if items else 0)" 2>/dev/null)"
if [[ "${KASIR2_ID}" != "0" ]]; then
  check "nonaktifkan kasir uji" "200" \
    "$(code -b "${TMP_DIR}/owner.jar" -X DELETE "${BASE_URL}/api/users/${KASIR2_ID}" -H "X-CSRF-TOKEN: ${CSRF}")"
fi
if command -v docker >/dev/null 2>&1 && [[ -f "${ROOT_DIR}/docker-compose.yml" ]]; then
  docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T dagang-db psql -U dagang -d dagang -q <<SQL >/dev/null 2>&1
DELETE FROM stock_movements WHERE sale_id IN (SELECT id FROM sales WHERE note LIKE '${SALE_MARK}%');
DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE note LIKE '${SALE_MARK}%');
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE note LIKE '${SALE_MARK}%');
DELETE FROM sales WHERE note LIKE '${SALE_MARK}%';
UPDATE products SET stock = 50 WHERE id = ${SALE_PRODUCT_ID};
DELETE FROM products WHERE id = ${SALE_PRODUCT_ID};
DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE sku = '${SKU}');
DELETE FROM products WHERE sku = '${SKU}';
DELETE FROM categories WHERE name = '${CATEGORY_NAME}';
DELETE FROM users WHERE username = '${KASIR2_NAME}';
SQL
  ok "data uji penjualan dibersihkan"
else
  fail "data uji penjualan dibersihkan" "docker tidak tersedia"
fi

echo
echo "================================"
echo " LULUS: ${PASS}   GAGAL: ${FAIL}"
echo "================================"
[[ "${FAIL}" -eq 0 ]]
