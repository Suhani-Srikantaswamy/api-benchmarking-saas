# Deployment Guide

This project is designed to deploy as a full Docker-based stack. The simplest and most reliable path is to run the entire stack with Docker Compose rather than splitting it across multiple hosts.

## What Gets Deployed First

Deploy in this order:

1. PostgreSQL and Redis
2. Backend API and worker
3. Frontend
4. Observability stack: Prometheus, Grafana, Jaeger, AlertManager

Why this order matters:
- The backend depends on PostgreSQL and Redis.
- The worker depends on PostgreSQL and Redis.
- The frontend depends on the backend API.
- The observability services read metrics and traces from the running app stack.

## Required Environment Variables

Create a `.env` file in the repository root before deploying.

Use `docker-compose.env.example` as the template.

| Variable | Required | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password used by backend, worker, and database container |
| `GRAFANA_PASSWORD` | Yes | Grafana admin password |
| `JWT_SECRET` | Yes | JWT signing secret for backend auth |
| `API_KEYS` | Yes | Comma-separated API keys accepted by the backend |
| `DEMO_ADMIN_PASSWORD` | No | Demo admin password for local/dev use |
| `DEMO_USER_PASSWORD` | No | Demo user password for local/dev use |
| `OPENAI_API_KEY` | No | Optional AI analysis integration |

Example `.env`:

```env
POSTGRES_PASSWORD=change-this-db-password
GRAFANA_PASSWORD=change-this-grafana-password
JWT_SECRET=change-this-jwt-secret
API_KEYS=demo-key-12345
DEMO_ADMIN_PASSWORD=change-this-admin-password
DEMO_USER_PASSWORD=change-this-user-password
OPENAI_API_KEY=
```

## Exact Redeploy Checklist

Use this checklist any time you want to redeploy the stack.

1. Pull the latest changes.

```bash
git pull
```

2. Confirm the root `.env` file exists and has values.

```bash
cat .env
```

3. If you are on Windows, run the deployment from WSL or Git Bash.

The deployment scripts are Bash scripts, so the safest option is:
- WSL
- Git Bash

4. Stop the current stack if one is already running.

```bash
docker compose down --remove-orphans
```

5. Build the images.

```bash
docker compose build --parallel
```

6. Start infrastructure first.

```bash
docker compose up -d postgres redis
```

7. Wait for PostgreSQL and Redis to become healthy.

```bash
docker compose ps
```

8. Start the application services.

```bash
docker compose up -d backend worker frontend prometheus grafana alertmanager jaeger
```

9. Verify the deployment.

```bash
./scripts/health-check.sh --timeout 120
```

10. Inspect logs if anything is unhealthy.

```bash
docker compose logs -f backend
```

```bash
docker compose logs -f worker
```

```bash
docker compose logs -f frontend
```

11. Open the running services.

- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- Jaeger: http://localhost:16686
- AlertManager: http://localhost:9093

## Recommended Deployment Flow

If you want to deploy manually instead of using the helper script, run these commands in order from the repository root:

```bash
docker compose down --remove-orphans
docker compose build --parallel
docker compose up -d postgres redis
docker compose up -d backend worker frontend prometheus grafana alertmanager jaeger
./scripts/health-check.sh --timeout 120
```

## Deploy Script

The repository already includes `scripts/deploy.sh`, which performs the same flow automatically:

- loads `.env`
- checks Docker and Docker Compose
- builds images
- starts PostgreSQL and Redis first
- starts the app and observability services
- waits for the backend health endpoint
- prints a deployment summary

Run it from the repository root:

```bash
bash scripts/deploy.sh
```

If Bash line endings cause an error on Windows, run it in WSL/Git Bash or normalize the script to Unix line endings first.

## What This Deployment Produces

This stack deploys locally as Docker containers, not as a Vercel app.

It creates:
- a frontend container serving the React/Vite build
- a backend API container
- a worker container for queued benchmark jobs
- PostgreSQL and Redis containers
- Prometheus, Grafana, Jaeger, and AlertManager containers

## If You Want a Public Deployment Later

For a public deployment, keep the same container model and move it to a Docker-friendly host such as:
- a VPS with Docker Compose
- Render
- Railway
- Fly.io
- Kubernetes/EKS

Vercel is only a fit for the frontend part of this repo; the full app needs backend services, a queue, and a database.
