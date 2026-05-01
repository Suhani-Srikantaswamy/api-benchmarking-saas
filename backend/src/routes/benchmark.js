/**
 * Benchmark Routes
 *
 * Auth is required to USE our SaaS (POST /run, GET results).
 * Auth is NOT enforced on the target API — k6 calls it freely.
 * Custom headers can be passed to the target API via the request body.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const logger = require('../logger');
const { authenticate } = require('../middleware/auth');
const { loadTestLimiter } = require('../middleware/rateLimiter');
const { enqueueLoadTest } = require('../queue');

const router = express.Router();

// ── Validation rules ──────────────────────────────────────────────────────────
const runValidation = [
  body('apiUrl')
    .notEmpty().withMessage('apiUrl is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('apiUrl must be a valid http/https URL')
    .isLength({ max: 2048 }).withMessage('URL too long'),
  body('vus')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('vus must be between 1 and 100'),
  body('duration')
    .optional()
    .matches(/^\d+[smh]$/).withMessage('duration must be like 10s, 1m, 2h'),
  body('headers')
    .optional()
    .isObject().withMessage('headers must be a JSON object'),
  body('method')
    .optional()
    .isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).withMessage('method must be GET, POST, PUT, PATCH, or DELETE'),
];

// ── POST /api/benchmark/run ───────────────────────────────────────────────────
router.post('/run', authenticate, loadTestLimiter, runValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    apiUrl,
    vus = 10,
    duration = '10s',
    headers = {},   // custom headers forwarded to the target API by k6
    method = 'GET', // HTTP method for k6 to use
  } = req.body;

  const testId = uuidv4();

  try {
    await db.createPendingBenchmark(testId, apiUrl);

    // Pass headers and method to the worker via the queue
    await enqueueLoadTest({ testId, apiUrl, vus, duration, headers, method });

    const appMetrics = req.app.get('appMetrics');
    if (appMetrics) appMetrics.loadTestsTotal.inc({ status: 'queued' });

    logger.info('Load test queued', {
      testId, apiUrl, vus, duration,
      hasCustomHeaders: Object.keys(headers).length > 0,
      method,
      user: req.user?.id,
    });

    res.status(202).json({
      testId,
      status: 'pending',
      message: 'Load test queued. Poll GET /api/benchmark/:testId for results.',
    });
  } catch (err) {
    logger.error('Failed to queue load test', { error: err.message, testId });
    res.status(500).json({ error: 'Failed to start load test. Is Redis running?' });
  }
});

// ── GET /api/benchmark ────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const results = await db.getAllBenchmarks(limit);
    res.json(results);
  } catch (err) {
    logger.error('Failed to fetch benchmarks', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// ── GET /api/benchmark/:id ────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.getBenchmark(req.params.id);
    if (!result) return res.status(404).json({ error: 'Test not found' });
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch benchmark', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch result' });
  }
});

module.exports = router;
