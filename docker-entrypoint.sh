#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q; do
  sleep 1
done
echo "==> PostgreSQL is ready"

echo "==> Running prisma db push..."
npx prisma db push --skip-generate

# Seed only if the User table is empty (first run)
USER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM \"User\";" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "==> Seeding database (first run)..."
  npx prisma db seed
  echo "==> Seed completed"
else
  echo "==> Database already seeded ($USER_COUNT users found), skipping"
fi

echo "==> Starting app..."
exec npx tsx server.ts
