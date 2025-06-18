const pool = require('../config/db');
const logger = require('../config/logger');
const cronParser = require('cron-parser');

// Helper function to calculate next_execution_at
function calculateNextExecutionTime(scheduleData, isEnabled = true, forRuleName = 'schedule') {
  let nextExecutionAt = null;
  if (!isEnabled) {
    return null; // Disabled schedules have no next execution time
  }

  // Prefer execute_at if it's a valid future date, as it's more explicit for a one-time run or first run of a cron.
  if (scheduleData.execute_at) {
    const executeAtDate = new Date(scheduleData.execute_at);
    if (!isNaN(executeAtDate) && executeAtDate > new Date()) {
      nextExecutionAt = executeAtDate;
      logger.debug(`Scheduler(${forRuleName}): Using execute_at for next_execution_at: ${nextExecutionAt}`);
    } else {
      logger.warn(`Scheduler(${forRuleName}): Invalid or past execute_at date: ${scheduleData.execute_at}. It will be ignored for next_execution_at calculation unless it's the only timing mechanism.`);
      if (!scheduleData.cron_expression) { // If only execute_at was provided and it's bad
          return null; // Cannot determine a valid future time
      }
    }
  }

  // If cron_expression is present, calculate next time from it.
  // If execute_at was also present and valid, cron will take over after that initial execute_at time.
  // If execute_at was in the past, cron should calculate from now.
  if (scheduleData.cron_expression) {
    try {
      // Determine base date for cron calculation:
      // If nextExecutionAt is already set by a valid future execute_at, calculate cron from that point.
      // Otherwise, calculate from now.
      const cronStartDate = (nextExecutionAt && nextExecutionAt > new Date()) ? nextExecutionAt : new Date();
      const options = { currentDate: cronStartDate, tz: 'Etc/UTC' }; // Ensure timezone consistency
      const interval = cronParser.parseExpression(scheduleData.cron_expression, options);

      // If execute_at was used and is the *exact* next cron time, interval.next() would give the one *after*.
      // So, if nextExecutionAt (from execute_at) is valid and matches cron's current/next, use it.
      // Otherwise, get the next one from cron. This logic can get complex if execute_at is meant to override the cron's schedule temporarily.
      // For simplicity: if execute_at is valid and in future, it's the next_execution_at.
      // If cron is also present, subsequent runs will be based on cron.
      // If execute_at is NOT valid/future, OR if it is valid but the user *only* wants cron logic for the *first* run:
      if (!nextExecutionAt) { // Only calculate from cron if execute_at didn't yield a valid future time
        nextExecutionAt = interval.next().toDate();
        logger.debug(`Scheduler(${forRuleName}): Calculated next_execution_at from cron: ${nextExecutionAt}`);
      } else {
         logger.debug(`Scheduler(${forRuleName}): execute_at is set to ${nextExecutionAt}, cron ('${scheduleData.cron_expression}') will determine subsequent runs.`);
      }
    } catch (err) {
      logger.error(`Scheduler(${forRuleName}): Invalid cron expression '${scheduleData.cron_expression}': ${err.message}.`);
      // If cron is invalid and there was no valid future execute_at, no next execution can be determined.
      if (!nextExecutionAt) return null;
      // If execute_at was valid, we might proceed with that, but log cron error.
      // For now, if cron is bad, and execute_at was also bad/past, this schedule won't run.
    }
  }

  // Final check: ensure the calculated time is in the future if any time was derived.
  if (nextExecutionAt && nextExecutionAt <= new Date()) {
      logger.warn(`Scheduler(${forRuleName}): Calculated next_execution_at ${nextExecutionAt} is in the past. This schedule may not run as expected unless cron string is for very frequent tasks. Check schedule timing and server time.`);
      // Depending on strictness, could return null here if it's not a cron job that would immediately re-calculate.
      // If it IS a cron job, this past date might be okay if the cron interval is very short and it's about to tick over.
      // For safety with one-time execute_at, if it's past, it means it was missed.
      if (!scheduleData.cron_expression) return null;
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


  const next_execution_at = calculateNextExecutionTime(scheduleData, is_enabled, `create ${scheduleData.name || 'new_schedule'}`);

  if (is_enabled && !next_execution_at && (cron_expression || execute_at)) {
      const error = new Error('Failed to calculate a valid future execution time for the enabled schedule. Please check cron_expression or execute_at.');
      error.status = 400;
      logger.warn(error.message, { scheduleData });
      throw error;
  }

  // Conflict Detection
  if (is_enabled && next_execution_at) {
    try {
      const conflictCheckQuery = `
        SELECT id FROM scheduled_operations
        WHERE device_id = $1
          AND is_enabled = TRUE
          AND next_execution_at = $2;
      `;
      const conflictResult = await pool.query(conflictCheckQuery, [device_id, next_execution_at]);
      if (conflictResult.rows.length > 0) {
        const conflictError = new Error(`A conflicting schedule (ID: ${conflictResult.rows[0].id}) already exists for this device at the exact same execution time (${next_execution_at.toISOString()}).`);
        conflictError.status = 409; // Conflict
        logger.warn(conflictError.message, { device_id, next_execution_at });
        throw conflictError;
      }
    } catch (conflictDbError) {
      // If the conflict check itself errors, pass it up, but log it as a server-side issue potentially
      logger.error('Error during schedule conflict check:', { errorMessage: conflictDbError.message, device_id, next_execution_at });
      throw conflictDbError; // Or a generic error
    }
  }

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

  // Fetch current schedule to get existing values for comparison and merging
  const currentSchedule = await getScheduledOperationById(id);

  // Construct the state of the schedule as it would be after the update
  const updatedScheduleState = {
    device_id: device_id !== undefined ? device_id : currentSchedule.device_id,
    action_name: action_name !== undefined ? action_name : currentSchedule.action_name,
    action_params: action_params !== undefined ? (action_params || {}) : currentSchedule.action_params,
    cron_expression: cron_expression !== undefined ? (cron_expression || null) : currentSchedule.cron_expression,
    execute_at: execute_at !== undefined ? (execute_at ? new Date(execute_at) : null) : currentSchedule.execute_at,
    is_enabled: is_enabled !== undefined ? is_enabled : currentSchedule.is_enabled,
    description: description !== undefined ? (description || null) : currentSchedule.description,
  };

  if (device_id !== undefined) { fields.push(`device_id = $${paramCount++}`); values.push(updatedScheduleState.device_id); }
  if (action_name !== undefined) { fields.push(`action_name = $${paramCount++}`); values.push(updatedScheduleState.action_name); }
  if (action_params !== undefined) { fields.push(`action_params = $${paramCount++}`); values.push(updatedScheduleState.action_params); }
  if (cron_expression !== undefined) { fields.push(`cron_expression = $${paramCount++}`); values.push(updatedScheduleState.cron_expression); }
  if (execute_at !== undefined) { fields.push(`execute_at = $${paramCount++}`); values.push(updatedScheduleState.execute_at); }
  if (is_enabled !== undefined) { fields.push(`is_enabled = $${paramCount++}`); values.push(updatedScheduleState.is_enabled); }
  if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(updatedScheduleState.description); }

  // Recalculate next_execution_at based on the potentially updated fields
  // This needs to happen regardless of whether timing fields were *explicitly* in updateData,
  // because is_enabled change alone requires recalculation.
  const potentialNextExecutionAt = calculateNextExecutionTime(updatedScheduleState, updatedScheduleState.is_enabled, `update ${id}`);

  // Always update next_execution_at field if it changed or if is_enabled changed.
  // If calculateNextExecutionTime returns null, it means it should be null (e.g. disabled, or invalid time)
  // We should compare with the current next_execution_at on the object if it exists
  const currentNextExecutionAt = currentSchedule.next_execution_at ? new Date(currentSchedule.next_execution_at) : null;
  if ((potentialNextExecutionAt ? potentialNextExecutionAt.toISOString() : null) !== (currentNextExecutionAt ? currentNextExecutionAt.toISOString() : null) ||
      (is_enabled !== undefined && is_enabled !== currentSchedule.is_enabled)) {
      fields.push(`next_execution_at = $${paramCount++}`);
      values.push(potentialNextExecutionAt);
  }


  if (fields.length === 0) { // No actual changes being made
    const error = new Error('No fields provided for update.');
    error.status = 400; throw error;
  }

  values.push(id);
  const query = `UPDATE scheduled_operations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *;`;

  // Conflict Detection for Update
  if (updatedScheduleState.is_enabled && potentialNextExecutionAt) {
    try {
      const conflictCheckQuery = `
        SELECT id FROM scheduled_operations
        WHERE device_id = $1
          AND is_enabled = TRUE
          AND next_execution_at = $2
          AND id != $3;
      `;
      const conflictResult = await pool.query(conflictCheckQuery, [updatedScheduleState.device_id, potentialNextExecutionAt, id]);
      if (conflictResult.rows.length > 0) {
        const conflictError = new Error(`Updating this schedule would cause a conflict with schedule ID ${conflictResult.rows[0].id} for device ID ${updatedScheduleState.device_id} at the same execution time (${potentialNextExecutionAt.toISOString()}).`);
        conflictError.status = 409; // Conflict
        logger.warn(conflictError.message);
        throw conflictError;
      }
    } catch (conflictDbError) {
      if (conflictDbError.status === 409) throw conflictDbError; // Re-throw specific conflict error
      logger.error('Error during schedule conflict check on update:', { errorMessage: conflictDbError.message, device_id: updatedScheduleState.device_id, potentialNextExecutionAt });
      throw conflictDbError; // Or a generic error
    }
  }


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
