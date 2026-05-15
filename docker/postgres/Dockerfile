# Project-local PostgreSQL (dev). Runtime config comes from docker-compose (POSTGRES_*).
FROM postgres:16-alpine

LABEL org.opencontainers.image.title="Attire RMS — Postgres"
LABEL org.opencontainers.image.description="PostgreSQL 16 for local RMS development"

HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 \
  CMD pg_isready -U rms -d rms_dev || exit 1
