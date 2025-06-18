const Redis = require('ioredis'); // For a dedicated blocking client
const pool = require('../config/db'); // For DB lookups (e.g., device ID)
const logger = require('../config/logger');
const deviceService = require('../services/deviceService');
const operationService = require('../services/operationService');
const notificationService = require('../services/notificationService'); // <-- Add this
// Add other services here if they can be targets of queued actions
// const scheduleService = require('../services/scheduleService');
// const rulesService = require('../services/rulesService');
const { CRITICAL_ACTIONS_STREAM_NAME } = require('../services/queueService');
const crypto = require('crypto');

const MAX_EXECUTION_RETRIES = parseInt(process.env.CRITICAL_WORKER_MAX_RETRIES, 10) || 3;
const RETRY_DELAY_MS = parseInt(process.env.CRITICAL_WORKER_RETRY_DELAY_MS, 10) || 1000; // 1 second
const DLQ_STREAM_NAME = process.env.CRITICAL_ACTIONS_DLQ_STREAM_NAME || 'critical_actions_dlq';
const MAX_DLQ_STREAM_LENGTH = parseInt(process.env.CRITICAL_ACTIONS_DLQ_MAXLEN, 10) || 1000; // Optional capping for DLQ

// Map of available services for the worker
const services = {
  deviceService,
  operationService,
  notificationService, // <-- Add this
  // scheduleService, // Add if actions can target scheduleService
  // rulesService,    // Add if actions can target rulesService
};

// Whitelist of allowed methods per service for security and clarity
const allowedServiceMethods = {
  deviceService: {
    updateDeviceStatus: services.deviceService.updateDeviceStatus,
    setDeviceConfiguration: services.deviceService.setDeviceConfiguration, // Added new method
  },
  operationService: {
    recordOperation: services.operationService.recordOperation,
  },
  notificationService: { // <-- Add this block
    sendNotification: services.notificationService.sendNotification,
  },
};

// It's better to use a new Redis client for blocking operations like XREADGROUP/XREAD
// Ensure Redis connection details are available (e.g., from process.env like in config/redis.js)
const workerRedisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USER,
  // Add retry strategy if needed, e.g.,
  retryStrategy: times => Math.min(times * 50, 2000), // Default ioredis strategy
  maxRetriesPerRequest: 3 // Only retry commands 3 times
});

workerRedisClient.on('error', (err) => logger.error(`CriticalActionWorker Redis Error: ${err.message}`));
workerRedisClient.on('connect', () => logger.info('✅ CriticalActionWorker Redis client connected'));


const CONSUMER_GROUP_NAME = process.env.CRITICAL_ACTIONS_CONSUMER_GROUP || 'critical_actions_group';
const CONSUMER_NAME = `consumer_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

let isShuttingDown = false;
let workerLoopPromise = null; // To keep track of the worker loop
let broadcaster = null; // Module-level variable to store the broadcast function

async function initializeConsumerGroup() {
  try {
    await workerRedisClient.xgroup('CREATE', CRITICAL_ACTIONS_STREAM_NAME, CONSUMER_GROUP_NAME, '$', 'MKSTREAM');
    logger.info(`CriticalActionWorker: Consumer group '${CONSUMER_GROUP_NAME}' created/ensured for stream '${CRITICAL_ACTIONS_STREAM_NAME}'.`);
  } catch (error) {
    if (error.message.includes('BUSYGROUP')) {
      logger.info(`CriticalActionWorker: Consumer group '${CONSUMER_GROUP_NAME}' already exists for stream '${CRITICAL_ACTIONS_STREAM_NAME}'.`);
    } else {
      logger.error(`CriticalActionWorker: Error creating/checking consumer group '${CONSUMER_GROUP_NAME}':`, error);
      throw error;
    }
  }
}

async function processMessage(messageId, messageData) {
  logger.info(`CriticalActionWorker: Processing message ID ${messageId}. Actor: ${messageData.actor || 'N/A'}`);
  const rawActionData = messageData.data;
  let action;

  if (!rawActionData) {
    logger.error(`CriticalActionWorker: Message ID ${messageId} has no 'data' field.`, { messageData });
    return false;
  }

  try {
    action = JSON.parse(rawActionData);
  } catch (parseError) {
    logger.error(`CriticalActionWorker: Failed to parse actionData for message ID ${messageId}:`, { rawActionData, error: parseError.message });
    return false;
  }

  logger.info(`CriticalActionWorker: Executing action for message ID ${messageId}: %j`, action);

  let success = false;
  let attempts = 0;
  let lastError = null;

  while (attempts < MAX_EXECUTION_RETRIES && !success) {
    attempts++;
    if (attempts > 1) {
      logger.info(`CriticalActionWorker: Retrying action for message ID ${messageId}, attempt ${attempts} of ${MAX_EXECUTION_RETRIES} after ${RETRY_DELAY_MS}ms delay...`, action);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }

    try {
      const targetServiceString = action.targetService;
      const targetMethodString = action.targetMethod;
      const payload = action.payload;

      if (!services[targetServiceString] || !allowedServiceMethods[targetServiceString] || !allowedServiceMethods[targetServiceString][targetMethodString]) {
          lastError = new Error(`Disallowed or unknown service/method: ${targetServiceString}.${targetMethodString}`);
          logger.error(`CriticalActionWorker: ${lastError.message} (Message ID: ${messageId})`);
          attempts = MAX_EXECUTION_RETRIES; // Do not retry this configuration error
          continue;
      }
      const serviceMethodToCall = allowedServiceMethods[targetServiceString][targetMethodString];
      let result;

      if (targetServiceString === 'deviceService' && targetMethodString === 'updateDeviceStatus') {
          if (!payload || payload.deviceId === undefined || payload.status === undefined) {
              lastError = new Error(`Invalid payload for ${targetServiceString}.${targetMethodString}: missing deviceId or status`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES; // Do not retry payload structure errors
              throw lastError;
          }
          const deviceResult = await pool.query("SELECT id FROM devices WHERE device_id = $1", [payload.deviceId]);
          if (deviceResult.rows.length === 0) {
              lastError = new Error(`Device with HW_ID ${payload.deviceId} not found for ${targetMethodString}`);
              logger.error(`CriticalActionWorker: ${lastError.message}.`);
              // This might be a temporary issue if device creation is slightly delayed, but often a permanent one.
              // Depending on desired behavior, could allow retries or not. For now, let's not retry "Not Found".
              attempts = MAX_EXECUTION_RETRIES;
              throw lastError;
          }
          const dbDeviceId = deviceResult.rows[0].id;
          result = await serviceMethodToCall(dbDeviceId, payload.status);
          logger.info(`CriticalActionWorker: Executed ${targetServiceString}.${targetMethodString} for HW_ID ${payload.deviceId} (DB ID: ${dbDeviceId}) to status ${payload.status} (Attempt ${attempts})`);

      } else if (targetServiceString === 'deviceService' && targetMethodString === 'setDeviceConfiguration') {
          if (!payload || payload.deviceId === undefined || payload.config === undefined) {
              lastError = new Error(`Invalid payload for ${targetServiceString}.${targetMethodString}: missing deviceId or config`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES; throw lastError;
          }
          if (typeof payload.config !== 'object' || payload.config === null) {
              lastError = new Error(`Invalid 'config' in payload for ${targetServiceString}.${targetMethodString}: must be an object.`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES; throw lastError;
          }
          const deviceResultConf = await pool.query("SELECT id FROM devices WHERE device_id = $1", [payload.deviceId]);
          if (deviceResultConf.rows.length === 0) {
              lastError = new Error(`Device with HW_ID ${payload.deviceId} not found for ${targetMethodString}`);
              logger.error(`CriticalActionWorker: ${lastError.message}.`);
              attempts = MAX_EXECUTION_RETRIES; throw lastError;
          }
          const dbDeviceIdConf = deviceResultConf.rows[0].id;
          result = await serviceMethodToCall(dbDeviceIdConf, payload.config);
          logger.info(`CriticalActionWorker: Executed ${targetServiceString}.${targetMethodString} for HW_ID ${payload.deviceId} (Attempt ${attempts}). Config: %j`, payload.config);

      } else if (targetServiceString === 'operationService' && targetMethodString === 'recordOperation') {
          if (!payload) {
              lastError = new Error(`Invalid payload for ${targetServiceString}.${targetMethodString}: missing payload`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES; throw lastError;
          }
          if (!payload.serviceName || !payload.action || !payload.status) {
              lastError = new Error(`Payload for ${targetServiceString}.${targetMethodString} missing required fields (serviceName, action, status).`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES; throw lastError;
          }
          result = await serviceMethodToCall(payload);
          logger.info(`CriticalActionWorker: Executed ${targetServiceString}.${targetMethodString} (Attempt ${attempts}). Origin: ${action.origin?.service}, Original Action in payload: ${payload.action}`);

      } else if (targetServiceString === 'notificationService' && targetMethodString === 'sendNotification') {
            if (!action.payload || typeof action.payload !== 'object') {
                lastError = new Error(`Invalid or missing payload for ${targetServiceString}.${targetMethodString}`);
                logger.error(`CriticalActionWorker: ${lastError.message}. Payload:`, action.payload);
                attempts = MAX_EXECUTION_RETRIES; // Do not retry this kind of error.
                throw lastError;
            }
            // The notificationService.sendNotification function itself does more detailed validation of subject, body etc.
            result = await serviceMethodToCall(action.payload); // serviceMethodToCall is services.notificationService.sendNotification
            // sendNotification service method returns { success: boolean, message: string }
            if (result && result.success === false) { // Check if the service method indicated a failure (e.g. validation failure)
                 logger.warn(`CriticalActionWorker: notificationService.sendNotification reported failure for action from message ID ${messageId}: ${result.message}`, action.payload);
                 // This is not an executionError that should be retried by the worker usually,
                 // as it's a business logic failure (e.g. bad params).
                 // We will let it be considered a "success" for queue processing (ACK) if no exception was thrown.
                 // If an error should be thrown to prevent ACK for bad params, the service should throw it.
                 // For now, just log it. If sendNotification threw an error, it would be caught by the main catch.
            }
            logger.info(`CriticalActionWorker: Executed ${targetServiceString}.${targetMethodString} (Attempt ${attempts}). Origin: ${action.origin?.service}`);
      } else {
          lastError = new Error(`No specific handler for whitelisted action ${targetServiceString}.${targetMethodString}`);
          logger.error(`CriticalActionWorker: ${lastError.message} for message ID ${messageId}. This indicates a worker logic gap.`);
          attempts = MAX_EXECUTION_RETRIES; // Do not retry this logic gap
          throw lastError;
      }
      success = true;
      lastError = null;
    } catch (executionError) {
      lastError = executionError;
      logger.warn(`CriticalActionWorker: Attempt ${attempts} failed for message ID ${messageId} action ${action.targetService}.${action.targetMethod}:`, { error: executionError.message, action });
      if (attempts >= MAX_EXECUTION_RETRIES) {
        logger.error(`CriticalActionWorker: Action failed after ${MAX_EXECUTION_RETRIES} attempts for message ID ${messageId}. Final Error:`, { error: executionError.message, action, fullErrorStack: executionError.stack });
      }
    }
  } // End of while loop

  const finalProcessingTimestamp = new Date().toISOString();

  if (success) {
    logger.info(`CriticalActionWorker: Action processed successfully for message ID ${messageId} after ${attempts} attempt(s).`, action);
    await operationService.recordOperation({
        serviceName: 'CriticalActionWorker', action: 'queued_action_executed',
        targetEntityType: action.targetService, targetEntityId: action.targetMethod,
        status: 'SUCCESS',
        details: { originalAction: action, messageId, actor: messageData.actor, attempts, executedAt: finalProcessingTimestamp }
    }).catch(opLogError => logger.error('Failed to log successful action execution:', opLogError));

    if (broadcaster && typeof broadcaster === 'function') {
      try {
        broadcaster({
          type: 'queued_action_executed',
          data: {
            messageId,
            action: action, // The parsed action
            origin: action.origin,
            attempts,
            executedAt: finalProcessingTimestamp,
            actor: messageData.actor
          }
        });
      } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for executed action', e); }
    }
    return true; // Signal to ACK the message
  } else {
    // Action failed all retries or a non-retryable error occurred
    logger.error(`CriticalActionWorker: Failed to process action for message ID ${messageId} after ${attempts} attempt(s). Moving to DLQ. Last error:`, { error: lastError?.message, action });

    const dlqMessageData = {
      original_message_id: messageId,
      original_stream: CRITICAL_ACTIONS_STREAM_NAME,
      original_payload_string: rawActionData, // Store the original raw string data
      parsed_action: action, // Store the parsed action if available
      actor: messageData.actor,
      published_at_original: messageData.published_at,
      last_error_message: lastError?.message || 'Unknown error during processing',
      // last_error_stack: lastError?.stack, // Optional: can be very verbose
      attempts_made: attempts,
      failed_at: finalProcessingTimestamp,
      dlq_reason: 'Max retries reached or non-retryable error during processing'
    };

    try {
      const dlqMessageId = await workerRedisClient.xadd(
        DLQ_STREAM_NAME,
        'MAXLEN', '~', MAX_DLQ_STREAM_LENGTH, // Use capping for DLQ
        '*',
        'data', JSON.stringify(dlqMessageData)
      );
      logger.info(`CriticalActionWorker: Message ID ${messageId} successfully moved to DLQ '${DLQ_STREAM_NAME}' with DLQ ID ${dlqMessageId}.`);

      await operationService.recordOperation({
        serviceName: 'CriticalActionWorker', action: 'queued_action_failed_dlq',
        targetEntityType: action?.targetService || 'UnknownService', // Use parsed action if available
        targetEntityId: action?.targetMethod || 'UnknownMethod',
        status: 'FAILURE',
        details: { originalMessageId: messageId, attempts, originalAction: action, lastError: lastError?.message, dlqStream: DLQ_STREAM_NAME, dlqMessageId, failedAt: finalProcessingTimestamp }
      });

      if (broadcaster && typeof broadcaster === 'function') {
        try {
            broadcaster({
                type: 'queued_action_dlq_moved',
                data: {
                    originalMessageId: messageId,
                    action: action,
                    origin: action.origin,
                    attempts: attempts,
                    lastErrorMessage: lastError?.message,
                    dlqStream: DLQ_STREAM_NAME,
                    dlqMessageId: dlqMessageId,
                    failedAt: finalProcessingTimestamp,
                    actor: messageData.actor
                }
            });
        } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for DLQ moved action', e); }
      }
      return true; // IMPORTANT: Return true to ACK original message after successfully moving to DLQ

    } catch (dlqError) {
      logger.error(`CriticalActionWorker: CRITICAL - Failed to move message ID ${messageId} to DLQ '${DLQ_STREAM_NAME}':`, dlqError);
      logger.error('CriticalActionWorker: Original message may be reprocessed or lost if not ACKed. Original error that led to DLQ attempt:', lastError);

      await operationService.recordOperation({
        serviceName: 'CriticalActionWorker', action: 'queued_action_failed_dlq_publish_failed',
        targetEntityType: action?.targetService || 'UnknownService',
        targetEntityId: action?.targetMethod || 'UnknownMethod',
        status: 'CRITICAL_FAILURE',
        details: { originalMessageId: messageId, attempts, originalAction: action, lastError: lastError?.message, dlqError: dlqError.message, failedAt: finalProcessingTimestamp }
      });

      if (broadcaster && typeof broadcaster === 'function') {
        try {
            broadcaster({
                type: 'queued_action_dlq_error',
                data: {
                    originalMessageId: messageId,
                    action: action,
                    origin: action.origin,
                    attempts: attempts,
                    lastErrorMessage: lastError?.message,
                    dlqPublishError: dlqError?.message,
                    failedAt: finalProcessingTimestamp,
                    actor: messageData.actor
                }
            });
        } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for DLQ error', e); }
      }
      return false; // Do NOT ACK the original message if DLQ publish fails
    }
  }
}


async function workerLoop() {
  while (!isShuttingDown) {
    try {
      const response = await workerRedisClient.xreadgroup(
        'GROUP', CONSUMER_GROUP_NAME, CONSUMER_NAME,
        'COUNT', 1,
        'BLOCK', 5000,
        'STREAMS', CRITICAL_ACTIONS_STREAM_NAME, '>'
      );

      if (response && response.length > 0 && response[0][1] && response[0][1].length > 0) {
        const messages = response[0][1];
        for (const [messageId, messageFieldsArray] of messages) {
          const messageData = {};
          for (let i = 0; i < messageFieldsArray.length; i += 2) {
            messageData[messageFieldsArray[i]] = messageFieldsArray[i+1];
          }

          const success = await processMessage(messageId, messageData);

          if (success) {
            await workerRedisClient.xack(CRITICAL_ACTIONS_STREAM_NAME, CONSUMER_GROUP_NAME, messageId);
            logger.info(`CriticalActionWorker: Message ID ${messageId} processed and ACKed.`);
          } else {
            logger.warn(`CriticalActionWorker: Message ID ${messageId} failed processing. Not ACKed. Consider DLQ or retry logic.`);
            // Currently, if not ACKed, it will be picked up by another consumer after its idle time, or by this one on restart if it's still pending.
          }
        }
      }
    } catch (err) {
      if (isShuttingDown && (err.message.includes('Connection is closed') || err.message.includes('Redis server is shutting down'))) {
        logger.info('CriticalActionWorker: Redis connection closed or closing during shutdown.');
        break;
      }
      logger.error('CriticalActionWorker: Error reading from stream or processing message:', { message: err.message, stack: err.stack });
      if (!isShuttingDown) await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
    }
  }
  logger.info('CriticalActionWorker: Worker loop has exited.');
}

async function startWorker() {
  if (workerLoopPromise) {
      logger.warn('CriticalActionWorker: Worker loop already initiated.');
      return;
  }
  isShuttingDown = false;
  try {
    await initializeConsumerGroup();
    logger.info(`CriticalActionWorker: Starting to listen to stream '${CRITICAL_ACTIONS_STREAM_NAME}' with group '${CONSUMER_GROUP_NAME}' as consumer '${CONSUMER_NAME}'.`);
    workerLoopPromise = workerLoop(); // Store the promise
  } catch (initError) {
      logger.error('CriticalActionWorker: Failed to initialize and start worker:', initError);
      // Potentially exit or retry initialization after a delay
      process.exit(1); // Exit if critical initialization fails
  }
}

async function stopWorker() {
  if (isShuttingDown && !workerLoopPromise) {
      logger.info('CriticalActionWorker: Already shut down or shutdown in progress with no active loop.');
      return;
  }
  if (!workerLoopPromise && !isShuttingDown) {
      logger.info('CriticalActionWorker: Worker loop was not started or already stopped.');
      return;
  }

  logger.info('CriticalActionWorker: Initiating shutdown...');
  isShuttingDown = true;

  // Attempt to gracefully close the Redis client connection used by the worker.
  // This might interrupt the blocking XREADGROUP call.
  if (workerRedisClient && (workerRedisClient.status === 'ready' || workerRedisClient.status === 'connecting')) {
      logger.info('CriticalActionWorker: Quitting dedicated Redis client...');
      try {
          await workerRedisClient.quit();
          logger.info('CriticalActionWorker: Dedicated Redis client quit gracefully.');
      } catch (err) {
          logger.error('CriticalActionWorker: Error during Redis client quit, forcing disconnect:', err);
          workerRedisClient.disconnect();
      }
  } else {
      logger.info('CriticalActionWorker: Dedicated Redis client already disconnected or not connected.');
  }

  // Wait for the worker loop to finish if it's running
  if (workerLoopPromise) {
      logger.info('CriticalActionWorker: Waiting for worker loop to complete...');
      try {
        await workerLoopPromise;
        logger.info('CriticalActionWorker: Worker loop completed.');
      } catch (loopError) {
          logger.error('CriticalActionWorker: Error during final worker loop execution:', loopError);
      }
  }
  workerLoopPromise = null; // Clear the promise
  logger.info('CriticalActionWorker: Shutdown process complete.');
}

module.exports = {
  startWorker,
  stopWorker
};

// Example for standalone execution (not used when integrated into server.js)
// if (require.main === module) {
//   logger.info('CriticalActionWorker: Starting as a standalone process.');
//   startWorker().catch(err => {
//     logger.error("CriticalActionWorker: Failed to start standalone worker:", err);
//     process.exit(1);
//   });
//   process.on('SIGINT', async () => { logger.info('SIGINT received'); await stopWorker(); process.exit(0); });
//   process.on('SIGTERM', async () => { logger.info('SIGTERM received'); await stopWorker(); process.exit(0); });
// }
