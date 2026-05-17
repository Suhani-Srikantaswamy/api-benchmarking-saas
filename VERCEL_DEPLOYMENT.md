# Vercel + LocalTunnel Demo Deployment Guide

This guide explains how to deploy the **frontend on Vercel** while running the **backend locally** with a public tunnel for your presentation to your professor.

## Architecture

```
┌─────────────────────────────────────┐
│   🌐 VERCEL (Frontend)              │
│   https://your-domain.vercel.app    │
│   - Hosted globally                  │
│   - Calls backend via tunnel         │
└────────────────┬────────────────────┘
                 │ HTTPS API calls
                 ▼
┌─────────────────────────────────────┐
│   🐳 YOUR COMPUTER (Backend)        │
│   http://localhost:4000             │
│   ↓ via LocalTunnel                  │
│   https://xxxx-xxxx-xxxx.loca.lt    │
│   - Exposed publicly during demo     │
│   - Stop after presentation          │
└─────────────────────────────────────┘
```

## Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ installed
- Git account
- Vercel account (free)
- GitHub account (to push code)

## Step 1: Prepare Backend (Local)

### 1.1 Create `.env` File

In the project root, create `.env`:

```bash
# PostgreSQL
POSTGRES_PASSWORD=demo123

# Grafana
GRAFANA_PASSWORD=demo123

# Backend JWT
JWT_SECRET=demo-secret-key

# API Keys
API_KEYS=demo-key-12345

# CORS (important for Vercel frontend)
CORS_ORIGIN=https://your-domain.vercel.app
```

Replace `your-domain.vercel.app` with your actual Vercel URL (you'll get this in Step 3).

### 1.2 Test Locally First

```bash
# Start services
docker compose up -d

# Verify backend is running
curl http://localhost:4000/health
# Should return: {"status":"ok",...}

# Check all services
docker compose ps
```

## Step 2: Set Up LocalTunnel (Public URL)

LocalTunnel creates a public HTTPS URL pointing to your local backend.

### 2.1 Start LocalTunnel

```bash
# On Windows PowerShell or any terminal with Node.js
npx localtunnel --port 4000

# You'll see output like:
# your url is: https://xxxx-xxxx-xxxx.loca.lt
```

**Save this URL** - you need it for Vercel!

> **Note:** On free tier, the URL changes each time you restart. That's fine for a demo.

### 2.2 Keep LocalTunnel Running

Leave this terminal open during your presentation. When you close it, the tunnel ends.

## Step 3: Deploy Frontend to Vercel

### 3.1 Push to GitHub

```bash
cd c:\study material\all_tut\devops_project

git add .
git commit -m "feat: vercel deployment setup"
git push origin main
```

### 3.2 Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Go to frontend directory
cd frontend

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No (first time)
# - Project name: api-benchmarking-frontend
# - Framework: Vite
# - Build command: npm run build
# - Output: dist
```

Or use Vercel's web dashboard:
1. Go to [vercel.com](https://vercel.com)
2. New Project → Import Git Repository
3. Select your GitHub repo
4. Vercel detects it's a Vite project ✓

### 3.3 Get Your Vercel URL

After deployment, Vercel shows your URL:
```
https://your-domain.vercel.app
```

### 3.4 Add Environment Variable to Vercel

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add new variable:
   - **Name:** `VITE_BACKEND_URL`
   - **Value:** `https://xxxx-xxxx-xxxx.loca.lt` (your LocalTunnel URL)
   - **Environments:** Production, Preview, Development
4. Click "Save"

### 3.5 Redeploy Frontend

After adding the env var, Vercel auto-redeploys. Monitor deployment in dashboard.

## Step 4: Test Full Stack

### 4.1 Verify Connections

```bash
# Test backend is accessible via tunnel
curl https://xxxx-xxxx-xxxx.loca.lt/health

# Test frontend loads
open https://your-domain.vercel.app
```

### 4.2 Test Load Test Execution

1. Open https://your-domain.vercel.app
2. Click "Configure Load Test"
3. Select a preset (Light, Medium, Stress)
4. Choose a target API (httpbin.org recommended)
5. Click "Run Load Test"
6. Verify:
   - ✓ Real-time metrics appear
   - ✓ Results chart updates
   - ✓ No CORS errors

## Step 5: Demo Day Setup (30 minutes before presentation)

### 5.1 Start Backend Stack

```bash
# Option A: Windows PowerShell (easier)
.\scripts\demo-start.ps1

# Option B: Manual (more control)
docker compose up -d
npx localtunnel --port 4000
```

### 5.2 Get Fresh LocalTunnel URL

Every time you restart LocalTunnel, you get a new URL. **Update Vercel env var:**

1. Go to Vercel dashboard
2. Settings → Environment Variables
3. Update `VITE_BACKEND_URL` with new tunnel URL
4. Vercel redeploys automatically (takes ~30 seconds)

### 5.3 Test Everything Works

```bash
# Health check script
./scripts/health-check.sh

# Or manual tests
curl https://your-tunnel-url.loca.lt/health
open https://your-domain.vercel.app
```

### 5.4 Have Network Backup

If internet fails during demo:
- Fallback to showing screenshots
- Switch to local demo (change `VITE_BACKEND_URL` to `http://localhost:4000`)
- Have a video recording prepared

## Step 6: After Presentation

### 6.1 Stop Services

```bash
# Stop backend
docker compose down

# Stop LocalTunnel (Ctrl+C in the terminal where it runs)
```

### 6.2 Clean Up

Frontend stays deployed on Vercel (no extra cost). You can:
- Keep it running (shows project is deployed)
- Delete project from Vercel if you don't need it

## Troubleshooting

### Issue: "Network error — is the backend running?"

**Solution:**
1. Check LocalTunnel is still running
2. Verify tunnel URL in Vercel env var is current
3. Test directly: `curl https://xxxx-xxxx-xxxx.loca.lt/health`

### Issue: CORS error in browser console

**Solution:**
1. Check `CORS_ORIGIN` in `.env` matches your Vercel URL
2. Restart backend: `docker compose restart backend`

### Issue: LocalTunnel URL changes

**Solution:**
1. Update `VITE_BACKEND_URL` in Vercel
2. Vercel redeploys (takes ~30 seconds)
3. Hard refresh browser (Ctrl+Shift+R)

### Issue: Tunnel not connecting to backend

**Solution:**
```bash
# Verify backend is running
docker compose logs backend

# Restart if needed
docker compose restart

# Test directly
curl http://localhost:4000/health
```

## Demo Day Timeline

| Time | Action |
|------|--------|
| **T-30min** | Start `demo-start.ps1` (or manually start services) |
| **T-25min** | Get LocalTunnel URL |
| **T-20min** | Update Vercel env var with new tunnel URL |
| **T-15min** | Wait for Vercel redeploy |
| **T-10min** | Run health checks, test everything |
| **T-5min** | Have Vercel URL ready in browser |
| **T+0min** | Show professor the app! |
| **T+15min** | Close LocalTunnel, stop docker compose |

## Notes for Professor

What to highlight:
- ✅ Frontend hosted globally on Vercel (scalable)
- ✅ Backend API responding with real-time metrics
- ✅ Load testing infrastructure working
- ✅ Charts and results persisting
- ✅ Full observability stack (Prometheus, Grafana, Jaeger)

## Environment Variables Summary

### Backend (.env)
```bash
CORS_ORIGIN=https://your-domain.vercel.app  # Allow frontend
POSTGRES_PASSWORD=...
GRAFANA_PASSWORD=...
JWT_SECRET=...
API_KEYS=demo-key-12345
```

### Frontend (Vercel Dashboard)
```bash
VITE_BACKEND_URL=https://xxxx-xxxx-xxxx.loca.lt
```

---

**Questions?** Check the main [DEPLOYMENT.md](./DEPLOYMENT.md) for Docker Compose details or the [README.md](./README.md) for architecture overview.
