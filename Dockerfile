# ============================================================================
# Stage 1: Build Frontend (Vite) & Backend (TypeScript)
# ============================================================================
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ============================================================================
# Stage 2: Lightweight Production Runtime (<150MB RAM)
# ============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache git ca-certificates

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=/app/data/dnd.sqlite
ENV VAULT_DIR=/app/data/vault

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "dist/server/server/index.js"]
