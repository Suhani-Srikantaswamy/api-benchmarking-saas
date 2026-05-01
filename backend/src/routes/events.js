/**
 * Fix 19: Server-Sent Events (SSE) — replaces polling
 * Client connects once, server pushes updates when test status changes.
 *
 * Usage: GET /api/events/:testId
 * Frontend: const es = new EventSource(`/api/events/${testId}`)
 */

const express = require('express');
const db = require('../db');
const logger = require('../logger');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Active SSE clients: Map<testId, Set<res>>
const clients = new Map();

/**
 * Notify all SSE clients watching a testId
 */
function notifyClients(testId, data) {
  const watchers = clients.get(testId);
  if (!watchers || watchers.size === 0) return;

  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of watchers) {
    try { res.write(payload); } catch {}
  }

  // If terminal state, close all connections for this testId
  if (data.status === 'completed' || data.status === 'failed') {
    for (const res of watchers) {
      try { res.end(); } catch {}
    }
    clients.delete(testId);
  }
}

/**
 * GET /api/events/:testId
 * Opens an SSE stream for real-time test updates
 */
router.get('/:testId', authenticate, async (req, res) => {
  const { testId } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial state
  try {
    const result = await db.getBenchmark(testId);
    if (!result) {
      res.write(`data: ${JSON.stringify({ error: 'Test not found' })}\n\n`);
      return res.end();
    }

    res.write(`data: ${JSON.stringify(result)}\n\n`);

    // If already done, close immediately
    if (result.status === 'completed' || result.status === 'failed') {
      return res.end();
    }
  } catch (err) {
    logger.error('SSE initial fetch failed', { error: err.message, testId });
  }

  // Register client
  if (!clients.has(testId)) clients.set(testId, new Set());
  clients.get(testId).add(res);

  // Heartbeat every 15s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.get(testId)?.delete(res);
    if (clients.get(testId)?.size === 0) clients.delete(testId);
  });
});

module.exports = { router, notifyClients };
