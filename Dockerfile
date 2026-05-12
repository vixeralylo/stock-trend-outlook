# ============================================================
# Saham Indonesia Analyzer - Node.js Express server
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install hanya production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ---------- Runtime image ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# Tools dasar untuk healthcheck
RUN apk add --no-cache curl tini

# Non-root user untuk keamanan
RUN addgroup -g 1001 -S nodejs && adduser -S app -u 1001 -G nodejs

# Copy dependencies dari stage deps
COPY --from=deps --chown=app:nodejs /app/node_modules ./node_modules

# Copy source code
COPY --chown=app:nodejs server.js indicators.js package.json ./
COPY --chown=app:nodejs public ./public

# Env defaults (override saat docker run)
ENV NODE_ENV=production \
    PORT=3000 \
    GOAPI_BASE=https://api.goapi.io

USER app
EXPOSE 3000

# Healthcheck - hit halaman utama tiap 30 detik
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ > /dev/null || exit 1

# Pakai tini sebagai init supaya signal handling bener (Ctrl+C, SIGTERM dari Docker)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
