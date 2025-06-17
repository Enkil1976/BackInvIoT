const pool = require('../config/db');
const logger = require('../config/logger');
// const cronParser = require('cron-parser'); // Would be needed for full cron next_execution_at calculation

// Helper function to calculate next_execution_at (simplified)
function calculateNextExecutionTime(data, isEnabled = true) {
  let nextExecutionAt = null;
  if (isEnabled) {
    if (data.execute_at) {
      const executeAtDate = new Date(data.execute_at);
      if (!isNaN(executeAtDate)) {
          nextExecutionAt = executeAtDate;
      } else {
          logger.warn(`Invalid execute_at date format: ${data.execute_at}`);
          // Potentially throw an error or handle as invalid input
      }
    }
    // Full cron parsing would go here if library was available and integrated
    // For now, if cron_expression is present, we log and rely on execute_at or leave null
    if (data.cron_expression) {
      logger.warn(`Cron expression '${data.cron_expression}' present. Advanced calculation of next_execution_at from cron is not yet implemented. Next_execution_at will be based on execute_at if provided, otherwise null.`);
      // Example of how it might work with a library:
      // try {
      //   if (!nextExecutionAt || data.execute_at === undefined) { // If execute_at isn't setting it or not present
      //     const interval = cronParser.parseExpression(data.cron_expression);
      //     nextExecutionAt = interval.next().toDate();
      //   }
      // } catch (err) {
      //   logger.error(`Invalid cron expression '${data.cron_expression}': ${err.message}`);
      //   // Decide: throw error, or set nextExecutionAt to null and log?
      //   // For now, if execute_at is not there, it remains null.
      // }
    }
  }
  return nextExecutionAt;
}

async function createScheduledOperation(scheduleData) {
  const {
    device_id,
    action_name,
    action_params,
    cron_expression,
    execute_at,
    is_enabled = true, // Default to true if not provided
    description
  } = scheduleData;

  if (!device_id || !action_name || (!cron_expression && !execute_at)) {
    const error = new Error('deviceId, actionName, and either cronExpression or executeAt are required.');
    error.status = 400;
    logger.warn('Create scheduled operation failed due to missing required fields.', scheduleData);
    throw error;
  }
  if (cron_expression && execute_at) {
      logger.info(`Both cron_expression and execute_at provided for new schedule. execute_at will be used as the initial next_execution_at if schedule is enabled. Cron will dictate subsequent runs if applicable.`);
  }


  const next_execution_at = calculateNextExecutionTime({ execute_at, cron_expression }, is_enabled);

  try {
    const query = `
      INSERT INTO scheduled_operations
        (device_id, action_name, action_params, cron_expression, execute_at, is_enabled, description, next_execution_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      device_id,
      action_name,
      action_params || {},
      cron_expression || null,
      execute_at ? new Date(execute_at) : null, // Ensure it's a date object or null
      is_enabled,
      description || null,
      next_execution_at
    ];
    const result = await pool.query(query, values);
    logger.info(`Scheduled operation created: ID ${result.rows[0].id} for device ${device_id}`);
    return result.rows[0];
  } catch (err) {
    logger.error('Error in createScheduledOperation:', { errorMessage: err.message, scheduleData });
    throw err;
  }
}

async function getScheduledOperations(queryParams = {}) {
  const { deviceId, isEnabled, limit = 50, page = 1 } = queryParams;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (deviceId) { conditions.push(`device_id = $${paramCount++}`); values.push(deviceId); }
  if (isEnabled !== undefined) { conditions.push(`is_enabled = $${paramCount++}`); values.push(isEnabled); }
  // Add more filters: action_name, date ranges for next_execution_at etc.

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT * FROM scheduled_operations
    ${whereClause}
    ORDER BY next_execution_at ASC NULLS LAST, created_at DESC
    LIMIT $${paramCount++}
    OFFSET $${paramCount++};
  `;
  const queryValues = [...values, parseInt(limit, 10), offset];

  const countQuery = `SELECT COUNT(*) FROM scheduled_operations ${whereClause};`;
  const countValues = [...values];

  try {
    const result = await pool.query(query, queryValues);
    const totalCountResult = await pool.query(countQuery, countValues);
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);
    return {
      data: result.rows,
      meta: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalRecords,
        totalPages: Math.ceil(totalRecords / parseInt(limit, 10)),
      },
    };
  } catch (err) {
    logger.error('Error in getScheduledOperations:', { errorMessage: err.message, queryParams });
    throw err;
  }
}

async function getScheduledOperationById(id) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid schedule ID format.');
    error.status = 400; throw error;
  }
  try {
    const result = await pool.query('SELECT * FROM scheduled_operations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Scheduled operation not found.');
      error.status = 404; throw error;
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in getScheduledOperationById (ID: ${id}):`, { errorMessage: err.message });
    throw err;
  }
}

async function updateScheduledOperation(id, updateData) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid schedule ID format.');
    error.status = 400; throw error;
  }

  const { device_id, action_name, action_params, cron_expression, execute_at, is_enabled, description } = updateData;
  const fields = [];
  const values = [];
  let paramCount = 1;

  // Fetch current schedule to compare for next_execution_at logic
  const currentSchedule = await getScheduledOperationById(id); // This will throw 404 if not found

  if (device_id !== undefined) { fields.push(`device_id = $${paramCount++}`); values.push(device_id); }
  if (action_name !== undefined) { fields.push(`action_name = $${paramCount++}`); values.push(action_name); }
  if (action_params !== undefined) { fields.push(`action_params = $${paramCount++}`); values.push(action_params || {}); }
  if (cron_expression !== undefined) { fields.push(`cron_expression = $${paramCount++}`); values.push(cron_expression); }
  if (execute_at !== undefined) { fields.push(`execute_at = $${paramCount++}`); values.push(execute_at ? new Date(execute_at) : null); }
  if (is_enabled !== undefined) { fields.push(`is_enabled = $${paramCount++}`); values.push(is_enabled); }
  if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(description); }

  // Determine if timing-related fields or is_enabled have changed
  const currentIsEnabled = currentSchedule.is_enabled;
  const newIsEnabled = (is_enabled === undefined) ? currentIsEnabled : is_enabled;

  const currentExecuteAt = currentSchedule.execute_at ? new Date(currentSchedule.execute_at).toISOString() : null;
  const newExecuteAt = execute_at ? new Date(execute_at).toISOString() : currentExecuteAt;

  const currentCron = currentSchedule.cron_expression;
  const newCron = cron_expression === undefined ? currentCron : cron_expression;

  let next_execution_at;
  if (is_enabled !== undefined || execute_at !== undefined || cron_expression !== undefined) {
      // If any relevant field is explicitly in updateData, recalculate.
      // Use values from updateData if present, else from currentSchedule for calculation.
      const calcData = {
          execute_at: execute_at !== undefined ? updateData.execute_at : currentSchedule.execute_at,
          cron_expression: cron_expression !== undefined ? updateData.cron_expression : currentSchedule.cron_expression
      };
      next_execution_at = calculateNextExecutionTime(calcData, newIsEnabled);
      fields.push(`next_execution_at = $${paramCount++}`);
      values.push(next_execution_at);
  }


  if (fields.length === 0) {
    const error = new Error('No fields provided for update.');
    error.status = 400; throw error;
  }

  values.push(id); // For WHERE id = $N
  const query = `UPDATE scheduled_operations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *;`;

  try {
    const result = await pool.query(query, values);
    // getScheduledOperationById would have thrown 404 if not found, so result should have a row.
    logger.info(`Scheduled operation updated: ID ${id}`);
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in updateScheduledOperation (ID: ${id}):`, { errorMessage: err.message, updateData });
    throw err;
  }
}

async function deleteScheduledOperation(id) {
   if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid schedule ID format.');
    error.status = 400; throw error;
  }
  try {
    const result = await pool.query('DELETE FROM scheduled_operations WHERE id = $1 RETURNING *;', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Scheduled operation not found for deletion.');
      error.status = 404; throw error;
    }
    logger.info(`Scheduled operation deleted: ID ${id}`);
    return { message: 'Scheduled operation deleted successfully', schedule: result.rows[0] };
  } catch (err) {
    logger.error(`Error in deleteScheduledOperation (ID: ${id}):`, { errorMessage: err.message });
    throw err;
  }
}

module.exports = {
  createScheduledOperation,
  getScheduledOperations,
  getScheduledOperationById,
  updateScheduledOperation,
  deleteScheduledOperation,
};
