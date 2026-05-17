# Vercel + LocalTunnel Deployment

Frontend is deployed on Vercel. Backend runs locally in Docker and is exposed via LocalTunnel with a fixed subdomain.

## Current Setup

| Component | Location |
|-----------|----------|
| Frontend | https://api-benchmarking-saas-dc58jiocs.vercel.app |
| Backend tunnel | https://benchmark-saas-demo.loca.lt (fixed subdomain) |
| Vercel env var | `VITE_BACKEND_URL=https://benchmark-saas-demo.loca.lt` |

The `VITE_BACKEND_URL` is set permanently in Vercel dashboard — no need to update it between sessions as long as you use `--subdomain benchmark-saas-demo`.

## How It Works

```
Vercel Frontend
      ↓ HTTPS requests with bypass-tunnel-reminder header
LocalTunnel (https://benchmark-saas-demo.loca.lt)
      ↓ forwards to
localhost:4000 (Docker backend container)
      ↓ queues jobs via Redis
Worker container → runs k6 → saves to PostgreSQL → notifies via SSE
```

## Starting for a Demo

```powershell
# 1. Start all Docker services
docker compose up -d

# 2. Start tunnel (keep terminal open)
npx localtunnel --port 4000 --subdomain benchmark-saas-demo

# 3. Visit tunnel URL once in browser to bypass interstitial
# https://benchmark-saas-demo.loca.lt

# 4. Open Vercel frontend
# https://api-benchmarking-saas-dc58jiocs.vercel.app
```

## First-Time Setup (already done)

These steps were completed during initial setup:

1. Frontend deployed to Vercel from GitHub repo (root directory: `frontend`)
2. `VITE_BACKEND_URL` set to `https://benchmark-saas-demo.loca.lt` in Vercel dashboard (Production + Preview + Development)
3. `frontend/vercel.json` configured with build settings
4. `frontend/src/api/client.js` exports `getBackendUrl()` and `tunnelHeaders()` used by all API calls
5. CORS updated in `backend/src/index.js` to allow `bypass-tunnel-reminder` header

## Environment Variables

### Backend (.env in project root)
```env
POSTGRES_PASSWORD=demo123
GRAFANA_PASSWORD=demo123
JWT_SECRET=demo-secret-key-for-benchmarking-saas
API_KEYS=demo-key-12345
DEMO_ADMIN_PASSWORD=admin123
DEMO_USER_PASSWORD=demo123
OPENAI_API_KEY=
```

### Frontend (Vercel Dashboard)
```
VITE_BACKEND_URL = https://benchmark-saas-demo.loca.lt
```

## Troubleshooting

### "Network error" on load test
The tunnel bypass header is not reaching the backend. Check:
1. Tunnel is running
2. Backend container is healthy: `docker compose ps`
3. Hard refresh: `Ctrl+Shift+R`

### Vercel not picking up VITE_BACKEND_URL
Vite bakes env vars at build time. After changing the env var in Vercel dashboard, you must trigger a redeploy (Vercel does this automatically on save).

### Tunnel interstitial blocking requests
Visit `https://benchmark-saas-demo.loca.lt` in your browser once and click through. The `bypass-tunnel-reminder: true` header in the frontend code handles this for subsequent programmatic requests.

### Postgres password mismatch after rebuild
```powershell
docker compose down
docker volume rm devops_project_postgres_data
docker compose up -d
```
