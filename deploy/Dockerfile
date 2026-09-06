FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Dependensi sistem untuk chromium (dipakai stockbit-mcp untuk login Stockbit headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*

# Server data Stockbit (MCP) — dipanggil bot lewat StdioClientTransport
RUN npm install -g stockbit-mcp

# Dependensi bot
COPY package*.json ./
RUN npm install --omit=dev

# Caching Playwright chromium agar login ulang via VPS tetap bisa (headless)
RUN npx playwright install chromium --with-deps || true

COPY . .

ENV NODE_ENV=production \
    STOCKBIT_SERVER_NODE=node \
    STOCKBIT_SERVER_SCRIPT=/usr/local/lib/node_modules/stockbit-mcp/dist/bin/stockbit-mcp.js \
    STOCKBIT_TOOLS=core

# Sesi/token Stockbit disimpan di luar kontainer supaya bertahan saat container di-restart
VOLUME /root/.stockbit

CMD ["node", "index.js"]

# Build:  docker build -f deploy/Dockerfile -t stockbitbot .  (dari akar repo)
# Jalankan (isikan TELEGRAM_BOT_TOKEN dulu di .env.linux / --env):
#   docker run -d --name stockbitbot --restart always \
#     --env-file .env.linux -v stockbit-store:/root/.stockbit stockbitbot