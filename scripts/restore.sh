#!/usr/bin/env bash
# Restore database Dagang dari file backup .sql.gz
#
# Pakai:  ./scripts/restore.sh data/backups/dNlNG-20261021-120000.sql.gz
#         ./scripts/restore.sh latest        (pakai symlink dagang-latest.sql.gz)
#
# PERINGATAN: restore menimpa seluruh isi database.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
DB_CONTAINER="${DB_CONTAINER:-dagang-db}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/data/backups}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER belum diset (lihat .env)}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB belum diset (lihat .env)}"

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  echo "Pemakaian: $0 <file.sql.gz|latest>" >&2
  exit 1
fi

if [[ "${TARGET}" == "latest" ]]; then
  TARGET="${BACKUP_DIR}/dagang-latest.sql.gz"
fi

if [[ ! -f "${TARGET}" ]]; then
  echo "[restore] file tidak ditemukan: ${TARGET}" >&2
  exit 1
fi

gzip -t "${TARGET}"

read -r -p "[restore] Tulis ulang database '${POSTGRES_DB}' dari ${TARGET}? (y/N) " answer
if [[ "${answer}" != "y" && "${answer}" != "Y" ]]; then
  echo "[restore] dibatalkan"
  exit 0
fi

echo "[restore] mengimpor backup ke ${DB_CONTAINER}/${POSTGRES_DB} ..."
gunzip -c "${TARGET}" | docker exec -i "${DB_CONTAINER}" \
  psql --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  --set ON_ERROR_STOP=1

echo "[restore] selesai. Restart aplikasi bila perlu: docker compose restart dagang-apps"
