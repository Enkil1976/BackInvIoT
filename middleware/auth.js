const jwt = require('jsonwebtoken');
const logger = require('../config/logger'); // Assuming logger is in ../config/logger

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret'; // Should match authService.js

// Middleware to verify JWT and attach user to request
const protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // else if (req.cookies.token) { // Optional: check for token in cookies
  //   token = req.cookies.token;
  // }

  if (!token) {
    logger.warn('No token found, authorization denied');
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // We could fetch the user from DB here to ensure they still exist/are active
    // For now, we'll trust the decoded payload.
    req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
    };
    logger.info(`User ${req.user.username} (Role: ${req.user.role}) authenticated for resource: ${req.method} ${req.originalUrl}`);
    next();
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Not authorized, token expired' });
    }
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

// Middleware for role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      logger.warn(`Authorization failed for ${req.method} ${req.originalUrl}: User not authenticated or role missing.`);
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn(`Authorization failed for user ${req.user.username} (Role: ${req.user.role}) to access ${req.method} ${req.originalUrl}. Required roles: ${roles.join(', ')}`);
      return res.status(403).json({ error: 'Forbidden: You do not have the required role to access this resource' });
    }
    logger.info(`User ${req.user.username} (Role: ${req.user.role}) authorized for resource: ${req.method} ${req.originalUrl} with required roles: ${roles.join(', ')}`);
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
