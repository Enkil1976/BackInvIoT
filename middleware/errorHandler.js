const logger = require('../config/logger');
const { toChileISOString } = require('../config/timezone');

// Middleware global de manejo de errores
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`${status} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  res.status(status).json({
    error: message,
    path: req.originalUrl,
    timestamp: toChileISOString()
  });
}

module.exports = errorHandler;
