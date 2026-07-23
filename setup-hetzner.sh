#!/bin/bash
# Kantage Watchdog — Hetzner server setup script
# Run this ONCE on a fresh Hetzner CX21 (Ubuntu 22.04) server
# Usage: curl -fsSL https://raw.githubusercontent.com/kantagesolutions/kantage-watchdog/main/setup-hetzner.sh | bash

set -e

echo "🛡️  Kantage Watchdog — Server Setup"
echo "======================================"

# ─── System updates ───────────────────────────────────────────────────────────
echo "→ Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ─── Docker ───────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "→ Docker already installed"
fi

# ─── Firewall ─────────────────────────────────────────────────────────────────
echo "→ Configuring firewall..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw --force enable

# ─── Nginx as reverse proxy (optional) ────────────────────────────────────────
echo "→ Installing Nginx..."
apt-get install -y -qq nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/watchdog <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/watchdog /etc/nginx/sites-enabled/watchdog
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── App directory ────────────────────────────────────────────────────────────
mkdir -p /opt/watchdog
cd /opt/watchdog

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Clone the repo:        git clone https://github.com/kantagesolutions/kantage-watchdog.git /opt/watchdog/"
echo "  2. Create .env:           cp /opt/watchdog/.env.example /opt/watchdog/.env && nano /opt/watchdog/.env"
echo "  3. Start the app:         cd /opt/watchdog && docker compose up -d --build"
echo "  4. Run DB migrations:     docker compose exec watchdog npx prisma db push"
echo "  5. (Optional) SSL:        certbot --nginx -d watch.yourdomain.com"
echo ""
echo "Once running, visit http://SERVER_IP:3001 or your domain."
