# Kantage Watchdog 🛡️

Standalone AI infrastructure monitor and repair agent for Kantage Hub, Builder, and Deploy. Lives on its own dedicated server so it stays alive even when all three apps are down.

## Features

- **Status dashboard** — Real-time health of all three services with uptime %, response time, and pulsing alert when anything is down
- **AI chat agent** — Chat naturally to diagnose and fix issues. The agent reads the real codebase from GitHub and proposes actual code changes
- **Diff review** — Every proposed change shows a before/after diff. Approve to commit to GitHub, or dismiss
- **Incident tracking** — Full log of outages with root cause, duration, and linked chat sessions
- **Email alerts** — Instant notification on incident open and recovery
- **Mobile-first** — Designed for your phone first

## Quick Start (Hetzner)

### 1. Provision a new Hetzner CX21

Create a fresh Ubuntu 22.04 server. This should be **separate** from your existing servers.

### 2. Run the setup script

```bash
ssh root@YOUR_WATCHDOG_SERVER_IP
bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/kantage-watchdog/main/setup-hetzner.sh)
```

### 3. Deploy the app

From your local machine (in the `watchdog/` directory):

```bash
# Copy files to server
scp -r ./* root@YOUR_WATCHDOG_SERVER_IP:/opt/watchdog/

# SSH in and configure
ssh root@YOUR_WATCHDOG_SERVER_IP
cd /opt/watchdog
cp .env.example .env
nano .env   # fill in all values

# Build and start
docker compose up -d --build

# Run database migrations
docker compose exec watchdog npx prisma db push

# Check it's running
docker compose ps
curl http://localhost:3001
```

### 4. (Optional) Add SSL

```bash
certbot --nginx -d watch.yourdomain.com
```

Update `NEXTAUTH_URL` and `WATCHDOG_URL` in `.env`, then `docker compose restart watchdog`.

## Environment Variables

See `.env.example` for all variables with descriptions.

**Required:**
- `POSTGRES_PASSWORD` — database password
- `NEXTAUTH_SECRET` — random secret (`openssl rand -base64 32`)
- `WATCHDOG_ADMIN_USERNAME` / `WATCHDOG_ADMIN_PASSWORD` — login credentials
- `HUB_URL` / `BUILDER_URL` / `DEPLOY_URL` — services to monitor

**For AI chat:**
- `ANTHROPIC_API_KEY` — Claude 3.5 Sonnet (recommended)
- `OPENAI_API_KEY` — GPT-4o (fallback)

**For code changes:**
- `GITHUB_TOKEN` — Personal access token with `repo` scope
- `GITHUB_ORG` — Your GitHub org or username

**For SSH access:**
- `WATCHDOG_SSH_KEY` — SSH private key (newlines as `\n`)
- `HUB_SERVER_HOST` / `BUILDER_SERVER_HOST` / `DEPLOY_SERVER_HOST`

## Architecture

```
Hetzner Watchdog Server
├── watchdog (Next.js 14, port 3001)
│   ├── /               Status dashboard
│   ├── /chat           AI agent chat
│   ├── /incidents      Incident history
│   └── /changes        Code change history
├── postgres            Database
└── cron                Health check every 60s

Monitors:
├── kantage.solutions     (Hub)
├── builder.kantage.solutions (Builder)
└── deploy.kantage.solutions  (Deploy)
```

## Updating

```bash
ssh root@YOUR_WATCHDOG_SERVER_IP
cd /opt/watchdog
# Copy new files
docker compose up -d --build
docker compose exec watchdog npx prisma db push
```
