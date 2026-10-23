#!/bin/sh
# Entry point container dagang-apps:
#   1. tunggu database siap  2. jalankan migrasi alembic
#   3. siapkan akun owner    4. jalankan gunicorn
set -e

echo "[dagang] 1/4 menunggu database dagang-db ..."
python -m dagang.cli wait-db

echo "[dagang] 2/4 menjalankan migrasi (alembic upgrade head) ..."
alembic upgrade head

echo "[dagang] 2.5/4 membuat tabel baru (shift, opname, pengeluaran) ..."
python -c "from dagang import create_app; from dagang.extensions import db; app = create_app(); app.app_context().push(); db.create_all()"

echo "[dagang] 2.6/4 seeding kategori pengeluaran default ..."
python -c "
from dagang import create_app
from dagang.extensions import db
from dagang.models import PengeluaranKategori
app = create_app()
with app.app_context():
    defaults = ['Operasional', 'Gaji Karyawan', 'Sewa', 'Listrik', 'Internet', 'Pembelian Stok', 'Lainnya']
    for nama in defaults:
        if not db.session.query(PengeluaranKategori).filter_by(nama=nama).first():
            db.session.add(PengeluaranKategori(nama=nama))
    db.session.commit()
print('[dagang] kategori pengeluaran siap')
"

echo "[dagang] 3/4 menyiapkan akun owner ..."
python -m dagang.cli seed-owner

echo "[dagang] 4/4 menjalankan gunicorn di 0.0.0.0:8787 ..."
exec gunicorn \
    --bind "0.0.0.0:8787" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --access-logfile /data/logs/access.log \
    --error-logfile /data/logs/error.log \
    --capture-output \
    "dagang:create_app()"
