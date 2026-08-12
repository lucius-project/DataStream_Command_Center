FROM node:22-bookworm-slim

# node:XX-alpine (musl libc) has a getaddrinfo bug: it returns IPv6-only
# results for dual-stack hostnames even when the container has no IPv6
# route at all, causing ENETUNREACH on every outbound HTTPS call (Graph,
# login.microsoftonline.com, etc). glibc handles this correctly.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app

# The built-in `node` user is uid/gid 1000, matching the typical host dev
# user — keeps bind-mounted files (including Prisma's generated client)
# writable from the host instead of ending up root-owned.
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]
