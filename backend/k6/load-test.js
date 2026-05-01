/**
 * k6 Load Test Script
 *
 * Environment variables (passed via --env):
 *   TARGET_URL    - The API endpoint to test
 *   VUS           - Number of virtual users (default: 10)
 *   DURATION      - Test duration (default: 10s)
 *   CUSTOM_HEADERS - JSON string of headers to send to the target API
 *                    e.g. '{"Authorization":"Bearer token","X-API-Key":"abc"}'
 *   HTTP_METHOD   - HTTP method: GET, POST, PUT, PATCH, DELETE (default: GET)
 *
 * NOTE: Uses ES5-compatible syntax — k6's Babel does not support
 * optional chaining (?.) or nullish coalescing (??) operators.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

var errorRate = new Rate('custom_error_rate');
var responseTime = new Trend('custom_response_time');

export var options = {
  vus:      parseInt(__ENV.VUS) || 10,
  duration: __ENV.DURATION || '10s',
  // No thresholds — we report raw metrics regardless of pass/fail.
  // This ensures ANY API (including rate-limited or auth-required ones)
  // completes successfully and returns real data instead of failing the job.
};

export default function () {
  var url    = __ENV.TARGET_URL || 'https://httpbin.org/get';
  var method = (__ENV.HTTP_METHOD || 'GET').toUpperCase();

  // ── Build headers ─────────────────────────────────────────────────────────
  // Start with safe defaults
  var headers = {
    'User-Agent': 'k6-benchmark-saas/1.0',
    'Accept':     'application/json',
  };

  // Merge custom headers from environment (passed as JSON string)
  if (__ENV.CUSTOM_HEADERS && __ENV.CUSTOM_HEADERS !== '{}' && __ENV.CUSTOM_HEADERS !== '') {
    try {
      var custom = JSON.parse(__ENV.CUSTOM_HEADERS);
      var keys = Object.keys(custom);
      for (var i = 0; i < keys.length; i++) {
        headers[keys[i]] = custom[keys[i]];
      }
    } catch (e) {
      // Invalid JSON — skip custom headers, continue with defaults
    }
  }

  var params = { headers: headers, timeout: '15s' };

  // ── Execute request ───────────────────────────────────────────────────────
  var res;
  if (method === 'POST') {
    res = http.post(url, null, params);
  } else if (method === 'PUT') {
    res = http.put(url, null, params);
  } else if (method === 'PATCH') {
    res = http.patch(url, null, params);
  } else if (method === 'DELETE') {
    res = http.del(url, null, params);
  } else {
    res = http.get(url, params);
  }

  responseTime.add(res.timings.duration);

  // Count as error only if connection failed (status 0) or server error (5xx)
  // 4xx responses (401, 403, 404) are valid responses — not k6 failures
  errorRate.add(res.status === 0 || res.status >= 500);

  check(res, {
    'response received':    function(r) { return r.status > 0; },
    'not a server error':   function(r) { return r.status < 500; },
    'response time < 5s':   function(r) { return r.timings.duration < 5000; },
  });

  sleep(0.1);
}

export function handleSummary(data) {
  var dur    = (data.metrics && data.metrics.http_req_duration && data.metrics.http_req_duration.values) || {};
  var reqs   = (data.metrics && data.metrics.http_reqs && data.metrics.http_reqs.values) || {};
  var failed = (data.metrics && data.metrics.http_req_failed && data.metrics.http_req_failed.values) || {};

  return {
    stdout: JSON.stringify({
      avg_response_time: dur.avg        || 0,
      max_response_time: dur.max        || 0,
      min_response_time: dur.min        || 0,
      p95_response_time: dur['p(95)']   || 0,
      requests_per_sec:  reqs.rate      || 0,
      total_requests:    reqs.count     || 0,
      failed_requests:   failed.passes  || 0,
      error_rate:        (failed.rate || 0) * 100,
    }, null, 2),
  };
}
