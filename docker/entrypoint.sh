#!/bin/sh
# Apply any pending migrations before the app accepts traffic. Safe to run on
# every boot: `migrate deploy` is a no-op when the schema is already current.
set -e
echo "Applying database migrations…"
npx prisma migrate deploy
exec "$@"
