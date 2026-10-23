# ==============================================================================
# Dagang POS - multi stage build
#   stage 1 : build React (vite)  ->  dist/
#   stage 2 : runtime python, menyajikan API + static hasil build
# ==============================================================================

# ------------------------------- Frontend ------------------------------------
FROM node:22-bookworm-slim AS web

WORKDIR /web
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY frontend/ ./
# API dipanggil pada origin yang sama (Flask menyajikan SPA), jadi base URL default "/api"
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# ------------------------------- Runtime -------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Jakarta

# lib pango/cairo untuk WeasyPrint (struk PDF), libffi shared-mime-info untuk font
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libffi8 \
        shared-mime-info \
        fonts-dejavu-core \
        tzdata \
        curl \
    && ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/ /app/
COPY --from=web /web/dist /app/static

# user non-root (uid 1000) supaya file di /data tidak root-owned di host
RUN useradd --uid 1000 --create-home --shell /bin/bash dagang \
    && mkdir -p /data/uploads /data/logs /data/backups \
    && chown -R dagang:dagang /app /data \
    && chmod +x /app/entrypoint.sh

USER dagang

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8787/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
