# Docker Compose Setup - Status ✓

The Docker Compose setup is fully functional and consolidated.

## Services Summary

**Development (root level):**
- `editor` - VSCode fork running on port 9888
- `web` - Next.js web app on port 3002

**OpenClaw (docker/ directory):**
- `occ-gateway` - Gateway service on port 18789 (dev: 18789, configurable via env)
- `occ-postgres` - PostgreSQL 16
- `occ-redis` - Redis 7

**Test & Automation:**
- `playwright-display` - Playwright test container with display
- `windows-vm` - Windows 11 VM for cross-platform testing

## Quick Commands

```bash
# Start editor + web
docker-compose up -d

# Start OpenClaw services (development)
docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d

# Start OpenClaw services (production-like)
docker compose -f docker/docker-compose.openclaw.yml up -d

# Playwright testing
docker compose -f docker/docker-compose.playwright.yml up -d
```

## For Detailed Information

See **[DOCKER.md](./DOCKER.md)** for:
- Complete file descriptions and purposes
- When to use each file
- Environment variable setup
- Troubleshooting
- Build & CI usage
