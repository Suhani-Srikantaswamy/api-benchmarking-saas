/**
 * PostgreSQL Database Connection, Schema & Queries
 * Includes: connection pool tuning, indexes, retry logic
 */

const { Pool } = require('pg');
const logger = require('./logger');

// ── Fix 18: Tuned connection pool ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'benchmarkdb',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max:               20,    // max connections in pool
  min:               2,     // keep 2 connections warm
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if can't connect in 5s
  statement_timeout: 10000, // kill queries running > 10s
});

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message });
});

// ── Connect with retry ────────────────────────────────────────────────────────
async function connect(retries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT NOW()');
      logger.info('PostgreSQL connected');
      return;
    } catch (err) {
      logger.warn(`DB connection attempt ${attempt}/${retries} failed`, { error: err.message });
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ── Schema + Indexes ──────────────────────────────────────────────────────────
async function initSchema() {
  const queries = [
    // Main table
    `CREATE TABLE IF NOT EXISTS benchmark_results (
      id                 SERIAL PRIMARY KEY,
      test_id            VARCHAR(255) UNIQUE NOT NULL,
      api_url            TEXT NOT NULL,
      timestamp          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      avg_response_time  FLOAT,
      max_response_time  FLOAT,
      min_response_time  FLOAT,
      requests_per_sec   FLOAT,
      total_requests     INT,
      failed_requests    INT,
      error_rate         FLOAT,
      nl_analysis        TEXT,
      status             VARCHAR(50) DEFAULT 'pending'
    )`,
    // Fix 17: Indexes for fast lookups
    `CREATE INDEX IF NOT EXISTS idx_test_id   ON benchmark_results(test_id)`,
    `CREATE INDEX IF NOT EXISTS idx_timestamp ON benchmark_results(timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_status    ON benchmark_results(status)`,
    `CREATE INDEX IF NOT EXISTS idx_api_url   ON benchmark_results(api_url)`,
  ];

  for (const q of queries) {
    await pool.query(q);
  }
  logger.info('Database schema and indexes initialized');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function saveBenchmark(data) {
  const query = `
    INSERT INTO benchmark_results
      (test_id, api_url, avg_response_time, max_response_time, min_response_time,
         requests_per_sec, total_requests, failed_requests, error_rate, nl_analysis, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (test_id) DO UPDATE SET
      avg_response_time = EXCLUDED.avg_response_time,
      max_response_time = EXCLUDED.max_response_time,
      min_response_time = EXCLUDED.min_response_time,
      requests_per_sec  = EXCLUDED.requests_per_sec,
      total_requests    = EXCLUDED.total_requests,
      failed_requests   = EXCLUDED.failed_requests,
      error_rate        = EXCLUDED.error_rate,
        nl_analysis       = EXCLUDED.nl_analysis,
      status            = EXCLUDED.status
    RETURNING *`;

    const values = [
      data.test_id, data.api_url,
      data.avg_response_time, data.max_response_time, data.min_response_time,
      data.requests_per_sec, data.total_requests, data.failed_requests,
      data.error_rate, data.nl_analysis || null, data.status || 'completed'
    ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateBenchmarkStatus(testId, status) {
  await pool.query(
    'UPDATE benchmark_results SET status = $1 WHERE test_id = $2',
    [status, testId]
  );
}

async function createPendingBenchmark(testId, apiUrl) {
  const query = `
    INSERT INTO benchmark_results (test_id, api_url, status)
    VALUES ($1, $2, 'pending') RETURNING *`;
  const result = await pool.query(query, [testId, apiUrl]);
  return result.rows[0];
}

async function getBenchmark(testId) {
  const result = await pool.query(
    'SELECT * FROM benchmark_results WHERE test_id = $1',
    [testId]
  );
  return result.rows[0];
}

async function getAllBenchmarks(limit = 50) {
  const result = await pool.query(
    'SELECT * FROM benchmark_results ORDER BY timestamp DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

module.exports = {
  connect, initSchema,
  saveBenchmark, updateBenchmarkStatus, createPendingBenchmark,
  getBenchmark, getAllBenchmarks,
  pool
};
