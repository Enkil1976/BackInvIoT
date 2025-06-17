const cron = require('node-cron');
const cronParser = require('cron-parser'); // Now used for next_execution_at calculation
const pool = require('../config/db');
const logger = require('../config/logger');
const { app } = require('../server'); // For WebSocket broadcasts
// const deviceService = require('./deviceService'); // No longer directly called for action execution by scheduler
const operationService = require('./operationService'); // For logging execution by scheduler or by worker
const { publishCriticalAction } = require('./queueService'); // For publishing actions

let scheduledJob;

async function checkAndExecuteDueTasks() {
  logger.info('Scheduler: Checking for due scheduled operations...');
  let dueSchedules = [];
  try {
    const result = await pool.query(
      "SELECT * FROM scheduled_operations WHERE is_enabled = TRUE AND next_execution_at <= NOW() ORDER BY next_execution_at ASC"
    );
    dueSchedules = result.rows;
  } catch (dbError) {
    logger.error('Scheduler: Error fetching due schedules:', dbError);
    return; // Exit if we can't fetch tasks
  }

  if (dueSchedules.length === 0) {
    logger.info('Scheduler: No due tasks found.');
    return;
  }

  logger.info(`Scheduler: Found ${dueSchedules.length} due task(s). Processing...`);

  for (const schedule of dueSchedules) {
    logger.info(`Scheduler: Processing schedule ID ${schedule.id} for device ID ${schedule.device_id}, action: ${schedule.action_name}`);
    let executionStatus = 'SUCCESS';
    let executionDetails = { message: 'Action executed successfully.' };
    // let errorOccurred = null; // Not explicitly used, but good for context if needed later

    // Use a transaction per task to ensure atomicity of action and schedule update
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let errorOccurredObject = null; // To store actual Error object if one occurs

      // --- Action Queuing Logic ---
      if (schedule.action_name === 'set_status' && schedule.action_params && schedule.action_params.status !== undefined) {
        let targetDeviceHardwareId = null;
        try {
          const deviceResult = await client.query("SELECT device_id FROM devices WHERE id = $1", [schedule.device_id]);
          if (deviceResult.rows.length > 0 && deviceResult.rows[0].device_id) {
            targetDeviceHardwareId = deviceResult.rows[0].device_id;
          } else {
            throw new Error(`Device with database ID ${schedule.device_id} not found or has no hardware_id, cannot queue action.`);
          }

          const actionToQueue = {
            type: 'device_action', // Standardized type for queued device actions
            targetService: 'deviceService',
            targetMethod: 'updateDeviceStatus',
            payload: {
              deviceId: targetDeviceHardwareId, // Hardware ID for the worker
              status: schedule.action_params.status
            },
            origin: { // Information about where this action originated
              service: 'SchedulerEngineService',
              scheduleId: schedule.id,
              scheduleName: schedule.name // Assuming 'name' is a field on schedule
            }
          };
          const messageId = await publishCriticalAction(actionToQueue, 'SchedulerEngineService');

          if (messageId) {
            logger.info(`Scheduler: Action for schedule ID ${schedule.id} (Device HW_ID: ${targetDeviceHardwareId}) published to queue. Message ID: ${messageId}`);
            executionStatus = 'SUCCESS'; // Queuing success
            executionDetails = { message: `Action queued successfully. Msg ID: ${messageId}`, queuedAction: actionToQueue };
          } else {
            executionStatus = 'FAILURE';
            errorOccurredObject = new Error(`Failed to publish action to queue for schedule ID ${schedule.id}.`);
            logger.error(errorOccurredObject.message, { actionToQueue });
            executionDetails = { error: errorOccurredObject.message, actionAttempted: actionToQueue };
          }
        } catch (fetchOrQueueError) {
          executionStatus = 'FAILURE';
          errorOccurredObject = fetchOrQueueError;
          logger.error(`Scheduler: Error during hardware ID fetch or queuing for 'set_status' on schedule ID ${schedule.id}: ${errorOccurredObject.message}`);
          executionDetails = { error: `Failed to prepare or queue 'set_status' action: ${errorOccurredObject.message}` };
        }
      } else if (schedule.action_name === 'apply_device_config') {
        if (!schedule.action_params || typeof schedule.action_params.config !== 'object' || schedule.action_params.config === null) {
            executionStatus = 'FAILURE';
            errorOccurredObject = new Error(`Invalid or missing 'config' object in action_params for apply_device_config, schedule ID ${schedule.id}.`);
            logger.warn(errorOccurredObject.message, { params: schedule.action_params }); // Changed from error to warn for config issues if action is not critical path
            executionDetails = { error: errorOccurredObject.message, params: schedule.action_params };
        } else {
            let targetDeviceHardwareId = null;
            try {
                const deviceResult = await client.query("SELECT device_id FROM devices WHERE id = $1", [schedule.device_id]);
                if (deviceResult.rows.length > 0 && deviceResult.rows[0].device_id) {
                    targetDeviceHardwareId = deviceResult.rows[0].device_id;
                } else {
                    throw new Error(`Device with database ID ${schedule.device_id} not found or has no hardware_id, cannot queue apply_device_config action.`);
                }

                const actionToQueue = {
                    type: 'device_config_action',
                    targetService: 'deviceService',
                    targetMethod: 'setDeviceConfiguration',
                    payload: {
                        deviceId: targetDeviceHardwareId, // Hardware ID
                        config: schedule.action_params.config
                    },
                    origin: {
                        service: 'SchedulerEngineService',
                        scheduleId: schedule.id,
                        scheduleName: schedule.name
                    }
                };
                const messageId = await publishCriticalAction(actionToQueue, 'SchedulerEngineService');
                if (messageId) {
                    logger.info(`Scheduler: Action 'apply_device_config' for schedule ID ${schedule.id} (Device HW_ID: ${targetDeviceHardwareId}) published to queue. Message ID: ${messageId}`);
                    executionStatus = 'SUCCESS';
                    executionDetails = { message: `Action 'apply_device_config' queued successfully. Msg ID: ${messageId}`, queuedAction: actionToQueue };
                } else {
                    executionStatus = 'FAILURE';
                    errorOccurredObject = new Error(`Failed to publish 'apply_device_config' action to queue for schedule ID ${schedule.id}.`);
                    logger.error(errorOccurredObject.message, { actionToQueue });
                    executionDetails = { error: errorOccurredObject.message, actionAttempted: actionToQueue };
                }
            } catch (fetchOrQueueError) {
                executionStatus = 'FAILURE';
                errorOccurredObject = fetchOrQueueError;
                logger.error(`Scheduler: Error during 'apply_device_config' preparation or queuing for schedule ID ${schedule.id}: ${errorOccurredObject.message}`);
                executionDetails = { error: `Failed to prepare or queue 'apply_device_config': ${errorOccurredObject.message}` };
            }
        }
      } else if (schedule.action_name === 'log_generic_event' && schedule.action_params) {
        const { log_message, log_level = 'INFO', details: log_details } = schedule.action_params;
        if (!log_message) {
          executionStatus = 'FAILURE';
          errorOccurredObject = new Error(`Missing 'log_message' in action_params for 'log_generic_event' on schedule ID ${schedule.id}.`);
          logger.warn(errorOccurredObject.message, { params: schedule.action_params });
          executionDetails = { error: errorOccurredObject.message, params: schedule.action_params };
        } else {
          const actionToQueue = {
            type: 'log_action', // Or more specific if needed
            targetService: 'operationService',
            targetMethod: 'recordOperation',
            payload: {
              serviceName: 'SchedulerEngineService', // Or allow override from params
              action: 'scheduled_log_event', // Distinguish from direct rule logs
              status: log_level.toUpperCase(), // Ensure status is uppercase if operationService expects it
              details: {
                message: log_message,
                originalScheduleId: schedule.id,
                originalScheduleName: schedule.name,
                ...(log_details || {})
              },
              // userId, deviceId could also be part of params if relevant for the log
            },
            origin: {
              service: 'SchedulerEngineService',
              scheduleId: schedule.id,
              scheduleName: schedule.name
            }
          };
          const messageId = await publishCriticalAction(actionToQueue, 'SchedulerEngineService');
          if (messageId) {
            logger.info(`Scheduler: 'log_generic_event' action for schedule ID ${schedule.id} published to queue. Message ID: ${messageId}`);
            executionStatus = 'SUCCESS';
            executionDetails = { message: `Log action queued successfully. Msg ID: ${messageId}`, queuedAction: actionToQueue };
          } else {
            executionStatus = 'FAILURE';
            errorOccurredObject = new Error(`Failed to publish 'log_generic_event' action to queue for schedule ID ${schedule.id}.`);
            logger.error(errorOccurredObject.message, { actionToQueue });
            executionDetails = { error: errorOccurredObject.message, actionAttempted: actionToQueue };
          }
        }
      } else {
        executionStatus = 'FAILURE';
        errorOccurredObject = new Error(`Action '${schedule.action_name}' not supported for queuing by scheduler, or params missing for schedule ID ${schedule.id}.`);
        logger.warn(errorOccurredObject.message, { action_name: schedule.action_name, params: schedule.action_params });
        executionDetails = { error: errorOccurredObject.message, action_name: schedule.action_name, params: schedule.action_params };
      }
      // --- End of Action Queuing Logic ---

      // **Log Operation (reflects queuing attempt, within transaction)**
      await operationService.recordOperation({
        serviceName: 'SchedulerEngineService',
        action: executionStatus === 'SUCCESS' ? 'schedule_action_queued' : 'schedule_action_queue_failed',
        targetEntityType: 'scheduled_operation',
        targetEntityId: schedule.id.toString(),
        deviceId: schedule.device_id, // DB ID of device related to schedule
        userId: null,
        status: executionStatus,
        details: {
            scheduleName: schedule.name,
            actionName: schedule.action_name,
            actionParams: schedule.action_params,
            queuing_result: executionDetails,
            ...(errorOccurredObject && { errorDetails: { message: errorOccurredObject.message }})
        }
      });

      // **Update Schedule (scheduling aspects, within transaction)**
      let newNextExecutionAt = null;
      // Determine if the task was a one-time task (no cron) or if it should be disabled due to error/completion
      let shouldDisable = !schedule.cron_expression;

      if (schedule.cron_expression) {
        try {
          // Using 'currentDate' option to ensure the next date is after the current execution.
          // Using schedule.last_executed_at (which would be NOW() effectively) or new Date() are both viable.
          // Let's use new Date() to ensure it's strictly "after now".
          const options = { currentDate: new Date() };
          const interval = cronParser.parseExpression(schedule.cron_expression, options);
          newNextExecutionAt = interval.next().toDate();
          shouldDisable = false; // Cron jobs re-schedule by default
          logger.info(`Scheduler: Calculated next execution for cron job ID ${schedule.id}: ${newNextExecutionAt}`);
        } catch (parseError) {
          logger.error(`Scheduler: Invalid cron expression for schedule ID ${schedule.id} ('${schedule.cron_expression}'): ${parseError.message}. Disabling schedule.`);
          newNextExecutionAt = null;
          shouldDisable = true; // Disable problematic cron schedule

          // Log this specific failure to operations log if the main action didn't already fail
          if (executionStatus !== 'FAILURE') {
            try {
              await operationService.recordOperation({
                  serviceName: 'SchedulerEngineService',
                  action: 'schedule_cron_parse_error',
                  targetEntityType: 'scheduled_operation',
                  targetEntityId: schedule.id.toString(),
                  status: 'FAILURE',
                  details: {
                      scheduleName: schedule.name,
                      cronExpression: schedule.cron_expression,
                      error: parseError.message
                  }
              });
            } catch (opLogError) {
              logger.error(`Scheduler: CRITICAL - Failed to log cron parse error for schedule ID ${schedule.id}:`, opLogError);
            }
          }
        }
      }
      // If it was a one-time task (schedule.execute_at set, no cron_expression),
      // shouldDisable is already true, and newNextExecutionAt remains null.

      // Final check: if executionStatus is FAILURE for a cron job, do we still reschedule?
      // Current logic: Yes, it reschedules. Could be changed to: if (executionStatus === 'FAILURE' && schedule.cron_expression) shouldDisable = true;
      // For now, keeping as is: failed cron actions will still reschedule.

      await client.query(
        "UPDATE scheduled_operations SET last_executed_at = NOW(), next_execution_at = $1, is_enabled = CASE WHEN $2 THEN FALSE ELSE is_enabled END WHERE id = $3",
        [newNextExecutionAt, shouldDisable, schedule.id]
      );

      await client.query('COMMIT');
      logger.info(`Scheduler: Successfully processed and updated schedule ID ${schedule.id} (next_execution_at: ${newNextExecutionAt}, shouldDisable: ${shouldDisable}).`);

    } catch (actionOrTransactionError) {
      await client.query('ROLLBACK');
      executionStatus = 'FAILURE'; // Ensure status is failure if anything in try block failed
      logger.error(`Scheduler: Transaction rolled back for schedule ID ${schedule.id} due to error:`, actionOrTransactionError);
      executionDetails = { error: actionOrTransactionError.message, stack: actionOrTransactionError.stack };
      // errorOccurred = actionOrTransactionError;

      // Attempt to log the failure if the main transaction failed
      try {
        await operationService.recordOperation({
          serviceName: 'SchedulerEngineService',
          action: 'schedule_execution_critical_failure', // Different action for logging tx failure
          targetEntityType: 'scheduled_operation',
          targetEntityId: schedule.id.toString(),
          deviceId: schedule.device_id,
          status: 'FAILURE',
          details: {
            scheduleName: schedule.name,
            actionName: schedule.action_name,
            actionParams: schedule.action_params,
            criticalError: `Transaction failed: ${actionOrTransactionError.message}`
          }
        });
      } catch (criticalLogError) {
        logger.error(`Scheduler: CRITICAL - Failed to record operation log for TX failure of schedule ID ${schedule.id}:`, criticalLogError);
      }
    } finally {
      client.release();
    }

    // **WebSocket Broadcast (outside transaction, based on final status)**
    if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
        try {
            app.locals.broadcastWebSocket({
                type: executionStatus === 'SUCCESS' ? 'schedule_executed' : 'schedule_execution_failed',
                data: {
                    schedule_id: schedule.id,
                    device_id: schedule.device_id,
                    action_name: schedule.action_name,
                    status: executionStatus, // Final status after try/catch
                    details: executionDetails, // Contains error if any
                    timestamp: new Date().toISOString()
                }
            });
        } catch (broadcastError) {
            logger.error(`Scheduler: Failed to broadcast WebSocket for schedule ID ${schedule.id}:`, broadcastError);
        }
    } else {
        logger.warn(`[WebSocket Broadcast Simulated/Skipped] Event: ${executionStatus === 'SUCCESS' ? 'schedule_executed' : 'schedule_execution_failed'} for schedule ID ${schedule.id}. broadcastWebSocket not available.`);
    }
  }
  logger.info('Scheduler: Finished processing all due tasks for this run.');
}

function startScheduler() {
  if (scheduledJob) {
    logger.warn('Scheduler job is already running.');
    return;
  }

  // Schedule to run every minute. '*/1 * * * *' is equivalent to '* * * * *'
  // Using UTC for consistency. Ensure server and DB timezones are also consistently handled (ideally UTC).
  scheduledJob = cron.schedule('*/1 * * * *', checkAndExecuteDueTasks, {
    scheduled: true, // Job is started immediately after creation
    timezone: "Etc/UTC"
  });

  logger.info('Scheduler engine started. Job scheduled to run every minute (UTC) to check for due tasks.');
}

function stopScheduler() {
  if (scheduledJob) {
    logger.info('Attempting to stop scheduler engine...');
    scheduledJob.stop(); // node-cron's stop method
    scheduledJob = null; // Clear the reference
    logger.info('Scheduler engine stopped.');
  } else {
    logger.info('Scheduler engine is not currently running.');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  // checkAndExecuteDueTasks, // Potentially export for manual triggering/testing
};
