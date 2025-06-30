const pool = require('../config/db');
const logger = require('../config/logger');
const { toChileISOString } = require('../config/timezone');

/**
 * Registra un evento de auditoría en la base de datos
 * @param {Object} req - Request object de Express
 * @param {string} action - Tipo de acción ('login', 'logout', 'failed_login', 'register', etc.)
 * @param {boolean} success - Si la acción fue exitosa
 * @param {Object} details - Detalles adicionales del evento
 * @param {number|null} userId - ID del usuario (opcional)
 */
const auditLogin = async (req, action, success = true, details = {}, userId = null) => {
  try {
    // Obtener información del request
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || null;
    const userAgent = req.get('User-Agent') || null;
    const finalUserId = userId || req.user?.id || null;

    // Preparar detalles adicionales
    const auditDetails = {
      ...details,
      endpoint: req.originalUrl,
      method: req.method,
      timestamp: toChileISOString()
    };

    // Insertar en la base de datos
    await pool.query(
      `INSERT INTO auth_audit (user_id, action, ip_address, user_agent, success, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        finalUserId,
        action,
        ipAddress,
        userAgent,
        success,
        JSON.stringify(auditDetails)
      ]
    );

    logger.info(`Audit logged: ${action} - User: ${finalUserId || 'N/A'} - IP: ${ipAddress} - Success: ${success}`);
  } catch (error) {
    // No fallar la operación principal si falla el audit
    logger.error('Error logging audit event:', error.message);
  }
};

/**
 * Middleware para auditar automáticamente eventos de login exitoso
 */
const auditSuccessfulLogin = (req, res, next) => {
  // Interceptar la respuesta para auditar después del login exitoso
  const originalSend = res.send;
  
  res.send = function(data) {
    // Solo auditar si es un login exitoso (status 200 y contiene token)
    if (res.statusCode === 200 && req.originalUrl.includes('/login')) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        if (responseData.token) {
          // Extraer username del body del request
          const username = req.body?.username;
          auditLogin(req, 'login', true, { username }, null);
        }
      } catch (error) {
        logger.error('Error in audit middleware:', error.message);
      }
    }
    
    // Llamar al método original
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * Middleware para auditar automáticamente eventos de registro exitoso
 */
const auditSuccessfulRegister = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Solo auditar si es un registro exitoso (status 201)
    if (res.statusCode === 201 && req.originalUrl.includes('/register')) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        if (responseData.user) {
          auditLogin(req, 'register', true, { 
            username: responseData.user.username,
            email: responseData.user.email 
          }, responseData.user.id);
        }
      } catch (error) {
        logger.error('Error in register audit middleware:', error.message);
      }
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

/**
 * Audita intentos de login fallidos
 */
const auditFailedLogin = async (req, username, reason) => {
  await auditLogin(req, 'failed_login', false, { 
    username, 
    reason,
    attemptedAt: toChileISOString()
  });
};

/**
 * Audita eventos de logout
 */
const auditLogout = async (req) => {
  await auditLogin(req, 'logout', true, {
    username: req.user?.username,
    logoutAt: toChileISOString()
  });
};

/**
 * Audita tokens expirados o inválidos
 */
const auditTokenEvent = async (req, eventType, details = {}) => {
  await auditLogin(req, eventType, false, {
    ...details,
    eventAt: toChileISOString()
  });
};

/**
 * Obtener estadísticas de auditoría
 */
const getAuditStats = async (days = 7) => {
  try {
    const result = await pool.query(`
      SELECT 
        action,
        success,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM auth_audit 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY action, success, DATE(created_at)
      ORDER BY date DESC, action
    `);
    
    return result.rows;
  } catch (error) {
    logger.error('Error getting audit stats:', error.message);
    return [];
  }
};

/**
 * Obtener eventos de auditoría recientes para un usuario
 */
const getUserAuditHistory = async (userId, limit = 50) => {
  try {
    const result = await pool.query(`
      SELECT 
        action,
        ip_address,
        success,
        details,
        created_at
      FROM auth_audit 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows;
  } catch (error) {
    logger.error('Error getting user audit history:', error.message);
    return [];
  }
};

module.exports = {
  auditLogin,
  auditSuccessfulLogin,
  auditSuccessfulRegister,
  auditFailedLogin,
  auditLogout,
  auditTokenEvent,
  getAuditStats,
  getUserAuditHistory
};
