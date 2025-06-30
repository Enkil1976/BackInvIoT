const bcrypt = require('bcrypt');
const pool = require('../config/db');
const logger = require('../config/logger');

const SALT_ROUNDS = 12;

async function registerUser({ username, email, password }) {
  try {
    // Validar formato de email si se proporciona
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        const error = new Error('Formato de email inválido.');
        error.status = 400;
        throw error;
      }
    }

    // Verificar si el usuario ya existe
    const userExists = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (userExists.rows.length > 0) {
      const error = new Error('El nombre de usuario ya está en uso.');
      error.status = 409;
      throw error;
    }

    // Hashear la contraseña
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insertar el usuario
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at, role`,
      [username, email || null, passwordHash]
    );

    logger.info(`Usuario registrado: ${username}`);
    return result.rows[0];
  } catch (err) {
    logger.error('Error en registerUser:', err);
    throw err;
  }
}

const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'supersecret') {
  throw new Error('JWT_SECRET must be set to a secure value in environment variables');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

async function loginUser({ username, password }) {
  try {
    // Buscar usuario
    const result = await pool.query(
      'SELECT id, username, email, password_hash, created_at, role FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      const error = new Error('Usuario o contraseña incorrectos.');
      error.status = 401;
      throw error;
    }
    const user = result.rows[0];
    logger.info('Usuario obtenido de la base de datos en loginUser:', user);

    // Verificar contraseña
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const error = new Error('Usuario o contraseña incorrectos.');
      error.status = 401;
      throw error;
    }

    // Generar JWT
    const payload = { id: user.id, username: user.username, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Guardar token en Redis (opcional, para invalidación/control)
    if (redis && redis.set) {
      // Guardar el token con expiración igual a la del JWT
      await redis.set(`session:${user.id}:${token}`, '1', 'EX', parseJwtExp(JWT_EXPIRES_IN));
    }

    logger.info(`Usuario autenticado: ${username}`);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        role: user.role,
      },
    };
  } catch (err) {
    logger.error('Error en loginUser:', err);
    throw err;
  }
}

// Convierte '1h', '30m', '10s' a segundos
function parseJwtExp(exp) {
  if (typeof exp === 'number') return exp;
  const match = /^(\d+)([smhd])$/.exec(exp);
  if (!match) return 3600;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 3600;
  }
}

module.exports = {
  registerUser,
  loginUser,
};
