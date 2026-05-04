/**
 * Auth Routes
 * POST /auth/login  - Get JWT token
 * POST /auth/token  - Get token via API key exchange
 */

const express = require('express');
const { generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Demo users — in production replace with DB + bcrypt hashed passwords
// Override via DEMO_ADMIN_PASSWORD and DEMO_USER_PASSWORD env vars
const DEMO_USERS = {
  'admin': { password: process.env.DEMO_ADMIN_PASSWORD || 'admin123', role: 'admin' },
  'demo':  { password: process.env.DEMO_USER_PASSWORD  || 'demo123',  role: 'user'  },
};

/**
 * POST /auth/login
 * Body: { username, password }
 * Returns: { token, expiresIn }
 */
router.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = DEMO_USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ id: username, role: user.role });

  res.json({
    token,
    expiresIn: '24h',
    user: { id: username, role: user.role },
    message: 'Use this token in: Authorization: Bearer <token>'
  });
});

/**
 * GET /auth/me
 * Returns current user info from token
 */
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
