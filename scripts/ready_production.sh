#!/usr/bin/env bash
set -euo pipefail

# ==========================================================
# Dagang POS - Ready Production Script
# ==========================================================
# Script ini akan mempersiapkan aplikasi untuk production:
# 1. Validasi environment (.env)
# 2. Build dan jalankan stack dengan docker compose
# 3. Tunggu hingga aplikasi sehat
# 4. Jalankan smoke test
# 5. Tampilkan informasi akses
# ==========================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERR]${NC} $1"; }

echo "============================================"
echo "  DAGANG POS - READY PRODUCTION"
echo "============================================"
echo ""

# 1. Validasi .env
log_info "1/6 Validasi konfigurasi environment..."
if [[ ! -f ".env" ]]; then
  log_error ".env tidak ditemukan!"
  echo "Salin .env.example ke .env dan isi nilai yang dibutuhkan:"
  echo "  cp .env.example .env"
  echo "  nano .env"
  exit 1
fi

# Check required variables
required_vars=(
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "POSTGRES_DB"
  "SECRET_KEY"
  "OWNER_PASSWORD"
  "BASE_URL"
  "CLOUDFLARED_NETWORK"
)

for var in "${required_vars[@]}"; do
  if ! grep -q "^${var}=" .env || grep -q "^${var}=$" .env || grep -q "^${var}=ganti" .env; then
    log_warn "Variable ${var} mungkin belum diisi dengan benar di .env"
  fi
done

log_success ".env ditemukan"
echo ""

# 2. Validasi docker
log_info "2/6 Validasi Docker..."
if ! command -v docker &> /dev/null; then
  log_error "Docker tidak terinstall"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  log_error "Docker Compose tidak terinstall"
  exit 1
fi

log_success "Docker dan Docker Compose tersedia"
echo ""

# 3. Buat direktori data
log_info "3/6 Menyiapkan direktori data..."
mkdir -p data/postgres data/uploads data/logs data/backups
touch data/.gitkeep
log_success "Direktori data siap"
echo ""

# 4. Build dan jalankan stack
log_info "4/6 Build dan menjalankan stack..."
log_info "Ini mungkin memakan waktu beberapa menit saat pertama kali..."
docker compose up -d --build
log_success "Stack berhasil dijalankan"
echo ""

# 5. Tunggu aplikasi sehat
log_info "5/6 Menunggu aplikasi siap..."
MAX_WAIT=180
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -sf http://localhost:8787/api/health > /dev/null 2>&1; then
    log_success "Aplikasi sehat dan siap digunakan"
    break
  fi
  echo -n "."
  sleep 5
  WAITED=$((WAITED + 5))
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
  log_error "Aplikasi tidak sehat setelah ${MAX_WAIT} detik"
  echo "Cek log: docker compose logs -f dagang-apps"
  exit 1
fi

# 6. Jalankan smoke test
log_info "6/6 Menjalankan smoke test..."
if [ -f "scripts/smoke_test.sh" ]; then
  chmod +x scripts/smoke_test.sh
  if ./scripts/smoke_test.sh; then
    log_success "Smoke test berhasil"
  else
    log_warn "Smoke test ada beberapa kegagalan, cek output di atas"
  fi
else
  log_warn "Smoke test tidak ditemukan, skip"
fi

echo ""
echo "============================================"
echo "  PRODUCTION READY!"
echo "============================================"
echo ""
echo "Akses aplikasi:"
echo "  Lokal: http://localhost:8787"
echo "  Publik: $(grep '^BASE_URL=' .env | cut -d= -f2 | tr -d '\"')"
echo ""
echo "Perintah berguna:"
echo "  Status:     docker compose ps"
echo "  Log:        docker compose logs -f dagang-apps"
echo "  Restart:    docker compose restart dagang-apps"
echo "  Backup DB:  ./scripts/backup.sh"
echo "  Stop:       docker compose down"
echo ""
echo "Default login owner:"
echo "  Username: $(grep '^OWNER_USERNAME=' .env | cut -d= -f2)"
echo "  Password: (sesuai yang di .env)"
echo ""
