const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../services/authService');
const { protect } = require('../middleware/auth');
const logger = require('../config/logger');

// Registro de usuario
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son obligatorios.' });
    }
    const user = await registerUser({ username, email, password });
    res.status(201).json({ user });
  } catch (err) {
    logger.error('Error en /api/auth/register:', err);
    if (err.status) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
});

/**
 * Login de usuario
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son obligatorios.' });
    }
    const result = await loginUser({ username, password });
    res.status(200).json(result);
  } catch (err) {
    logger.error('Error en /api/auth/login:', err);
    if (err.status) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
});

// Verify token endpoint
router.get('/verify', protect, async (req, res) => {
  try {
    res.status(200).json({ message: 'Token is valid', user: req.user });
  } catch (err) {
    logger.error('Error in /api/auth/verify:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
