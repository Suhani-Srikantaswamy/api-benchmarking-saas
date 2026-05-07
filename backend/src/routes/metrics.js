/**
 * Prometheus Metrics Endpoint
 * GET /metrics — scraped by Prometheus every 10s
 */

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const register = req.app.get('promRegistry');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = router;
