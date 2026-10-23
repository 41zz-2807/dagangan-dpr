#!/usr/bin/env bash
# Backup database Dagang: pg_dump via docker exec -> ./data/backups (rotasi 14 hari)
#
# Pakai:  ./scripts/backup.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
DB_CONTAINER="${DB_CONTAINER:-dagang-db}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER belum diset (lihat .env)}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB belum diset (lihat .env)}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTFILE="${BACKUP_DIR}/dagang-${TIMESTAMP}.sql.gz"

echo "[backup] dumping database ${POSTGRES_DB} dari ${DB_CONTAINER} ..."
docker exec "${DB_CONTAINER}" pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --clean --if-exists --no-owner --no-privileges --no-owner 2>/dev/null \
  | gzip -9 > "${OUTFILE}"

# sanity check: file harus gzip valid dan tidak kosong
if [[ ! -s "${OUTFILE}" ]]; then
  echo "[backup] GAGAL: file backup kosong" >&2
  exit 1
fi
gzip -t "${OUTFILE}"

echo "[backup] selesai: ${OUTFILE} ($(du -h "${OUTFILE}" | cut -f1))"

# --- rotasi -----------------------------------------------------------------
DELETED="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'dagang-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] rotasi: ${DELETED} berkas lebih tua dari ${RETENTION_DAYS} hari dihapus"

# --- simpan symlink terbaru -------------------------------------------------
ln -sfn "${OUTFILE}" "${BACKUP_DIR}/dagang-latest.sql.gz"
echo "[backup] symlink terbaru: ${BACKUP_DIR}/dagang-latest.sql.gz"
