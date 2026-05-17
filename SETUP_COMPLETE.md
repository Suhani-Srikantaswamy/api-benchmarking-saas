# Setup Complete

The project is fully deployed and operational.

## What's Running

| Component | Status | URL |
|-----------|--------|-----|
| Frontend | Deployed on Vercel | https://api-benchmarking-saas-dc58jiocs.vercel.app |
| Backend | Docker (local) | http://localhost:4000 |
| Backend (public) | LocalTunnel | https://benchmark-saas-demo.loca.lt |
| PostgreSQL | Docker (local) | localhost:5432 |
| Redis | Docker (local) | localhost:6379 |
| Grafana | Docker (local) | http://localhost:3001 |
| Prometheus | Docker (local) | http://localhost:9090 |
| Jaeger | Docker (local) | http://localhost:16686 |
| AlertManager | Docker (local) | http://localhost:9093 |

## Every Session — Two Commands

```powershell
docker compose up -d
npx localtunnel --port 4000 --subdomain benchmark-saas-demo
```

Then visit `https://benchmark-saas-demo.loca.lt` once in browser, then open the Vercel URL.

## Credentials

| Service | Username | Password |
|---------|----------|----------|
| Grafana | admin | demo123 |
| Backend API Key | — | demo-key-12345 |
| Demo login (admin) | admin | admin123 |
| Demo login (user) | demo | demo123 |

## CI/CD Pipeline

GitHub Actions runs on every push to `main`:
- Lint (backend + frontend)
- Unit tests (backend + frontend)
- Security scan
- Docker image build (backend + frontend)
- Integration tests with k6
- Deploy

Node.js 24 is used throughout. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` is set globally to suppress deprecation warnings from GitHub-owned actions.

## Key Files

```
.env                          — Docker environment variables (not committed)
docker-compose.yml            — Full local stack definition
frontend/vercel.json          — Vercel build config
frontend/src/api/client.js    — API client with tunnel bypass headers
backend/src/index.js          — Express app with CORS config
scripts/demo-start.ps1        — Windows demo startup script
.github/workflows/ci-cd.yml   — CI/CD pipeline
```

## Notes

- The Grafana/Prometheus/Jaeger links in the sidebar point to localhost — they only work on your own machine while Docker is running, not from the professor's browser. Show them by screen sharing.
- The LocalTunnel subdomain `benchmark-saas-demo` is first-come-first-served. If it's taken, use a different subdomain and update `VITE_BACKEND_URL` in Vercel once.
- The postgres volume must match the password in `.env`. If you see "password authentication failed", wipe the volume: `docker volume rm devops_project_postgres_data`
