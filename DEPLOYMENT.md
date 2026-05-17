# Deployment Guide

This project runs as a full Docker-based stack locally, with the frontend deployed on Vercel and the backend exposed via LocalTunnel.

## Architecture

```
Professor's Browser
       ↓
Vercel (Frontend) → https://benchmark-saas-demo.loca.lt (LocalTunnel)
                              ↓
                    Your Computer (Docker)
                    - Backend API    :4000
                    - Worker
                    - PostgreSQL     :5432
                    - Redis          :6379
                    - Grafana        :3001
                    - Prometheus     :9090
                    - Jaeger         :16686
                    - AlertManager   :9093
```

## Environment Variables

The `.env` file in the project root is required before starting Docker. Current working values:

```env
POSTGRES_PASSWORD=demo123
GRAFANA_PASSWORD=demo123
JWT_SECRET=demo-secret-key-for-benchmarking-saas
API_KEYS=demo-key-12345
DEMO_ADMIN_PASSWORD=admin123
DEMO_USER_PASSWORD=demo123
OPENAI_API_KEY=
```

## Starting the Stack

### First-time setup (or after password issues)

If the postgres volume has a stale password, wipe it first:

```powershell
docker compose down
docker volume rm devops_project_postgres_data
docker compose up -d
```

### Normal startup (every subsequent time)

```powershell
docker compose up -d
```

Wait about 60 seconds for all services to initialize, then verify:

```powershell
docker compose ps
```

All services should show `healthy` or `Up`. Backend may show `unhealthy` briefly — this is normal during startup.

## Starting the Public Tunnel

The tunnel exposes your local backend publicly with a fixed URL:

```powershell
npx localtunnel --port 4000 --subdomain benchmark-saas-demo
```

This always gives: `https://benchmark-saas-demo.loca.lt`

Keep this terminal open during your demo. The tunnel dies when you close it.

## Vercel Frontend

Frontend is deployed at: `https://api-benchmarking-saas-dc58jiocs.vercel.app`

The `VITE_BACKEND_URL` environment variable is set to `https://benchmark-saas-demo.loca.lt` in the Vercel dashboard. This is permanent — no need to update it as long as you use the same subdomain.

## Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend (Vercel) | https://api-benchmarking-saas-dc58jiocs.vercel.app | — |
| Backend (tunnel) | https://benchmark-saas-demo.loca.lt | API Key: `demo-key-12345` |
| Backend (local) | http://localhost:4000 | API Key: `demo-key-12345` |
| Grafana | http://localhost:3001 | admin / demo123 |
| Prometheus | http://localhost:9090 | — |
| Jaeger | http://localhost:16686 | — |
| AlertManager | http://localhost:9093 | — |

## Stopping Everything

```powershell
docker compose down
# Ctrl+C in the LocalTunnel terminal
```

## Troubleshooting

### Backend shows unhealthy / password auth failed

```powershell
docker compose down
docker volume rm devops_project_postgres_data
docker compose up -d
```

### Tunnel gives 408 or connection refused

1. Verify backend is healthy: `docker compose ps`
2. Visit `https://benchmark-saas-demo.loca.lt` in browser once to bypass interstitial
3. Restart tunnel if needed

### Frontend shows "Network error"

1. Check tunnel is running
2. Check backend is healthy: `docker compose logs backend --tail=10`
3. Hard refresh Vercel page: `Ctrl+Shift+R`

### Grafana/Prometheus/Jaeger not accessible

These run locally only. Access them at `http://localhost:3001`, `http://localhost:9090`, `http://localhost:16686` from your own machine while Docker is running.

### Not all services started

```powershell
docker compose up -d
docker compose ps
```

If only some services are running, run `docker compose up -d` again — it starts any missing ones without touching healthy ones.
