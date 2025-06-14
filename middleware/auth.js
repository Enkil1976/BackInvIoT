const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado.' });
    }
    const token = authHeader.split(' ')[1];

    // Verificar JWT
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    // (Opcional) Verificar en Redis si el token está activo
    if (redis && redis.get) {
      const exists = await redis.get(`session:${payload.id}:${token}`);
      if (!exists) {
        return res.status(401).json({ error: 'Sesión inválida o token revocado.' });
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    logger.error('Error en authMiddleware:', err);
    res.status(500).json({ error: 'Error interno de autenticación.' });
  }
}

module.exports = authMiddleware;
