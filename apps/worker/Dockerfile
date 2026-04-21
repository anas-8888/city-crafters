FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json nest-cli.json ./

COPY libs/ ./libs/
COPY apps/worker/ ./apps/worker/

RUN npm install

# Build — webpack bundles @app/common aliases into dist/apps/worker/main.js
RUN npm run build:worker

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/apps/worker/main"]
