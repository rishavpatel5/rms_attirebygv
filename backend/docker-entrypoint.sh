#!/bin/sh
set -e

# Railway injects DATABASE_URL, DIRECT_URL, PORT, and other secrets at runtime.
# This script applies pending Prisma migrations to that database, then starts the API.
#
# Dev/prod separation:
#   - Local dev: use backend/.env (dev Supabase) and `npm run db:migrate` while coding.
#   - Prod (Railway): set prod DATABASE_URL + DIRECT_URL in service variables only.
#   - On each deploy/restart, this entrypoint runs `prisma migrate deploy` against prod.

echo "Applying Prisma migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "Starting API..."
exec node dist/index.js
