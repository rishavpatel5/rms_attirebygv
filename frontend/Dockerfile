# Web (frontend) image. Build from repository root (build context = repo root):
#   docker build -f frontend/Dockerfile -t attirebygv-web:local .
#
# On Railway: Root Directory = "/" and Dockerfile Path = "frontend/Dockerfile".
#
# NOTE: VITE_* values are baked in at BUILD time, not runtime. Pass VITE_API_URL
# (and optionally VITE_PUBLIC_INVOICE_BASE_URL) as service variables in Railway;
# they are forwarded to the build via the ARG lines below.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Must run full install (no --ignore-scripts): Vite/Rollup needs the Linux
# optional native package @rollup/rollup-linux-x64-gnu on this image.
RUN npm ci
COPY frontend ./frontend
# Build-time public config (Railway injects these as build args).
ARG VITE_API_URL
ARG VITE_PUBLIC_INVOICE_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_INVOICE_BASE_URL=$VITE_PUBLIC_INVOICE_BASE_URL
RUN npm run build -w @rms/web

FROM node:20-bookworm-slim AS runner
WORKDIR /app
# `serve` is a tiny static server; `-s` enables SPA fallback so React Router routes work.
RUN npm install -g serve@14
COPY --from=build /app/frontend/dist ./dist
EXPOSE 4173
# Railway injects PORT at runtime; serve binds 0.0.0.0 on it.
CMD ["sh", "-c", "serve -s dist -l ${PORT:-4173}"]
