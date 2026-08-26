#!/bin/sh
# Apply any pending migrations, then hand over to the app.
#
# `migrate deploy` is a no-op when the schema is already current, so this is
# safe on every boot and on every replica.
#
# Most of what follows is about failing legibly. When this script exits, the
# container never listens, and a platform health check reports only "service
# unavailable" - which says nothing about why. Printing the actual reason here
# is the difference between a five-minute fix and an afternoon.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "──────────────────────────────────────────────────────────────"
  echo "DATABASE_URL is not set, so there is nothing to migrate against."
  echo ""
  echo "On Railway: add a PostgreSQL service, then set DATABASE_URL on"
  echo "THIS service to the reference"
  echo ""
  echo "    \${{Postgres.DATABASE_URL}}"
  echo ""
  echo "typed exactly like that, braces included, substituting the"
  echo "database service's own name if it is not called Postgres."
  echo "──────────────────────────────────────────────────────────────"
  exit 1
fi

# The database can still be starting when this container is. A few retries
# turn a first-deploy race into a slightly slower boot rather than a failure.
attempt=1
max=10
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max" ]; then
    echo "──────────────────────────────────────────────────────────────"
    echo "Migrations failed $max times; giving up."
    echo ""
    echo "The usual causes, in order:"
    echo "  1. DATABASE_URL points somewhere unreachable. On Railway it"
    echo "     should be the \${{Postgres.DATABASE_URL}} reference, not a"
    echo "     pasted value - the internal host only resolves between"
    echo "     services in the same project."
    echo "  2. The database service is not running yet."
    echo "  3. Credentials are wrong."
    echo ""
    echo "The Prisma error above this block says which."
    echo "──────────────────────────────────────────────────────────────"
    exit 1
  fi
  echo "Migration attempt $attempt of $max failed; retrying in 5s…"
  attempt=$((attempt + 1))
  sleep 5
done

echo "Migrations applied."

# Optional one-time seeding, for a platform that offers no shell. The script
# refuses to touch a database that already has accounts, so this is safe to
# leave set - it fills an empty database once and does nothing thereafter.
if [ -n "$SEED_ON_BOOT" ]; then
  npx tsx prisma/seed-if-empty.ts
fi

echo "Starting the application on port ${PORT:-3000}…"
exec "$@"
