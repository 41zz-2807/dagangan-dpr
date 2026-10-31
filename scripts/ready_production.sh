#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
cd "${ROOT_DIR}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}[OK]${NC} %s\n" "$1"; }
log_warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_error() { printf "${RED}[ERR]${NC} %s\n" "$1" >&2; }

usage() {
  printf 'Usage: %s\n\n' "$(basename "$0")"
  printf 'Validasi konfigurasi, backup database aktif, build dan jalankan stack, lalu cek endpoint tanpa mengubah data aplikasi.\n'
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ "$#" -gt 0 ]]; then
  usage >&2
  exit 2
fi

env_value() {
  local key="$1" value
  value="$(awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${ENV_FILE}")"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "$value"
}

echo "============================================"
echo "  WARUNG DPR - READY PRODUCTION"
echo "============================================"

log_info "1/6 Memvalidasi konfigurasi production..."
if [[ ! -f "${ENV_FILE}" ]]; then
  log_error ".env tidak ditemukan. Buat dari .env.example dan isi nilai production."
  exit 1
fi

required_vars=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SECRET_KEY OWNER_PASSWORD BASE_URL CLOUDFLARED_NETWORK)
invalid_config=0
for var in "${required_vars[@]}"; do
  value="$(env_value "$var")"
  normalized="${value,,}"
  if [[ -z "$value" || "$normalized" == ganti-* || "$normalized" == changeme* || "$normalized" == change-me* || "$normalized" == your-* ]]; then
    log_error "${var} belum diisi atau masih memakai nilai contoh."
    invalid_config=1
  fi
done

SECRET_KEY_VALUE="$(env_value SECRET_KEY)"
if [[ ${#SECRET_KEY_VALUE} -lt 32 ]]; then
  log_error "SECRET_KEY harus memiliki minimal 32 karakter."
  invalid_config=1
fi
OWNER_PASSWORD_VALUE="$(env_value OWNER_PASSWORD)"
if [[ ${#OWNER_PASSWORD_VALUE} -lt 12 ]]; then
  log_error "OWNER_PASSWORD harus memiliki minimal 12 karakter."
  invalid_config=1
fi

BASE_URL="$(env_value BASE_URL)"
BASE_URL="${BASE_URL%/}"
if [[ ! "$BASE_URL" =~ ^https://[^/[:space:]]+$ ]]; then
  log_error "BASE_URL harus berupa URL production HTTPS, misalnya https://kasir.example.com."
  invalid_config=1
fi
CLOUDFLARED_NETWORK="$(env_value CLOUDFLARED_NETWORK)"

if [[ "$invalid_config" -ne 0 ]]; then
  log_error "Perbaiki .env sebelum melanjutkan. Nilai rahasia tidak ditampilkan."
  exit 1
fi
log_success "Konfigurasi production valid."

log_info "2/6 Memvalidasi Docker dan konfigurasi Compose..."
if ! command -v docker >/dev/null 2>&1; then
  log_error "Docker tidak terpasang."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  log_error "curl tidak terpasang."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  log_error "Docker Compose plugin tidak tersedia."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  log_error "Docker daemon tidak berjalan atau tidak dapat diakses."
  exit 1
fi
if ! docker compose config --quiet; then
  log_error "Konfigurasi docker-compose.yml atau interpolasi .env tidak valid."
  exit 1
fi
if ! docker network inspect "${CLOUDFLARED_NETWORK}" >/dev/null 2>&1; then
  log_error "Network Cloudflare '${CLOUDFLARED_NETWORK}' tidak ditemukan."
  log_error "Pastikan container tunnel sudah berjalan dan CLOUDFLARED_NETWORK benar."
  exit 1
fi
log_success "Docker, Compose, dan network Cloudflare tersedia."

log_info "3/6 Menyiapkan direktori data..."
mkdir -p data/postgres data/uploads data/logs data/backups
log_success "Direktori data siap."

log_info "4/6 Build image aplikasi..."
docker compose build dagang-apps
log_success "Image aplikasi berhasil dibuild."

if [[ -n "$(docker compose ps --status running -q dagang-db)" ]]; then
  log_info "Membuat backup database sebelum deployment..."
  "${ROOT_DIR}/scripts/backup.sh"
  log_success "Backup database selesai."
else
  log_warn "Container database belum berjalan; backup otomatis dilewati (deployment awal atau database sedang berhenti)."
fi

log_info "5/6 Menjalankan stack dan menunggu health check..."
docker compose up -d
MAX_WAIT="${MAX_WAIT_SECONDS:-180}"
deadline=$((SECONDS + MAX_WAIT))
while (( SECONDS < deadline )); do
  if curl -fsS --max-time 5 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    break
  fi
  printf '.'
  sleep 5
done
printf '\n'
if ! curl -fsS --max-time 5 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  log_error "Aplikasi belum sehat setelah ${MAX_WAIT} detik."
  printf 'Periksa log dengan: docker compose logs --tail=100 dagang-apps\n' >&2
  exit 1
fi
log_success "API lokal sehat."

log_info "6/6 Menjalankan pemeriksaan HTTP read-only..."
for path in / /manifest.webmanifest; do
  if curl -fsS --max-time 10 "http://127.0.0.1:8787${path}" >/dev/null; then
    log_success "HTTP ${path} tersedia."
  else
    log_error "HTTP ${path} gagal."
    exit 1
  fi
done

if curl -fsS --max-time 15 "${BASE_URL}/api/health" >/dev/null; then
  log_success "URL publik sehat: ${BASE_URL}"
else
  log_error "URL publik belum dapat diakses: ${BASE_URL}"
  log_error "Periksa DNS, tunnel Cloudflare, dan konfigurasi ingress."
  exit 1
fi

echo
echo "============================================"
echo "  PRODUCTION READY"
echo "============================================"
printf 'Lokal:  http://localhost:8787\n'
printf 'Publik: %s\n' "${BASE_URL}"
printf 'Owner:  %s\n' "$(env_value OWNER_USERNAME)"
echo
echo "Perintah operasional:"
echo "  Status:    docker compose ps"
echo "  Log:       docker compose logs -f --tail=100 dagang-apps"
echo "  Backup:    ./scripts/backup.sh"
echo "  Stop:      docker compose down (data tidak dihapus)"
