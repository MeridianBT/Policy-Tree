# Build the Next.js app, then run it with only the dependencies the running
# container actually needs.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# The runtime layer's own install. `deps` above has to stay complete, because
# `next build` needs typescript, tailwindcss, postcss and autoprefixer - but
# none of those, nor eslint, vitest or playwright, has any business in a
# shipped image.
#
# Pruning is only safe because package.json is now honest about what the
# container runs. Three packages the entrypoint and the operational scripts
# need were declared dev-only: `prisma` (migrations, every boot), `tsx`
# (SEED_ON_BOOT, `npm run db:seed:uat`, `npm run set-password`) and `dotenv`.
#
# Measured rather than assumed, against the old manifest: only `tsx` actually
# disappeared under `--omit=dev`. `prisma` and `dotenv` survived by accident,
# arriving under the declared `@prisma/client` as
# client -> prisma -> @prisma/config -> c12 -> dotenv. That is a thread to hang
# migrations on: the day a Prisma release stops bundling the CLI, boot breaks
# and nothing in this file would explain why. Declared, all three are ours.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` imports every route to collect page data, which reaches
# lib/db.ts, which refuses to load without a connection string. Nothing
# connects during a build - no query runs and no migration is applied - but the
# import has to succeed, so the build stage is given a placeholder.
#
# It cannot leak into the running app: the runtime stage below starts from
# `base` rather than from here, so nothing set in this stage survives. The real
# DATABASE_URL arrives as an environment variable at container start, and
# lib/db.ts still refuses to run without one.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npx prisma generate && npm run build

# Still runs as root, and should not. The base image ships a `node` user at uid
# 1000, and the change is three lines - `chown node:node /app`, `--chown` on the
# COPYs, `USER node`. It is left out because it could not be tested: the
# environment this was written in cannot build the image at all (the registry,
# the Debian mirrors and npm are each unreachable from a build container), and
# the failure mode is the container starting as an ordinary user and finding it
# cannot write somewhere - which shows up on the first request, in production,
# on a demo people are being shown. It belongs in the next change made
# somewhere a build can be run.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/generated ./generated
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/lib ./lib
COPY package.json prisma.config.ts next.config.ts tsconfig.json ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "start"]
