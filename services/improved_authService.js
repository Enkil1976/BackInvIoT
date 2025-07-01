const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const redis = require('../config/redis');
const logger = require('../config/logger');

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Shorter expiration

/**
 * Improved login with minimal JWT payload and role caching
 */
async function loginUserImproved({ username, password }) {
  try {
    // 1. Authenticate user
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
    
    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const error = new Error('Usuario o contraseña incorrectos.');
      error.status = 401;
      throw error;
    }
    
    // 3. Create minimal JWT payload (following Cerbos best practices)
    const payload = { 
      sub: user.id.toString(),  // Subject (user ID)
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      // No role in JWT - will be fetched fresh from DB
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    // 4. Cache user role in Redis for faster lookups
    if (redis && redis.set) {
      const roleKey = `user_role:${user.id}`;
      await redis.set(roleKey, user.role, 'EX', 900); // 15 minutes
      
      // Also cache user session
      const sessionKey = `session:${user.id}:${token}`;
      await redis.set(sessionKey, JSON.stringify({
        username: user.username,
        role: user.role,
        loginTime: new Date().toISOString()
      }), 'EX', parseJwtExp(JWT_EXPIRES_IN));
    }
    
    logger.info(`User authenticated: ${username} (Role: ${user.role})`);
    
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
    logger.error('Error en loginUserImproved:', err);
    throw err;
  }
}

/**
 * Get user role with caching
 */
async function getUserRole(userId) {
  try {
    // 1. Try cache first
    if (redis && redis.get) {
      const cachedRole = await redis.get(`user_role:${userId}`);
      if (cachedRole) {
        return cachedRole;
      }
    }
    
    // 2. Fallback to database
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const role = result.rows[0].role;
    
    // 3. Update cache
    if (redis && redis.set) {
      await redis.set(`user_role:${userId}`, role, 'EX', 900);
    }
    
    return role;
    
  } catch (error) {
    logger.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Invalidate user role cache (call when role changes)
 */
async function invalidateUserRoleCache(userId) {
  try {
    if (redis && redis.del) {
      await redis.del(`user_role:${userId}`);
      logger.info(`Role cache invalidated for user ${userId}`);
    }
  } catch (error) {
    logger.error('Error invalidating role cache:', error);
  }
}

// Utility function (existing)
function parseJwtExp(exp) {
  if (typeof exp === 'number') return exp;
  const match = /^(\d+)([smhd])$/.exec(exp);
  if (!match) return 900; // 15 minutes default
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 900;
  }
}

module.exports = {
  loginUserImproved,
  getUserRole,
  invalidateUserRoleCache,
  // Keep original for backward compatibility
  loginUser: loginUserImproved
};