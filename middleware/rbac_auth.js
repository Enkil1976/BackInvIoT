/**
 * Role-Based Access Control (RBAC) implementation
 * Based on Cerbos best practices for JWT and authorization
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;

// Define role hierarchy and permissions
const ROLE_HIERARCHY = {
  'super_admin': 5,
  'admin': 4,
  'editor': 3,
  'operator': 2,
  'viewer': 1,
  'user': 1
};

const PERMISSIONS = {
  // Device management
  'devices:create': ['admin', 'editor'],
  'devices:read': ['admin', 'editor', 'operator', 'viewer'],
  'devices:update': ['admin', 'editor'],
  'devices:delete': ['admin'],
  'devices:control': ['admin', 'editor', 'operator'],
  
  // User management
  'users:create': ['admin'],
  'users:read': ['admin', 'editor'],
  'users:update': ['admin'],
  'users:delete': ['admin'],
  
  // System administration
  'system:config': ['admin'],
  'system:logs': ['admin', 'editor'],
  'system:monitoring': ['admin', 'editor', 'operator'],
  
  // Rules and automation
  'rules:create': ['admin', 'editor'],
  'rules:read': ['admin', 'editor', 'viewer'],
  'rules:update': ['admin', 'editor'],
  'rules:delete': ['admin', 'editor'],
  
  // Scheduled operations
  'schedules:create': ['admin', 'editor'],
  'schedules:read': ['admin', 'editor', 'viewer'],
  'schedules:update': ['admin', 'editor'],
  'schedules:delete': ['admin', 'editor']
};

/**
 * Enhanced protect middleware with real-time role fetching
 */
const protectRBAC = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn('No token found, authorization denied');
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  try {
    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get current user data from database
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [decoded.sub || decoded.id]
    );
    
    if (result.rows.length === 0) {
      logger.warn(`User ${decoded.sub || decoded.id} not found in database`);
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Attach user with fresh role to request
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      roleLevel: ROLE_HIERARCHY[user.role] || 0
    };
    
    logger.info(`User ${req.user.username} (Role: ${req.user.role}) authenticated for ${req.method} ${req.originalUrl}`);
    next();
    
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Not authorized, token expired' });
    }
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

/**
 * Permission-based authorization middleware
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      logger.warn(`Permission check failed for ${req.method} ${req.originalUrl}: User not authenticated`);
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    
    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) {
      logger.error(`Unknown permission: ${permission}`);
      return res.status(500).json({ error: 'Internal authorization error' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Permission denied for user ${req.user.username} (Role: ${req.user.role}) to access ${req.method} ${req.originalUrl}. Required permission: ${permission}`);
      return res.status(403).json({ 
        error: 'Forbidden: Insufficient permissions',
        requiredPermission: permission,
        allowedRoles: allowedRoles,
        userRole: req.user.role
      });
    }
    
    logger.info(`User ${req.user.username} (Role: ${req.user.role}) authorized for ${req.method} ${req.originalUrl} with permission: ${permission}`);
    next();
  };
};

/**
 * Role hierarchy-based authorization
 */
const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
    
    if (userLevel < requiredLevel) {
      logger.warn(`Role hierarchy check failed for user ${req.user.username} (Role: ${req.user.role}, Level: ${userLevel}) to access ${req.method} ${req.originalUrl}. Required minimum role: ${minRole} (Level: ${requiredLevel})`);
      return res.status(403).json({ 
        error: 'Forbidden: Insufficient role level',
        userRole: req.user.role,
        userLevel: userLevel,
        requiredRole: minRole,
        requiredLevel: requiredLevel
      });
    }
    
    next();
  };
};

/**
 * Combined authorization (backward compatible)
 */
const authorizeRBAC = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    
    if (!roles.includes(req.user.role)) {
      logger.warn(`Authorization failed for user ${req.user.username} (Role: ${req.user.role}) to access ${req.method} ${req.originalUrl}. Required roles: ${roles.join(', ')}`);
      return res.status(403).json({ 
        error: 'Forbidden: You do not have the required role to access this resource',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    next();
  };
};

module.exports = {
  protectRBAC,
  requirePermission,
  requireMinRole,
  authorizeRBAC,
  PERMISSIONS,
  ROLE_HIERARCHY,
  // Aliases for easier migration
  protect: protectRBAC,
  authorize: authorizeRBAC
};