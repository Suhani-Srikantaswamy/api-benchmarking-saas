/**
 * k6 CI Load Test — runs inside GitHub Actions
 *
 * Targets the local backend health endpoint to verify the deployed
 * stack is responsive under load. Fails the pipeline if:
 *   - p95 latency > 500ms
 *   - error rate > 5%
 *
 * Usage:
 *   k6 run --env BASE_URL=http://localhost:4000 backend/k6/ci-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

var errorRate    = new Rate('ci_error_rate');
var responseTime = new Trend('ci_response_time');

export var options = {
  stages: [
    { duration: '10s', target: 5  },  // ramp up
    { duration: '20s', target: 10 },  // sustain
    { duration: '10s', target: 0  },  // ramp down
  ],
  thresholds: {
    // Pipeline fails if p95 latency exceeds 500ms
    'http_req_duration': ['p(95)<500'],
    // Pipeline fails if error rate exceeds 5%
    'ci_error_rate': ['rate<0.05'],
    // All checks must pass
    'checks': ['rate>0.95'],
  },
};

export default function () {
  var baseUrl = __ENV.BASE_URL || 'http://localhost:4000';

  // ── Test 1: Health endpoint ───────────────────────────────────────────────
  var healthRes = http.get(baseUrl + '/health', {
    headers: { 'Accept': 'application/json' },
    timeout: '5s',
  });

  responseTime.add(healthRes.timings.duration);
  errorRate.add(healthRes.status === 0 || healthRes.status >= 500);

  check(healthRes, {
    'health: status 200':       function(r) { return r.status === 200; },
    'health: has status field':  function(r) {
      try { return JSON.parse(r.body).status === 'ok'; } catch(e) { return false; }
    },
    'health: response < 200ms': function(r) { return r.timings.duration < 200; },
  });

  sleep(0.5);

  // ── Test 2: Metrics endpoint ──────────────────────────────────────────────
  var metricsRes = http.get(baseUrl + '/metrics', { timeout: '5s' });

  check(metricsRes, {
    'metrics: status 200':              function(r) { return r.status === 200; },
    'metrics: contains http_requests':  function(r) { return r.body.indexOf('http_requests_total') !== -1; },
  });

  sleep(0.5);

  // ── Test 3: Auth endpoint (unauthenticated — expect 401) ──────────────────
  var authRes = http.get(baseUrl + '/api/benchmark', { timeout: '5s' });

  check(authRes, {
    'auth: unauthenticated returns 401': function(r) { return r.status === 401; },
  });

  sleep(0.5);
}

export function handleSummary(data) {
  var dur    = (data.metrics && data.metrics.http_req_duration && data.metrics.http_req_duration.values) || {};
  var reqs   = (data.metrics && data.metrics.http_reqs && data.metrics.http_reqs.values) || {};
  var checks = (data.metrics && data.metrics.checks && data.metrics.checks.values) || {};

  var summary = {
    p95_latency_ms:    dur['p(95)']  || 0,
    avg_latency_ms:    dur.avg       || 0,
    total_requests:    reqs.count    || 0,
    requests_per_sec:  reqs.rate     || 0,
    check_pass_rate:   (checks.rate  || 0) * 100,
    thresholds_passed: !data.rootGroup.checks || Object.values(data.rootGroup.checks).every(function(c) { return c.passes > 0; }),
  };

  return {
    stdout: JSON.stringify(summary, null, 2),
    'ci-load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
