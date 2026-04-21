FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and config first (better layer caching)
COPY package*.json ./
COPY tsconfig.json nest-cli.json ./

# Copy source code
COPY libs/ ./libs/
COPY apps/api/ ./apps/api/

# Install ALL dependencies (including devDeps needed for build)
RUN npm install

# Build — webpack bundles @app/common aliases into dist/apps/api/main.js
RUN npm run build:api

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Copy the webpack bundle from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/apps/api/main"]
