const pool = require('../config/db');
const logger = require('../config/logger');
// const { app } = require('../server'); // Removed: To be replaced by DI

let _broadcastWebSocket = null;

function initOperationService(dependencies) {
  if (dependencies && dependencies.broadcastWebSocket) {
    _broadcastWebSocket = dependencies.broadcastWebSocket;
    logger.info('OperationService initialized with broadcastWebSocket capability.');
  } else {
    logger.warn('OperationService initialized WITHOUT broadcastWebSocket capability.');
  }
}

async function recordOperation({
  userId,
  deviceId,
  serviceName,
  action,
  targetEntityType,
  targetEntityId,
  status,
  details
}) {
  // Basic validation
  if (!serviceName || !action || !status) {
    const error = new Error('serviceName, action, and status are required for recording an operation.');
    error.status = 400;
    logger.error('Attempt to record invalid operation:', { serviceName, action, status, userId, deviceId });
    throw error;
  }

  try {
    const query = `
      INSERT INTO operations_log (user_id, device_id, service_name, action, target_entity_type, target_entity_id, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      userId || null,
      deviceId || null,
      serviceName,
      action,
      targetEntityType || null,
      targetEntityId || null,
      status,
      details || {}
    ];
    const result = await pool.query(query, values);
    const newOperationLog = result.rows[0];
    logger.info(`Operation recorded: ${serviceName} - ${action} (Log ID: ${newOperationLog.id}, Status: ${status})`);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({
          type: 'operation_recorded',
          data: newOperationLog
        });
        // logger.info(`WebSocket broadcast sent for operation_recorded: Log ID ${newOperationLog.id}`); // Optional log
      } catch (broadcastError) {
        logger.error('Error broadcasting operation_recorded event from OperationService:', broadcastError);
      }
    } else {
       logger.debug('broadcastWebSocket not initialized in OperationService for operation_recorded event.');
    }
    return newOperationLog;
  } catch (err) {
    logger.error('Error in recordOperation:', {
        errorMessage: err.message,
        serviceName,
        action,
        status,
        errorStack: err.stack
    });
    // Re-throw for the route handler to manage the HTTP response.
    // If called internally by other services that shouldn't fail due to logging,
    // those services would need to wrap this call in their own try/catch.
    throw err;
  }
}

async function getOperations(queryParams = {}) {
  const { userId, deviceId, serviceName, action, status, startDate, endDate, targetEntityType, targetEntityId, limit = 50, page = 1 } = queryParams;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (userId) { conditions.push(`user_id = $${paramCount++}`); values.push(userId); }
  if (deviceId) { conditions.push(`device_id = $${paramCount++}`); values.push(deviceId); }
  if (serviceName) { conditions.push(`service_name ILIKE $${paramCount++}`); values.push(`%${serviceName}%`); }
  if (action) { conditions.push(`action ILIKE $${paramCount++}`); values.push(`%${action}%`); }
  if (status) { conditions.push(`status = $${paramCount++}`); values.push(status); }
  if (startDate) { conditions.push(`timestamp >= $${paramCount++}`); values.push(startDate); }
  if (endDate) { conditions.push(`timestamp <= $${paramCount++}`); values.push(endDate); }
  if (targetEntityType) { conditions.push(`target_entity_type ILIKE $${paramCount++}`); values.push(`%${targetEntityType}%`); }
  if (targetEntityId) { conditions.push(`target_entity_id ILIKE $${paramCount++}`); values.push(`%${targetEntityId}%`); }


  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT * FROM operations_log
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramCount++}
    OFFSET $${paramCount++};
  `;
  const queryValues = [...values, parseInt(limit, 10), offset];

  // Count query for pagination
  const countQuery = `SELECT COUNT(*) FROM operations_log ${whereClause};`;
  // Values for count query are same as main query, excluding limit and offset (i.e., the original 'values' array)

  try {
    const result = await pool.query(query, queryValues);
    const totalCountResult = await pool.query(countQuery, values); // Use original 'values' for count
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);

    return {
      data: result.rows,
      meta: {
        page: parseInt(page,10),
        limit: parseInt(limit,10),
        totalRecords,
        totalPages: Math.ceil(totalRecords / parseInt(limit, 10)),
      },
    };
  } catch (err) {
    logger.error('Error in getOperations:', { errorMessage: err.message, queryParams, errorStack: err.stack });
    throw err;
  }
}

module.exports = {
  initOperationService, // Added init function
  recordOperation,
  getOperations,
};
