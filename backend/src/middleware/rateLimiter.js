/**
 * Rate Limiting Middleware
 * Uses express-rate-limit to prevent abuse
 */

const rateLimit = require('express-rate-limit');

// IPv6-safe key generator (required by express-rate-limit v7+)
function ipKeyGenerator(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Normalize IPv6-mapped IPv4 addresses (::ffff:1.2.3.4 → 1.2.3.4)
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

// General API rate limit — keep CI/test runs unthrottled so load tests can run
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? Number.MAX_SAFE_INTEGER : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: {
    error: 'Too many requests. Please try again after 15 minutes.',
  },
});

// Strict limiter for load test trigger — 5 tests per minute per IP
// Relax in test environment so CI can trigger multiple runs in quick succession
const loadTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? Number.MAX_SAFE_INTEGER : 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: {
    error: 'Load test rate limit exceeded. Maximum 5 tests per minute.',
  },
});

// Auth endpoint limiter — 10 attempts per 15 minutes (prevents brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

module.exports = { generalLimiter, loadTestLimiter, authLimiter };
