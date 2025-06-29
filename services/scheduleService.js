const pool = require('../config/db');
const logger = require('../config/logger');
const cronParser = require('cron-parser');

const MAX_CRON_OCCURRENCES_TO_CHECK = parseInt(process.env.SCHEDULE_CONFLICT_CRON_CHECKS, 10) || 5;
const CONFLICT_CHECK_WINDOW_HOURS = parseInt(process.env.SCHEDULE_CONFLICT_WINDOW_HOURS, 10) || 48; // Not used in this iteration, but kept for future.

// Helper function to calculate the single next execution time
function calculateNextExecutionTime(scheduleData, isEnabled = true, forRuleName = 'schedule') {
  let nextExecutionAt = null;
  if (!isEnabled) {
    return null;
  }
  if (scheduleData.execute_at) {
    const executeAtDate = new Date(scheduleData.execute_at);
    if (!isNaN(executeAtDate) && executeAtDate > new Date()) {
      nextExecutionAt = executeAtDate;
      logger.debug(`Scheduler(${forRuleName}): Using execute_at for next_execution_at: ${nextExecutionAt}`);
    } else {
      logger.warn(`Scheduler(${forRuleName}): Invalid or past execute_at date: ${scheduleData.execute_at}.`);
      if (!scheduleData.cron_expression) return null;
    }
  }
  if (scheduleData.cron_expression) {
    try {
      const cronStartDate = (nextExecutionAt && nextExecutionAt > new Date()) ? nextExecutionAt : new Date();
      const options = { currentDate: cronStartDate, tz: 'Etc/UTC' };
      const interval = cronParser.parseExpression(scheduleData.cron_expression, options);
      if (!nextExecutionAt) { // Only calculate from cron if execute_at didn't yield a valid future time
          nextExecutionAt = interval.next().toDate();
          logger.debug(`Scheduler(${forRuleName}): Calculated next_execution_at from cron: ${nextExecutionAt}`);
      } else {
          logger.debug(`Scheduler(${forRuleName}): execute_at is set to ${nextExecutionAt}, cron ('${scheduleData.cron_expression}') will determine subsequent runs based on this first execution.`);
      }
    } catch (err) {
      logger.error(`Scheduler(${forRuleName}): Invalid cron expression '${scheduleData.cron_expression}': ${err.message}.`);
      if (!nextExecutionAt) return null;
    }
  }
  if (nextExecutionAt && nextExecutionAt <= new Date()) {
      if (!scheduleData.cron_expression) return null; // Past one-time tasks are invalid for next_execution_at
      // For cron, if calculated time is past, try to get next from now to avoid re-processing stuck task
      try {
        const options = { currentDate: new Date(), tz: 'Etc/UTC' };
        const interval = cronParser.parseExpression(scheduleData.cron_expression, options);
        nextExecutionAt = interval.next().toDate();
        logger.warn(`Scheduler(${forRuleName}): Original next_execution_at ${scheduleData.execute_at || 'from cron'} was past. Recalculated from now for cron: ${nextExecutionAt}`);
      } catch(e){ /* ignore if cron is bad, already logged */ }
  }
  return nextExecutionAt;
}

// New helper to calculate multiple future occurrences for conflict detection
async function _calculateFutureOccurrences(schedule, fromDate = new Date(), limit = MAX_CRON_OCCURRENCES_TO_CHECK) {
  const occurrences = [];
  // Check is_enabled only if it's explicitly part of the schedule object passed (i.e., for existing schedules)
  // For new/updated schedule data being checked, we assume it *would be* enabled.
  if (schedule.is_enabled === false) {
     return occurrences;
  }

  if (schedule.cron_expression) {
    try {
      const options = {
          currentDate: fromDate,
          iterator: true,
          utc: true
      };
      const interval = cronParser.parseExpression(schedule.cron_expression, options);
      for (let i = 0; i < limit; i++) {
        if (!interval.hasNext()) break;
        const nextDate = interval.next().toDate();
        occurrences.push(nextDate);
      }
    } catch (err) {
      logger.error(`Scheduler (ConflictCheck): Invalid cron expression for schedule ID ${schedule.id || 'NEW'} ('${schedule.cron_expression}'): ${err.message}.`);
    }
  } else if (schedule.execute_at) {
    const executeAtDate = new Date(schedule.execute_at);
    if (executeAtDate > fromDate) {
      occurrences.push(executeAtDate);
    }
  }
  return occurrences.map(d => d.getTime()); // Return as epoch milliseconds
}

// New conflict detection function
async function hasConflicts(scheduleData, existingScheduleId = null) {
  // scheduleData contains the final intended state: device_id, cron_expression, execute_at, is_enabled
  if (scheduleData.is_enabled === false) {
    return false; // A disabled schedule cannot conflict
  }

  const scheduleDataForCalc = { // Data for _calculateFutureOccurrences
     id: existingScheduleId || 'NEW_OR_UPDATED',
     is_enabled: true, // We are checking for conflicts assuming this schedule *will* run
     cron_expression: scheduleData.cron_expression,
     execute_at: scheduleData.execute_at
  };
  const newScheduleTimes = await _calculateFutureOccurrences(scheduleDataForCalc);

  if (newScheduleTimes.length === 0) {
    logger.debug(`Scheduler (ConflictCheck): No future occurrences for schedule device_id: ${scheduleData.device_id}, so no conflicts.`);
    return false;
  }

  let query = "SELECT id, cron_expression, execute_at, is_enabled FROM scheduled_operations WHERE device_id = $1 AND is_enabled = TRUE";
  const values = [scheduleData.device_id];
  if (existingScheduleId !== null) {
    query += " AND id != $2";
    values.push(existingScheduleId);
  }

  try {
    const { rows: existingSchedules } = await pool.query(query, values);
    if (existingSchedules.length === 0) {
      logger.debug(`Scheduler (ConflictCheck): No other enabled schedules for device ${scheduleData.device_id}. No conflicts.`);
      return false;
    }

    for (const existingSchedule of existingSchedules) {
      const existingScheduleTimes = await _calculateFutureOccurrences(existingSchedule); // is_enabled is from DB
      for (const newTime of newScheduleTimes) {
        if (existingScheduleTimes.includes(newTime)) {
          logger.warn(`Schedule conflict detected: New/updated schedule for device ${scheduleData.device_id} (time: ${new Date(newTime).toISOString()}) conflicts with existing schedule ID ${existingSchedule.id}.`);
          return true;
        }
      }
    }
  } catch (dbError) {
    logger.error('Error querying for conflicting schedules:', dbError);
    throw new Error(`Database error while checking for schedule conflicts: ${dbError.message}`);
  }
  logger.debug(`Scheduler (ConflictCheck): No time conflicts found for schedule device_id: ${scheduleData.device_id}.`);
  return false;
}


async function createScheduledOperation(scheduleData) {
  const { device_id, action_name, cron_expression, execute_at, description } = scheduleData;
  const is_enabled = scheduleData.is_enabled === undefined ? true : scheduleData.is_enabled; // Default to true

  if (!device_id || !action_name || (!cron_expression && !execute_at)) {
    const error = new Error('deviceId, actionName, and either cronExpression or executeAt are required.');
    error.status = 400; logger.warn('Create scheduled op failed: missing fields.', scheduleData); throw error;
  }

  const calculatedNextExecutionAt = calculateNextExecutionTime({ execute_at, cron_expression }, is_enabled, `create ${scheduleData.name || 'new'}`);

  if (is_enabled && !calculatedNextExecutionAt && (cron_expression || execute_at)) {
      const error = new Error('Enabled schedule must have a valid future execution time (check cron_expression or execute_at).');
      error.status = 400; logger.warn(error.message, { scheduleData }); throw error;
  }

  // Perform conflict check before insertion
  const scheduleDataForConflictCheck = { ...scheduleData, is_enabled }; // Ensure is_enabled is part of checked data
  if (await hasConflicts(scheduleDataForConflictCheck, null)) {
    const conflictError = new Error('Schedule conflict detected: Another enabled schedule exists for this device at one of the calculated execution times.');
    conflictError.status = 409; throw conflictError;
  }

  try {
    const query = `
      INSERT INTO scheduled_operations (device_id, action_name, action_params, cron_expression, execute_at, is_enabled, description, next_execution_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`;
    const values = [
      device_id, action_name, scheduleData.action_params || {}, cron_expression || null,
      execute_at ? new Date(execute_at) : null, is_enabled, description || null, calculatedNextExecutionAt
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

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT * FROM scheduled_operations ${whereClause}
    ORDER BY next_execution_at ASC NULLS LAST, created_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++};`;
  const queryValues = [...values, parseInt(limit, 10), offset];
  const countQuery = `SELECT COUNT(*) FROM scheduled_operations ${whereClause};`;
  const countValues = [...values];

  try {
    const result = await pool.query(query, queryValues);
    const totalCountResult = await pool.query(countQuery, countValues);
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);
    return {
      data: result.rows,
      meta: { page: parseInt(page, 10), limit: parseInt(limit, 10), totalRecords, totalPages: Math.ceil(totalRecords / parseInt(limit, 10)) },
    };
  } catch (err) {
    logger.error('Error in getScheduledOperations:', { errorMessage: err.message, queryParams });
    throw err;
  }
}

async function getScheduledOperationById(id) {
  const deviceIdInt = parseInt(id, 10); // Corrected variable name
  if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid schedule ID format.'); error.status = 400; throw error;
  }
  try {
    const result = await pool.query('SELECT * FROM scheduled_operations WHERE id = $1', [deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error('Scheduled operation not found.'); error.status = 404; throw error;
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in getScheduledOperationById (ID: ${id}):`, { errorMessage: err.message });
    throw err;
  }
}

async function updateScheduledOperation(id, updateData) {
  const scheduleIdInt = parseInt(id, 10);
  if (isNaN(scheduleIdInt)) {
    const error = new Error('Invalid schedule ID format.'); error.status = 400; throw error;
  }

  const currentSchedule = await getScheduledOperationById(scheduleIdInt);

  const updatedScheduleState = {
    device_id: updateData.device_id !== undefined ? updateData.device_id : currentSchedule.device_id,
    action_name: updateData.action_name !== undefined ? updateData.action_name : currentSchedule.action_name,
    action_params: updateData.action_params !== undefined ? (updateData.action_params || {}) : currentSchedule.action_params,
    cron_expression: updateData.cron_expression !== undefined ? (updateData.cron_expression || null) : currentSchedule.cron_expression,
    execute_at: updateData.execute_at !== undefined ? (updateData.execute_at ? new Date(updateData.execute_at) : null) : currentSchedule.execute_at,
    is_enabled: updateData.is_enabled !== undefined ? updateData.is_enabled : currentSchedule.is_enabled,
    description: updateData.description !== undefined ? (updateData.description || null) : currentSchedule.description,
  };

  const potentialNextExecutionAt = calculateNextExecutionTime(updatedScheduleState, updatedScheduleState.is_enabled, `update ${id}`);

  if (updatedScheduleState.is_enabled && !potentialNextExecutionAt && (updatedScheduleState.cron_expression || updatedScheduleState.execute_at)) {
    const error = new Error('Enabled schedule must have a valid future execution time (check cron_expression or execute_at).');
    error.status = 400; logger.warn(error.message, { id, updateData }); throw error;
  }

  // Conflict Detection for Update
  if (await hasConflicts(updatedScheduleState, scheduleIdInt)) {
      const conflictError = new Error('Updating this schedule would cause a conflict with another enabled schedule for this device at one of the calculated execution times.');
      conflictError.status = 409; throw conflictError;
  }

  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.keys(updateData).forEach(key => {
    if (['device_id', 'action_name', 'action_params', 'cron_expression', 'execute_at', 'is_enabled', 'description'].includes(key)) {
      fields.push(`${key} = $${paramCount++}`);
      values.push(key === 'execute_at' ? (updateData[key] ? new Date(updateData[key]) : null) : updateData[key]);
    }
  });

  // Always include next_execution_at in update if relevant fields changed or is_enabled changed.
  const currentDbNextExecutionAt = currentSchedule.next_execution_at ? new Date(currentSchedule.next_execution_at) : null;
  if ((potentialNextExecutionAt ? potentialNextExecutionAt.toISOString() : null) !== (currentDbNextExecutionAt ? currentDbNextExecutionAt.toISOString() : null) ||
      (updateData.is_enabled !== undefined && updateData.is_enabled !== currentSchedule.is_enabled)) {
    fields.push(`next_execution_at = $${paramCount++}`);
    values.push(potentialNextExecutionAt);
  }


  if (fields.length === 0) {
    const error = new Error('No valid fields provided for update.'); error.status = 400; throw error;
  }

  values.push(scheduleIdInt);
  const query = `UPDATE scheduled_operations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *;`;

  try {
    const result = await pool.query(query, values);
    logger.info(`Scheduled operation updated: ID ${id}`);
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in updateScheduledOperation (ID: ${id}):`, { errorMessage: err.message, updateData });
    throw err;
  }
}

async function deleteScheduledOperation(id) {
   const deviceIdInt = parseInt(id, 10); // Corrected variable name
   if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid schedule ID format.'); error.status = 400; throw error;
  }
  try {
    const result = await pool.query('DELETE FROM scheduled_operations WHERE id = $1 RETURNING *;', [deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error('Scheduled operation not found for deletion.'); error.status = 404; throw error;
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
  // Note: initSchedulerEngineService was from another service, not this one.
};
