/**
 * Authentication Middleware
 * Supports two methods:
 *   1. JWT Bearer token:  Authorization: Bearer <token>
 *   2. API Key header:    X-API-Key: <key>
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-env';

// Static API keys — in production store hashed keys in DB
const VALID_API_KEYS = new Set(
  (process.env.API_KEYS || 'demo-key-12345,test-key-67890').split(',')
);

/**
 * Middleware: verify JWT or API key
 */
function authenticate(req, res, next) {
  // --- Method 1: API Key ---
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    if (VALID_API_KEYS.has(apiKey)) {
      req.user = { id: 'api-key-user', method: 'api-key' };
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // --- Method 2: JWT Bearer token ---
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Provide X-API-Key header or Authorization: Bearer <token>'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Generate a JWT token (used by /auth/login)
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authenticate, generateToken };
