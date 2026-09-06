#!/bin/bash
# cloud-init — provisioning otomatis bot-pantau-saham di Google Cloud e2-micro (Always Free)
# Tempel isi file ini di kolom "Startup script" (Automation) saat membuat VM.
# Setelah VM aktif: SSH masuk, isi TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID di /opt/bot-pantau-saham/.env,
# lalu systemctl enable --now stockbitbot, dan login Stockbit (stockbit-auth login).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

trap 'echo "[cloud-init] GAGAL pada langkah terakhir"' ERR

echo "==> Swap 2 GB (e2-micro hanya 1 GB RAM — penting untuk login chromium & build laporan)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Install Node.js 22 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get update -y -q
apt-get install -y -q nodejs git ca-certificates curl

echo "==> Dependensi sistem (chromium/playwright untuk login Stockbit headless)"
apt-get install -y -q fonts-liberation \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libasound2 libpango-1.0-0 libcairo2

echo "==> Server data Stockbit (MCP global)"
npm install -g stockbit-mcp

echo "==> Clone aplikasi"
cd /opt
if [ ! -d /opt/bot-pantau-saham/.git ]; then
  git clone https://github.com/errysuprayogi/bot-pantau-saham.git
fi
cd /opt/bot-pantau-saham
npm ci --omit=dev

echo "==> Siapkan .env & user service"
cp -n .env.linux .env || true
echo "TELEGRAM_BOT_TOKEN=" >> .env
echo "TELEGRAM_CHAT_ID=" >> .env

id -u stockbitbot >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin stockbitbot
chown -R stockbitbot: /opt/bot-pantau-saham

echo "==> Unit systemd"
cp -f deploy/stockbitbot.service /etc/systemd/system/
systemctl daemon-reload

echo "==> Selesai. SELANJUTNYA (manual):"
echo "  1. ssh ke VM, isi /opt/bot-pantau-saham/.env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)"
echo "  2. systemctl enable --now stockbitbot"
echo "  3. stockbit-auth login  (sekali saja; butuh OTP dari HP)"
echo "  4. cd /opt/bot-pantau-saham && node index.js --once --no-send  untuk uji coba"