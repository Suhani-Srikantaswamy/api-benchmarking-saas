/**
 * Worker Process — Separate from Backend API
 * Processes load test jobs from the BullMQ queue
 *
 * Run separately: node src/worker.js
 */

// MUST be first — instruments all subsequent requires
require('./tracing');
require('dotenv').config();
const { Worker } = require('bullmq');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const logger = require('./logger');
const { redisConnection } = require('./queue');
const { notifyClients } = require('./routes/events');

// ── Worker Definition ─────────────────────────────────────────────────────────
const worker = new Worker(
  'load-tests',
  async (job) => {
    const { testId, apiUrl, vus, duration } = job.data;
    logger.info('Processing load test job', { testId, apiUrl, vus, duration });

    // Update status to running
    await db.updateBenchmarkStatus(testId, 'running');

    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '../k6/load-test.js');
      // Resolves to: backend/k6/load-test.js  ✓ (confirmed in project structure)
      const outputPath = path.join('/tmp', `k6-result-${testId}.json`);

      const { headers = {}, method = 'GET' } = job.data;

      const env = {
        ...process.env,
        TARGET_URL:     apiUrl,
        VUS:            String(vus),
        DURATION:       duration,
        CUSTOM_HEADERS: JSON.stringify(headers),
        HTTP_METHOD:    method,
      };

      execFile(
        'k6',
        [
          'run',
          '--out', `json=${outputPath}`,
          '--env', `TARGET_URL=${apiUrl}`,
          '--env', `VUS=${vus}`,
          '--env', `DURATION=${duration}`,
          '--env', `CUSTOM_HEADERS=${JSON.stringify(headers)}`,
          '--env', `HTTP_METHOD=${method}`,
          scriptPath,
        ],
        { env, timeout: 300000 },
        async (error, stdout, stderr) => {
          if (error) {
            logger.error('k6 execution failed', { testId, error: error.message, stderr });
            await db.saveBenchmark({
              test_id: testId,
              api_url: apiUrl,
              avg_response_time: 0,
              max_response_time: 0,
              min_response_time: 0,
              requests_per_sec: 0,
              total_requests: 0,
              failed_requests: 0,
              error_rate: 100,
              status: 'failed'
            });
            return reject(error);
          }

          // Parse k6 output
          const metrics = parseK6Output(outputPath);
          logger.info('k6 test completed', { testId, metrics });

          // Persist results
          await db.saveBenchmark({
            test_id: testId,
            api_url: apiUrl,
            ...metrics,
            status: 'completed'
          });

          // Attempt to run analytics (Python) to generate NL diagnosis if available
          try {
            const analyticsInput = {
              avg: metrics.avg_response_time,
              p95: metrics.max_response_time || metrics.avg_response_time,
              reqs: metrics.total_requests,
              rps: metrics.requests_per_sec,
              failed: metrics.failed_requests,
              error_rate: (metrics.error_rate || 0) / 100.0
            };

            const analyticsPath = resolveAnalyticsPath();
            const tmpSummary = path.join('/tmp', `analytics-summary-${testId}.json`);
            fs.writeFileSync(tmpSummary, JSON.stringify(analyticsInput));

            const py = execFile.bind(null, 'python3', [path.join(analyticsPath, 'ingest_k6.py'), tmpSummary], { timeout: 20000 });
            py(async (pyErr, pyStdout, pyStderr) => {
              if (pyErr) {
                logger.warn('Analytics script failed', { testId, error: pyErr.message, pyStderr });
              } else {
                try {
                  const out = JSON.parse(pyStdout);
                  const nl = out.diagnosis || out.llm_refinement || out;
                  await db.saveBenchmark({
                    test_id: testId,
                    api_url: apiUrl,
                    ...metrics,
                    nl_analysis: JSON.stringify(nl),
                    status: 'completed'
                  });

                  // Notify SSE clients with diagnosis included
                  notifyClients(testId, { ...metrics, test_id: testId, status: 'completed', analysis: nl });
                } catch (e) {
                  logger.warn('Failed to parse analytics output', { testId, error: e.message });
                }
              }
              try { fs.unlinkSync(tmpSummary); } catch {}
            });
          } catch (e) {
            logger.warn('Error running analytics', { testId, error: e.message });
          }

          // Notify SSE clients immediately with numeric metrics
          notifyClients(testId, { ...metrics, test_id: testId, status: 'completed' });

          // Cleanup
          try { fs.unlinkSync(outputPath); } catch {}
          resolve(metrics);
        }
      );
    });
  },
  {
    connection: redisConnection,
    concurrency: 3, // process up to 3 jobs concurrently
  }
);

// ── Event Handlers ────────────────────────────────────────────────────────────
worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, testId: job.data.testId });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, testId: job?.data?.testId, error: err.message });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message });
});

// ── Parse k6 Output ───────────────────────────────────────────────────────────
function parseK6Output(filePath) {
  const defaults = {
    avg_response_time: 0,
    max_response_time: 0,
    min_response_time: 0,
    requests_per_sec: 0,
    total_requests: 0,
    failed_requests: 0,
    error_rate: 0
  };

  try {
    if (!fs.existsSync(filePath)) return defaults;

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const metrics = {};

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'Point' && entry.metric) {
          if (!metrics[entry.metric]) metrics[entry.metric] = [];
          metrics[entry.metric].push(entry.data.value);
        }
      } catch {}
    }

    const httpDuration = metrics['http_req_duration'] || [];
    const httpReqs = metrics['http_reqs'] || [];
    const httpFailed = metrics['http_req_failed'] || [];

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = arr => arr.length ? Math.max(...arr) : 0;
    const min = arr => arr.length ? Math.min(...arr) : 0;

    const totalRequests = httpReqs.length;
    const failedRequests = httpFailed.filter(v => v === 1).length;

    return {
      avg_response_time: parseFloat(avg(httpDuration).toFixed(2)),
      max_response_time: parseFloat(max(httpDuration).toFixed(2)),
      min_response_time: parseFloat(min(httpDuration).toFixed(2)),
      requests_per_sec: parseFloat((totalRequests / 10).toFixed(2)),
      total_requests: totalRequests,
      failed_requests: failedRequests,
      error_rate: totalRequests > 0
        ? parseFloat(((failedRequests / totalRequests) * 100).toFixed(2))
        : 0
    };
  } catch (err) {
    logger.error('Failed to parse k6 output', { error: err.message });
    return defaults;
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  logger.info('Worker shutting down...');
  await worker.close();
  await db.pool.end();
  process.exit(0);
}

function resolveAnalyticsPath() {
  const candidates = [
    path.join(__dirname, '../../analytics'),
    path.join(__dirname, '../analytics'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'ingest_k6.py'))) {
      return candidate;
    }
  }

  return candidates[0];
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.connect();
    logger.info('Worker started, waiting for jobs...');
  } catch (err) {
    logger.error('Worker startup failed', { error: err.message });
    process.exit(1);
  }
})();
