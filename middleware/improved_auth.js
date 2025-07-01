const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;

// Improved protect middleware with real-time role validation
const protectImproved = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn('No token found, authorization denied');
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  try {
    // 1. Verify JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 2. Get fresh user data from database (real-time role check)
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      logger.warn(`User ${decoded.id} not found in database`);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const currentUser = result.rows[0];
    
    // 3. Check if user is still active (you could add an 'active' field)
    // if (!currentUser.active) {
    //   return res.status(401).json({ error: 'User account deactivated' });
    // }
    
    // 4. Use CURRENT role from database, not token
    req.user = {
      id: currentUser.id,
      username: currentUser.username,
      role: currentUser.role, // ← Fresh from database
      email: currentUser.email
    };
    
    // 5. Log if role changed since token was issued
    if (decoded.role !== currentUser.role) {
      logger.info(`Role change detected for user ${currentUser.username}: ${decoded.role} → ${currentUser.role}`);
    }
    
    logger.info(`User ${req.user.username} (Current Role: ${req.user.role}) authenticated for ${req.method} ${req.originalUrl}`);
    next();
    
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Not authorized, token expired' });
    }
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

// Improved authorize middleware with better logging
const authorizeImproved = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      logger.warn(`Authorization failed for ${req.method} ${req.originalUrl}: User not authenticated or role missing.`);
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    
    // Convert roles to lowercase for case-insensitive comparison
    const normalizedRoles = roles.map(role => role.toLowerCase());
    const userRole = req.user.role.toLowerCase();
    
    if (!normalizedRoles.includes(userRole)) {
      logger.warn(`Authorization failed for user ${req.user.username} (Role: ${req.user.role}) to access ${req.method} ${req.originalUrl}. Required roles: ${roles.join(', ')}`);
      return res.status(403).json({ 
        error: 'Forbidden: You do not have the required role to access this resource',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    logger.info(`User ${req.user.username} (Role: ${req.user.role}) authorized for ${req.method} ${req.originalUrl} with required roles: ${roles.join(', ')}`);
    next();
  };
};

module.exports = {
  protectImproved,
  authorizeImproved,
  // Keep original exports for backward compatibility
  protect: protectImproved,
  authorize: authorizeImproved
};