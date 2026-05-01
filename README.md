# API Performance Benchmarking SaaS

A production-ready DevOps platform for load testing any API endpoint.
Built with a complete CI/CD lifecycle, Kubernetes orchestration, real-time monitoring, and a modern dark dashboard UI.

---

## What It Does

- Enter any API URL and run a real load test using **k6**
- See live results: response time, throughput, error rate
- Compare two test runs side by side
- Export results as JSON
- Monitor backend health via **Prometheus + Grafana**
- Trace requests end-to-end with **Jaeger**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts |
| Backend | Node.js 20, Express |
| Queue | BullMQ + Redis |
| Load Testing | k6 |
| Database | PostgreSQL 15 |
| Containers | Docker (multi-stage builds) |
| Orchestration | Kubernetes (Minikube / EKS) |
| Autoscaling | HPA + KEDA (queue-based) |
| CI/CD | GitHub Actions |
| Infrastructure | Terraform |
| Monitoring | Prometheus + Grafana + AlertManager |
| Tracing | OpenTelemetry + Jaeger |
| Security | JWT Auth, Rate Limiting, Trivy, Network Policies |

---

## Quick Start

### Option A — Docker Compose (recommended)

```bash
git clone <your-repo-url>
cd api-benchmarking-saas

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| AlertManager | http://localhost:9093 |
| Jaeger | http://localhost:16686 |

> **Grafana login:** `admin` / `admin123`

---

### Option B — Kubernetes (Minikube)

```bash
# Start cluster
minikube start --cpus=4 --memory=6144
minikube addons enable ingress
minikube addons enable metrics-server

# Build and push images
export DOCKER_USER=your-dockerhub-username
docker build -t $DOCKER_USER/benchmark-backend:latest ./backend
docker build -t $DOCKER_USER/benchmark-frontend:latest ./frontend
docker push $DOCKER_USER/benchmark-backend:latest
docker push $DOCKER_USER/benchmark-frontend:latest

# Update image names in k8s/*.yaml (replace YOUR_DOCKERHUB_USERNAME)

# Deploy
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policies.yaml

# Access
echo "$(minikube ip) benchmark.local" | sudo tee -a /etc/hosts
open http://benchmark.local
```

---

### Option C — Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

---

## Running a Load Test

### Via the UI

1. Open http://localhost:3000
2. Enter any API URL (e.g. `https://httpbin.org/get`)
3. Choose a preset: **Light** (10 VUs), **Medium** (20 VUs), or **Stress** (50 VUs)
4. Select authentication if needed (Bearer Token, API Key, or Custom JSON)
5. Click **Run Load Test**
6. Watch live results update in real time

### Via the API

```bash
# No login needed — demo key is auto-attached
curl -X POST http://localhost:4000/api/benchmark/run \
  -H "X-API-Key: demo-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"apiUrl":"https://httpbin.org/get","vus":10,"duration":"10s"}'

# Poll for result
curl http://localhost:4000/api/benchmark/<testId> \
  -H "X-API-Key: demo-key-12345"
```

### With Authentication Headers

```bash
curl -X POST http://localhost:4000/api/benchmark/run \
  -H "X-API-Key: demo-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "apiUrl": "https://api.github.com/user",
    "vus": 5,
    "duration": "10s",
    "headers": {
      "Authorization": "Bearer YOUR_GITHUB_TOKEN"
    }
  }'
```

### Run k6 Directly

```bash
k6 run \
  --env TARGET_URL=https://httpbin.org/get \
  --env VUS=10 \
  --env DURATION=10s \
  backend/k6/load-test.js
```

---

## Authentication

The app supports two methods for accessing the SaaS API:

| Method | Header | Value |
|--------|--------|-------|
| API Key | `X-API-Key` | `demo-key-12345` |
| JWT | `Authorization` | `Bearer <token>` |

**Get a JWT token:**
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}'
```

> The frontend auto-attaches the demo API key — no login required during demos.

---

## Project Structure

```
api-benchmarking-saas/
├── backend/                  Node.js + Express API
│   ├── k6/                   k6 load test script
│   └── src/
│       ├── middleware/        Auth, rate limiting, metrics
│       ├── routes/            benchmark, auth, events (SSE), metrics
│       ├── db.js              PostgreSQL (tuned pool, 4 indexes)
│       ├── queue.js           BullMQ queue
│       ├── worker.js          k6 job processor
│       └── tracing.js         OpenTelemetry
├── frontend/                 React 18 + Vite
│   └── src/components/
│       ├── BenchmarkForm      URL input, presets, auth tabs
│       ├── Dashboard          Live metrics, charts, export
│       ├── ResultsHistory     Test history table
│       └── CompareView        A vs B comparison
├── k8s/                      16 Kubernetes manifests
├── terraform/                IaC (Minikube + AWS EKS)
├── monitoring/               Prometheus, Grafana, AlertManager
└── .github/workflows/        CI/CD + Terraform pipelines
```

---

## CI/CD Pipeline

Triggered on push to `main` or `develop`:

```
Push to develop → validate → build → Trivy scan → deploy to staging
Push to main    → validate → build → Trivy scan → deploy to production (approval required)
                                                 → auto rollback on failure
```

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `KUBE_CONFIG` | base64 encoded kubeconfig |
| `KUBE_CONFIG_STAGING` | Staging cluster kubeconfig |
| `DB_PASSWORD` | PostgreSQL password (for Terraform) |

---

## Monitoring

```bash
# Prometheus — query metrics
open http://localhost:9090
# Example: rate(http_requests_total[1m])
# Example: histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Grafana — pre-built dashboard
open http://localhost:3001   # admin / admin123

# Jaeger — distributed traces
open http://localhost:16686
# Select service: benchmark-backend → Find Traces
```

**6 alert rules configured:** High CPU, High Memory, High Error Rate, High Latency, Backend Down, Event Loop Lag.

---

## Security

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT Bearer + API Key |
| Rate Limiting | 100 req/15min general, 5 tests/min for load tests |
| Image Scanning | Trivy in CI/CD (fails on CRITICAL CVEs) |
| Network Isolation | Kubernetes NetworkPolicies (default deny-all) |
| Secret Management | Kubernetes Secrets (base64, etcd encryption) |
| TLS | cert-manager + Let's Encrypt |
| Non-root containers | Both Dockerfiles use non-root users |

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` for local development:

```bash
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=benchmarkdb
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=change-this-in-production
API_KEYS=demo-key-12345
LOG_LEVEL=info
OTEL_ENABLED=false
```

In production, non-sensitive values come from `k8s/configmap.yaml` and sensitive values from `k8s/secrets.yaml`.

---

## License

MIT
