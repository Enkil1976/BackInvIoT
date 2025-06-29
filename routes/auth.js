const express = require('express');
const router = express.Router();
const { registerUser } = require('../services/authService');
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
    const result = await require('../services/authService').loginUser({ username, password });
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

module.exports = router;
