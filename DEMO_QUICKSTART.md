# 🎓 Professor Demo - Quick Start Card

**Print this card and keep it handy during your presentation!**

---

## Pre-Demo Checklist (30 min before)

```bash
# 1. Start services (choose one)
# Windows PowerShell:
.\scripts\demo-start.ps1

# macOS/Linux/WSL:
bash scripts/demo-start.sh

# 2. Watch for the LocalTunnel URL that appears
# It will look like: https://xxxx-xxxx-xxxx.loca.lt

# 3. Copy that URL
```

## Update Vercel (5 minutes)

1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Settings → Environment Variables
4. Find `VITE_BACKEND_URL`
5. Paste new LocalTunnel URL
6. Wait for redeploy (~30 seconds) - check the "Deployments" tab

## Show Professor

**Open in browser:**
```
https://your-domain.vercel.app
```

**Click "Configure Load Test" and:**
1. Select "Light" preset
2. Target API: `https://httpbin.org/get`
3. Click "Run Load Test"
4. Show real-time metrics updating
5. Explain the architecture

## Demo Script (3 minutes)

### 1. Frontend (1 min)
"This is hosted on Vercel globally. The UI is responsive and can be accessed from anywhere."

### 2. Load Testing (1 min)
"Let me run a test. It sends requests to an external API and shows real-time metrics through SSE connections."

### 3. Architecture (1 min)
"The frontend calls our backend API which spawns k6 workers. Results go to PostgreSQL and updates stream back to the frontend. This is the full stack running."

---

## Emergency Fixes

### "Backend not responding"
1. Check LocalTunnel terminal - is it still running?
2. Restart: `docker compose restart`
3. Get new tunnel URL and update Vercel

### "CORS error"
1. Ctrl+Shift+R (hard refresh)
2. Wait 30 seconds after updating env var
3. Check tunnel URL in browser dev tools (Network tab)

### "Internet fails during demo"
1. Switch to local mode:
   - Set `VITE_BACKEND_URL=http://localhost:4000` in Vercel
   - Wait for redeploy
   - Open `https://your-domain.vercel.app` (still works, talks to local backend)
2. Show offline screenshots of features

---

## After Demo

```bash
# Stop everything
docker compose down

# Stop LocalTunnel (Ctrl+C)
```

---

## Key URLs

| Service | URL |
|---------|-----|
| Frontend | https://your-domain.vercel.app |
| Backend (during demo) | https://xxxx-xxxx-xxxx.loca.lt |
| Vercel Dashboard | https://vercel.com/dashboard |
| GitHub Repo | https://github.com/your-username/api-benchmarking-saas |

---

**Good luck! 🚀**
