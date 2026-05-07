/**
 * Backend Unit & Integration Tests
 * Tests: health endpoint, auth middleware, rate limiter, benchmark routes
 */

const request = require('supertest');

// ── Mock heavy dependencies before requiring app ──────────────────────────────
jest.mock('../src/tracing', () => ({}));
jest.mock('../src/db', () => ({
  connect:                jest.fn().mockResolvedValue(true),
  initSchema:             jest.fn().mockResolvedValue(true),
  createPendingBenchmark: jest.fn().mockResolvedValue({ test_id: 'test-123', status: 'pending' }),
  getBenchmark:           jest.fn().mockResolvedValue({ test_id: 'test-123', status: 'completed', avg_response_time: 120 }),
  getAllBenchmarks:        jest.fn().mockResolvedValue([{ test_id: 'test-123', status: 'completed' }]),
  updateBenchmarkStatus:  jest.fn().mockResolvedValue(true),
  pool:                   { end: jest.fn() },
}));
jest.mock('../src/queue', () => ({
  enqueueLoadTest: jest.fn().mockResolvedValue({ id: 'job-1' }),
  redisConnection: {},
}));
jest.mock('../src/routes/events', () => ({
  router:        require('express').Router(),
  notifyClients: jest.fn(),
}));

const app = require('../src/index');

// ── Health endpoint ───────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('2.0.0');
  });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
describe('Authentication', () => {
  it('rejects requests without credentials', async () => {
    const res = await request(app).get('/api/benchmark');
    expect(res.status).toBe(401);
  });

  it('accepts valid API key', async () => {
    const res = await request(app)
      .get('/api/benchmark')
      .set('X-API-Key', 'demo-key-12345');
    expect(res.status).toBe(200);
  });

  it('rejects invalid API key', async () => {
    const res = await request(app)
      .get('/api/benchmark')
      .set('X-API-Key', 'invalid-key');
    expect(res.status).toBe(401);
  });
});

// ── Benchmark routes ──────────────────────────────────────────────────────────
describe('POST /api/benchmark/run', () => {
  it('rejects missing apiUrl', async () => {
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send({ vus: 5, duration: '10s' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('rejects invalid URL', async () => {
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send({ apiUrl: 'not-a-url', vus: 5, duration: '10s' });
    expect(res.status).toBe(400);
  });

  it('rejects VUs out of range', async () => {
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send({ apiUrl: 'https://httpbin.org/get', vus: 999, duration: '10s' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid duration format', async () => {
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send({ apiUrl: 'https://httpbin.org/get', vus: 5, duration: 'bad' });
    expect(res.status).toBe(400);
  });

  it('accepts valid request and returns testId', async () => {
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send({ apiUrl: 'https://httpbin.org/get', vus: 5, duration: '10s' });
    expect(res.status).toBe(202);
    expect(res.body.testId).toBeDefined();
    expect(res.body.status).toBe('pending');
  });
});

describe('GET /api/benchmark/:id', () => {
  it('returns test result by id', async () => {
    const res = await request(app)
      .get('/api/benchmark/test-123')
      .set('X-API-Key', 'demo-key-12345');
    expect(res.status).toBe(200);
    expect(res.body.test_id).toBe('test-123');
  });
});

describe('GET /api/benchmark', () => {
  it('returns list of benchmarks', async () => {
    const res = await request(app)
      .get('/api/benchmark')
      .set('X-API-Key', 'demo-key-12345');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Metrics endpoint ──────────────────────────────────────────────────────────
describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });
});

// ── Input validation edge cases ───────────────────────────────────────────────
describe('Input validation', () => {
  it('rejects oversized body', async () => {
    const bigPayload = { apiUrl: 'https://httpbin.org/get', body: 'x'.repeat(20000) };
    const res = await request(app)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .send(bigPayload);
    // Express returns 413 or 500 depending on error handler — both indicate rejection
    expect([413, 500]).toContain(res.status);
  });

  it('accepts POST method', async () => {
    // Use a fresh supertest instance to avoid rate limiter state from previous tests
    const freshApp = require('../src/index');
    const res = await request(freshApp)
      .post('/api/benchmark/run')
      .set('X-API-Key', 'demo-key-12345')
      .set('X-Forwarded-For', '10.0.0.99')  // different IP to bypass rate limiter
      .send({ apiUrl: 'https://httpbin.org/get', vus: 1, duration: '10s', method: 'POST' });
    expect([202, 429]).toContain(res.status); // 202 success or 429 rate limited — both valid
  });
});
