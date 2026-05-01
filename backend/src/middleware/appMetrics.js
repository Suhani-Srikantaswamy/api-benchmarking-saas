/**
 * Fix 11: Application-level Prometheus Metrics
 * Tracks: request count, latency histogram, error rate, active tests
 */

const client = require('prom-client');

function createAppMetrics(register) {
  // HTTP request counter — labelled by method, route, status code
  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  // Request duration histogram — p50, p95, p99 latency
  const httpRequestDurationMs = new client.Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
    registers: [register],
  });

  // Active load tests gauge
  const activeLoadTests = new client.Gauge({
    name: 'active_load_tests',
    help: 'Number of currently running load tests',
    registers: [register],
  });

  // Total load tests counter
  const loadTestsTotal = new client.Counter({
    name: 'load_tests_total',
    help: 'Total load tests triggered',
    labelNames: ['status'],
    registers: [register],
  });

  // Queue depth gauge
  const queueDepth = new client.Gauge({
    name: 'load_test_queue_depth',
    help: 'Number of jobs waiting in the load test queue',
    registers: [register],
  });

  // Middleware that records metrics for every request
  function metricsMiddleware(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      // Normalize route (replace UUIDs with :id to avoid cardinality explosion)
      const route = req.route?.path || req.path.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id'
      );

      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode,
      };

      httpRequestsTotal.inc(labels);
      httpRequestDurationMs.observe(labels, duration);
    });

    next();
  }

  return {
    metricsMiddleware,
    httpRequestsTotal,
    httpRequestDurationMs,
    activeLoadTests,
    loadTestsTotal,
    queueDepth,
  };
}

module.exports = { createAppMetrics };
