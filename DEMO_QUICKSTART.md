# Demo Quick Start

## Demo Day Routine (10 minutes before)

### 1. Start Docker stack

Open Docker Desktop, then run in PowerShell:

```powershell
docker compose up -d
```

### 2. Start the tunnel

```powershell
npx localtunnel --port 4000 --subdomain benchmark-saas-demo
```

You'll see: `your url is: https://benchmark-saas-demo.loca.lt`

Keep this terminal open for the entire demo.

### 3. Visit the tunnel URL once

Open `https://benchmark-saas-demo.loca.lt` in your browser and click through the interstitial page. This unblocks programmatic requests from Vercel.

### 4. Open the app

```
https://api-benchmarking-saas-dc58jiocs.vercel.app
```

The "Backend Online" badge should be green. You're ready.

---

## Demo Script (3 minutes)

**1. Show the frontend on Vercel**
"This is deployed globally on Vercel. Anyone can access it from anywhere."

**2. Run a load test**
- Enter `https://httpbin.org/get` as the target URL
- Select Light preset (10 VUs, 10s)
- Click Run Load Test
- Show real-time metrics updating via SSE

**3. Show the observability stack (your screen)**
- Grafana: http://localhost:3001 — dashboards and alerts
- Prometheus: http://localhost:9090 — raw metrics
- Jaeger: http://localhost:16686 — distributed tracing

**4. Show test history and comparison**
- Go to History tab — shows all past runs
- Go to Compare tab — side-by-side metric comparison

---

## Key URLs

| What | URL |
|------|-----|
| Frontend | https://api-benchmarking-saas-dc58jiocs.vercel.app |
| Backend tunnel | https://benchmark-saas-demo.loca.lt |
| Grafana | http://localhost:3001 (admin / demo123) |
| Prometheus | http://localhost:9090 |
| Jaeger | http://localhost:16686 |

---

## Emergency Fixes

**"Backend unreachable" badge**
- Check tunnel terminal is still running
- Run `docker compose ps` — backend must be healthy
- Visit `https://benchmark-saas-demo.loca.lt` in browser once

**"Network error — is the backend running?"**
- Same as above — tunnel or backend is down
- Restart: `docker compose restart backend`
- Restart tunnel: `npx localtunnel --port 4000 --subdomain benchmark-saas-demo`

**Backend keeps crashing (password error)**
```powershell
docker compose down
docker volume rm devops_project_postgres_data
docker compose up -d
```

**After demo — stop everything**
```powershell
docker compose down
# Ctrl+C in tunnel terminal
```
