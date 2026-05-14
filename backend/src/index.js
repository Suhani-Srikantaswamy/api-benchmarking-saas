/**
 * API Performance Benchmarking SaaS — Backend Entry Point
 *
 * Fixes applied:
 *  #1  JWT auth + API key auth
 *  #3  BullMQ queue (k6 runs in worker, not here)
 *  #4  Request timeout middleware
 *  #5  Winston structured logging
 *  #11 App-level Prometheus metrics (latency, request count, error rate)
 *  #23 Rate limiting on all routes
 *  Bonus: OpenTelemetry distributed tracing → Jaeger
 */

// MUST be first — instruments all subsequent requires
require('./tracing');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const client = require('prom-client');

const db = require('./db');
const logger = require('./logger');
const { createAppMetrics } = require('./middleware/appMetrics');
const { generalLimiter } = require('./middleware/rateLimiter');

const benchmarkRoutes = require('./routes/benchmark');
const metricsRoutes  = require('./routes/metrics');
const authRoutes     = require('./routes/auth');
const { router: eventsRouter } = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Prometheus Registry ───────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Fix 11: App-level metrics
const appMetrics = createAppMetrics(register);

// Expose on app for routes to use
app.set('promRegistry', register);
app.set('appMetrics', appMetrics);

// ── Fix 4: Global request timeout (30s) ──────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    logger.warn('Request timeout', { method: req.method, path: req.path });
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// ── Core Middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
app.use(express.json({ limit: '10kb' })); // Fix: limit body size

// Fix 5: HTTP request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
      ip: req.ip,
    });
  });
  next();
});

// Fix 11: Prometheus metrics middleware
app.use(appMetrics.metricsMiddleware);

// Fix 23: General rate limiting on all routes
app.use(generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',          authRoutes);
app.use('/api/benchmark', benchmarkRoutes);
app.use('/api/events',    eventsRouter);  // Fix 19: SSE for real-time updates
app.use('/metrics',       metricsRoutes);

// Health check (no auth required — used by K8s probes)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: '2.0.0' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await db.connect();
    await db.initSchema();
    app.listen(PORT, () => logger.info(`Backend running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Only start the HTTP server when this file is run directly.
// Tests should `require('../src/index')` and use the exported `app`
// without starting a network listener to avoid EADDRINUSE and lifecycle issues.
if (require.main === module) {
  start();
}

module.exports = app;
