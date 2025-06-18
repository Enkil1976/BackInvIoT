const Redis = require('ioredis'); // For a dedicated blocking client
const pool = require('../config/db'); // For DB lookups (e.g., device ID)
const logger = require('../config/logger');
const deviceService = require('../services/deviceService');
const operationService = require('../services/operationService');
const notificationService = require('../services/notificationService');
// Import ACTUAL_DLQ_STREAM_NAME for checking, CRITICAL_ACTIONS_STREAM_NAME for main queue
const { CRITICAL_ACTIONS_STREAM_NAME, ACTUAL_DLQ_STREAM_NAME } = require('../services/queueService');
const crypto = require('crypto');

const MAX_EXECUTION_RETRIES = parseInt(process.env.CRITICAL_WORKER_MAX_RETRIES, 10) || 3;
const RETRY_DELAY_MS = parseInt(process.env.CRITICAL_WORKER_RETRY_DELAY_MS, 10) || 1000; // 1 second

// DLQ_STREAM_NAME_PUBLISH is used by this worker to *publish* to DLQ.
// It should match ACTUAL_DLQ_STREAM_NAME from queueService for consistency.
const DLQ_STREAM_NAME_PUBLISH = process.env.CRITICAL_ACTIONS_DLQ_STREAM_NAME || 'critical_actions_dlq';
const MAX_DLQ_STREAM_LENGTH = parseInt(process.env.CRITICAL_ACTIONS_DLQ_MAXLEN, 10) || 1000; // Optional capping for DLQ

const DLQ_ALERT_THRESHOLD = parseInt(process.env.DLQ_ALERT_THRESHOLD, 10) || 10;
const DLQ_CHECK_INTERVAL_MINUTES = parseInt(process.env.DLQ_CHECK_INTERVAL_MINUTES, 10) || 5;
const DLQ_CHECK_INTERVAL_MS = DLQ_CHECK_INTERVAL_MINUTES * 60 * 1000;

// Map of available services for the worker
const services = {
  deviceService,
  operationService,
  notificationService,
};

// Whitelist of allowed methods per service for security and clarity
const allowedServiceMethods = {
  deviceService: {
    updateDeviceStatus: services.deviceService.updateDeviceStatus,
    setDeviceConfiguration: services.deviceService.setDeviceConfiguration,
  },
  operationService: {
    recordOperation: services.operationService.recordOperation,
  },
  notificationService: {
    sendNotification: services.notificationService.sendNotification,
  },
};

const workerRedisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USER,
  retryStrategy: times => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3
});

workerRedisClient.on('error', (err) => logger.error(`CriticalActionWorker Redis Error: ${err.message}`));
workerRedisClient.on('connect', () => logger.info('✅ CriticalActionWorker Redis client connected'));

const CONSUMER_GROUP_NAME = process.env.CRITICAL_ACTIONS_CONSUMER_GROUP || 'critical_actions_group';
const CONSUMER_NAME = `consumer_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

let isShuttingDown = false;
let workerLoopPromise = null;
let broadcaster = null;
let dlqCheckIntervalId = null;

async function checkDlqSizeAndAlert() {
  if (!workerRedisClient || typeof workerRedisClient.xlen !== 'function') {
    logger.warn('DLQCheck: Worker Redis client not available or xlen not supported. Skipping DLQ size check.');
    return;
  }
  if (!operationService || typeof operationService.recordOperation !== 'function') {
      logger.warn('DLQCheck: OperationService not available. Skipping DLQ size check reporting.');
      return;
  }

  try {
    const dlqSize = await workerRedisClient.xlen(ACTUAL_DLQ_STREAM_NAME);
    logger.info(`DLQCheck: Current size of DLQ stream '${ACTUAL_DLQ_STREAM_NAME}' is ${dlqSize}. Threshold is ${DLQ_ALERT_THRESHOLD}.`);

    if (dlqSize > DLQ_ALERT_THRESHOLD) {
      const alertMessage = `CRITICAL ACTION DLQ ALERT: Stream '${ACTUAL_DLQ_STREAM_NAME}' size (${dlqSize}) exceeds threshold (${DLQ_ALERT_THRESHOLD}).`;
      logger.error(alertMessage);

      await operationService.recordOperation({
        serviceName: 'CriticalActionWorker',
        action: 'dlq_threshold_exceeded',
        status: 'ALERT',
        targetEntityType: 'redis_stream',
        targetEntityId: ACTUAL_DLQ_STREAM_NAME,
        details: {
          currentSize: dlqSize,
          threshold: DLQ_ALERT_THRESHOLD,
          message: alertMessage,
          checkIntervalMinutes: DLQ_CHECK_INTERVAL_MINUTES
        }
      });
      // Future: Could also integrate with notificationService here
      // e.g., if (services.notificationService && typeof services.notificationService.sendNotification === 'function') { ... }
    }
  } catch (error) {
    if (error && error.message && !error.message.toLowerCase().includes('no such key')) {
         logger.error(`DLQCheck: Error checking DLQ size for stream '${ACTUAL_DLQ_STREAM_NAME}':`, error);
    } else if (!error || !error.message) {
         logger.error(`DLQCheck: An unknown error occurred while checking DLQ size for stream '${ACTUAL_DLQ_STREAM_NAME}'.`);
    }
  }
}

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
          attempts = MAX_EXECUTION_RETRIES;
          continue;
      }
      const serviceMethodToCall = allowedServiceMethods[targetServiceString][targetMethodString];
      let result;

      if (targetServiceString === 'deviceService' && targetMethodString === 'updateDeviceStatus') {
          if (!payload || payload.deviceId === undefined || payload.status === undefined) {
              lastError = new Error(`Invalid payload for ${targetServiceString}.${targetMethodString}: missing deviceId or status`);
              logger.error(`CriticalActionWorker: ${lastError.message}. Payload: %j`, payload);
              attempts = MAX_EXECUTION_RETRIES;
              throw lastError;
          }
          const deviceResult = await pool.query("SELECT id FROM devices WHERE device_id = $1", [payload.deviceId]);
          if (deviceResult.rows.length === 0) {
              lastError = new Error(`Device with HW_ID ${payload.deviceId} not found for ${targetMethodString}`);
              logger.error(`CriticalActionWorker: ${lastError.message}.`);
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
                attempts = MAX_EXECUTION_RETRIES;
                throw lastError;
            }
            result = await serviceMethodToCall(action.payload);
            if (result && result.success === false) {
                 logger.warn(`CriticalActionWorker: notificationService.sendNotification reported failure for action from message ID ${messageId}: ${result.message}`, action.payload);
            }
            logger.info(`CriticalActionWorker: Executed ${targetServiceString}.${targetMethodString} (Attempt ${attempts}). Origin: ${action.origin?.service}`);
      } else {
          lastError = new Error(`No specific handler for whitelisted action ${targetServiceString}.${targetMethodString}`);
          logger.error(`CriticalActionWorker: ${lastError.message} for message ID ${messageId}. This indicates a worker logic gap.`);
          attempts = MAX_EXECUTION_RETRIES;
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
  }

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
          data: { messageId, action, origin: action.origin, attempts, executedAt: finalProcessingTimestamp, actor: messageData.actor }
        });
      } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for executed action', e); }
    }
    return true;
  } else {
    logger.error(`CriticalActionWorker: Failed to process action for message ID ${messageId} after ${attempts} attempt(s). Moving to DLQ. Last error:`, { error: lastError?.message, action });

    const dlqMessageData = {
      original_message_id: messageId, original_stream: CRITICAL_ACTIONS_STREAM_NAME,
      original_payload_string: rawActionData, parsed_action: action, actor: messageData.actor,
      published_at_original: messageData.published_at,
      last_error_message: lastError?.message || 'Unknown error during processing',
      attempts_made: attempts, failed_at: finalProcessingTimestamp,
      dlq_reason: 'Max retries reached or non-retryable error during processing'
    };

    try {
      const dlqMessageId = await workerRedisClient.xadd(
        DLQ_STREAM_NAME_PUBLISH,
        'MAXLEN', '~', MAX_DLQ_STREAM_LENGTH, '*',
        'data', JSON.stringify(dlqMessageData)
      );
      logger.info(`CriticalActionWorker: Message ID ${messageId} successfully moved to DLQ '${DLQ_STREAM_NAME_PUBLISH}' with DLQ ID ${dlqMessageId}.`);

      await operationService.recordOperation({
        serviceName: 'CriticalActionWorker', action: 'queued_action_failed_dlq',
        targetEntityType: action?.targetService || 'UnknownService', targetEntityId: action?.targetMethod || 'UnknownMethod',
        status: 'FAILURE',
        details: { originalMessageId: messageId, attempts, originalAction: action, lastError: lastError?.message, dlqStream: DLQ_STREAM_NAME_PUBLISH, dlqMessageId, failedAt: finalProcessingTimestamp }
      });

      if (broadcaster && typeof broadcaster === 'function') {
        try {
            broadcaster({
                type: 'queued_action_dlq_moved',
                data: { originalMessageId: messageId, action, origin: action.origin, attempts, lastErrorMessage: lastError?.message, dlqStream: DLQ_STREAM_NAME_PUBLISH, dlqMessageId, failedAt: finalProcessingTimestamp, actor: messageData.actor }
            });
        } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for DLQ moved action', e); }
      }
      return true;
    } catch (dlqError) {
      logger.error(`CriticalActionWorker: CRITICAL - Failed to move message ID ${messageId} to DLQ '${DLQ_STREAM_NAME_PUBLISH}':`, dlqError);
      logger.error('CriticalActionWorker: Original message may be reprocessed or lost if not ACKed. Original error that led to DLQ attempt:', lastError);

      await operationService.recordOperation({
        serviceName: 'CriticalActionWorker', action: 'queued_action_failed_dlq_publish_failed',
        targetEntityType: action?.targetService || 'UnknownService', targetEntityId: action?.targetMethod || 'UnknownMethod',
        status: 'CRITICAL_FAILURE',
        details: { originalMessageId: messageId, attempts, originalAction: action, lastError: lastError?.message, dlqError: dlqError.message, failedAt: finalProcessingTimestamp }
      });

      if (broadcaster && typeof broadcaster === 'function') {
        try {
            broadcaster({
                type: 'queued_action_dlq_error',
                data: { originalMessageId: messageId, action, origin: action.origin, attempts, lastErrorMessage: lastError?.message, dlqPublishError: dlqError?.message, failedAt: finalProcessingTimestamp, actor: messageData.actor }
            });
        } catch (e) { logger.error('CriticalActionWorker: Error broadcasting WebSocket for DLQ error', e); }
      }
      return false;
    }
  }
}

async function workerLoop() {
  while (!isShuttingDown) {
    try {
      const response = await workerRedisClient.xreadgroup(
        'GROUP', CONSUMER_GROUP_NAME, CONSUMER_NAME,
        'COUNT', 1, 'BLOCK', 5000,
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
            logger.warn(`CriticalActionWorker: Message ID ${messageId} failed processing. Not ACKed.`);
          }
        }
      }
    } catch (err) {
      if (isShuttingDown && (err.message.includes('Connection is closed') || err.message.includes('Redis server is shutting down'))) {
        logger.info('CriticalActionWorker: Redis connection closed or closing during shutdown.');
        break;
      }
      logger.error('CriticalActionWorker: Error reading from stream or processing message:', { message: err.message, stack: err.stack });
      if (!isShuttingDown) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  logger.info('CriticalActionWorker: Worker loop has exited.');
}

async function startWorker(broadcastFunc) { // Added broadcastFunc parameter
  if (workerLoopPromise) {
      logger.warn('CriticalActionWorker: Worker loop already initiated.');
      return;
  }
  if (broadcastFunc && typeof broadcastFunc === 'function') {
    broadcaster = broadcastFunc;
    logger.info('CriticalActionWorker: Broadcaster function set.');
  } else {
    logger.warn('CriticalActionWorker: Broadcaster function not provided or invalid. Worker will start without WebSocket broadcast capability for its events.');
  }
  isShuttingDown = false;
  try {
    await initializeConsumerGroup();
    logger.info(`CriticalActionWorker: Starting to listen to stream '${CRITICAL_ACTIONS_STREAM_NAME}' with group '${CONSUMER_GROUP_NAME}' as consumer '${CONSUMER_NAME}'.`);
    workerLoopPromise = workerLoop();

    // Start DLQ size check polling
    if (DLQ_CHECK_INTERVAL_MS > 0 && ACTUAL_DLQ_STREAM_NAME) {
        checkDlqSizeAndAlert().catch(err => logger.error("DLQCheck: Initial checkDlqSizeAndAlert failed:", err));
        dlqCheckIntervalId = setInterval(() => {
            checkDlqSizeAndAlert().catch(err => logger.error("DLQCheck: Periodic checkDlqSizeAndAlert failed:", err));
        }, DLQ_CHECK_INTERVAL_MS);
        logger.info(`DLQCheck: DLQ size check scheduled every ${DLQ_CHECK_INTERVAL_MINUTES} minutes for stream '${ACTUAL_DLQ_STREAM_NAME}'.`);
    } else {
        logger.warn('DLQCheck: DLQ check interval is not configured, is zero, or DLQ stream name for checking is not available. DLQ size polling will not start.');
    }
  } catch (initError) {
      logger.error('CriticalActionWorker: Failed to initialize and start worker:', initError);
      process.exit(1);
  }
}

async function stopWorker() {
  if (isShuttingDown && !workerLoopPromise && !dlqCheckIntervalId) {
      logger.info('CriticalActionWorker: Already shut down or shutdown in progress with no active components.');
      return;
  }

  logger.info('CriticalActionWorker: Initiating shutdown...');
  isShuttingDown = true;

  if (dlqCheckIntervalId) {
    clearInterval(dlqCheckIntervalId);
    dlqCheckIntervalId = null;
    logger.info('DLQCheck: DLQ size check interval cleared.');
  }

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

  if (workerLoopPromise) {
      logger.info('CriticalActionWorker: Waiting for worker loop to complete...');
      try {
        await workerLoopPromise;
        logger.info('CriticalActionWorker: Worker loop completed.');
      } catch (loopError) {
          logger.error('CriticalActionWorker: Error during final worker loop execution:', loopError);
      }
  }
  workerLoopPromise = null;
  logger.info('CriticalActionWorker: Shutdown process complete.');
}

module.exports = {
  startWorker,
  stopWorker
};

// Example for standalone execution (not used when integrated into server.js)
// if (require.main === module) {
//   logger.info('CriticalActionWorker: Starting as a standalone process.');
//   startWorker().catch(err => { // Pass broadcaster if needed for standalone
//     logger.error("CriticalActionWorker: Failed to start standalone worker:", err);
//     process.exit(1);
//   });
//   process.on('SIGINT', async () => { logger.info('SIGINT received'); await stopWorker(); process.exit(0); });
//   process.on('SIGTERM', async () => { logger.info('SIGTERM received'); await stopWorker(); process.exit(0); });
// }
