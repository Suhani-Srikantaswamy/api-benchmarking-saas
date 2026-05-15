# Demo Startup Script for Windows PowerShell
# Uses a fixed LocalTunnel subdomain so Vercel env var never needs updating

# ── CONFIG — change TUNNEL_SUBDOMAIN to something unique to you ──────────────
$TUNNEL_SUBDOMAIN = "benchmark-saas-demo"   # → https://benchmark-saas-demo.loca.lt
# ─────────────────────────────────────────────────────────────────────────────

$TUNNEL_URL = "https://$TUNNEL_SUBDOMAIN.loca.lt"

Write-Host ""
Write-Host "API Benchmarking SaaS - Demo Startup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tunnel URL (fixed): $TUNNEL_URL" -ForegroundColor Green
Write-Host "Set this once in Vercel as VITE_BACKEND_URL and never change it." -ForegroundColor Gray
Write-Host ""

# ── Check Docker ──────────────────────────────────────────────────────────────
Write-Host "Checking Docker..." -ForegroundColor Yellow
docker version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running" -ForegroundColor Green

# ── Start stack ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Starting Docker Compose stack..." -ForegroundColor Yellow
docker compose up -d

Write-Host "Waiting for services..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# ── Wait for backend health ───────────────────────────────────────────────────
Write-Host "Waiting for backend to be healthy..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$healthy = $false

do {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:4000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($res.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {}
    $attempt++
    Write-Host "  Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
} while ($attempt -lt $maxAttempts)

if (-not $healthy) {
    Write-Host "Backend failed to start. Check logs:" -ForegroundColor Red
    docker compose logs backend
    exit 1
}
Write-Host "Backend is healthy" -ForegroundColor Green

# ── Check npx ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Checking npx..." -ForegroundColor Yellow
npx --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "npx not found. Please install Node.js from nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "npx is available" -ForegroundColor Green

# ── Start tunnel ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Starting tunnel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Your public URL:" -ForegroundColor White
Write-Host "  $TUNNEL_URL" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Set VITE_BACKEND_URL=$TUNNEL_URL in Vercel (only needed once)." -ForegroundColor Yellow
Write-Host "Keep this window open during your demo." -ForegroundColor Yellow
Write-Host ""

npx localtunnel --port 4000 --subdomain $TUNNEL_SUBDOMAIN

Write-Host ""
Write-Host "Tunnel closed. Backend containers are still running." -ForegroundColor Yellow
Write-Host "Run 'docker compose down' to stop everything." -ForegroundColor Gray
