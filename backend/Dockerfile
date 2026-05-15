# API image (optional). Build from repository root:
#   docker build -f backend/Dockerfile -t attirebygv-api:local .
#
# Run (needs env at runtime):
#   docker run --env-file backend/.env -p 4000:4000 attirebygv-api:local

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --ignore-scripts
COPY backend/prisma ./backend/prisma
WORKDIR /app/backend
RUN npx prisma generate
WORKDIR /app
COPY backend ./backend
RUN npm run build -w @rms/api
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/backend/package.json ./backend/package.json
COPY --from=deps /app/frontend/package.json ./frontend/package.json
COPY --from=deps /app/backend/dist ./backend/dist
COPY --from=deps /app/backend/prisma ./backend/prisma
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
