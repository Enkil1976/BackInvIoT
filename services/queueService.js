const redisClient = require('../config/redis');
const logger = require('../config/logger');

const STREAM_NAME = process.env.CRITICAL_ACTIONS_STREAM_NAME || 'critical_actions_stream';
const MAX_STREAM_LENGTH = parseInt(process.env.CRITICAL_ACTIONS_STREAM_MAXLEN, 10) || 10000; // Approx. max length
const ACTUAL_DLQ_STREAM_NAME = process.env.CRITICAL_ACTIONS_DLQ_STREAM_NAME || 'critical_actions_dlq';

/**
 * Publishes a critical action to the Redis Stream.
 * @param {object} actionData - The action to be queued.
 *   Example: { type: 'device_action', targetService: 'deviceService', targetMethod: 'updateDeviceStatus',
 *              payload: { deviceId: 'hw_id_xyz', status: 'on' }, timestamp: new Date().toISOString() }
 * @param {string} [actor='system'] - Who or what initiated this action.
 * @returns {Promise<string|null>} The ID of the message in the stream, or null if error.
 */
async function publishCriticalAction(actionData, actor = 'system') {
  if (!redisClient || typeof redisClient.xadd !== 'function') {
    logger.error('QueueService: Redis client not available or does not support xadd. Action not queued.', {
        redisClientExists: !!redisClient,
        xaddExists: redisClient ? typeof redisClient.xadd === 'function' : false
    });
    // Fallback: Potentially try direct execution or log critical failure
    // Depending on the action's criticality, direct execution might be an option here if queue fails.
    // For now, just logging and returning null.
    return null;
  }

  if (!actionData || typeof actionData !== 'object' || Object.keys(actionData).length === 0) {
    logger.error('QueueService: Invalid or empty actionData provided. Must be a non-empty object.', { actionData });
    return null;
  }

  // Serialize actionData: Redis Streams store fields and values as flat array of strings.
  // We'll store the entire actionData object as a JSON string under a single field 'data'.
  const messagePayload = [
      'data', JSON.stringify(actionData),
      'actor', actor.toString(), // Ensure actor is a string
      'published_at', new Date().toISOString()
    ];

  try {
    // XADD stream_name MAXLEN ~ max_length * message_id field1 value1 ... fieldN valueN
    // Using '*' for auto-generated ID.
    // Using '~' for approximate MAXLEN trimming (trims older entries if stream exceeds length).
    const messageId = await redisClient.xadd(
      STREAM_NAME,
      'MAXLEN', '~', MAX_STREAM_LENGTH,
      '*', // Auto-generate message ID
      ...messagePayload
    );
    logger.info(`QueueService: Action published to stream '${STREAM_NAME}' with ID ${messageId}. Actor: ${actor}`, { actionType: actionData.type, targetService: actionData.targetService });
    return messageId;
  } catch (error) {
    logger.error(`QueueService: Error publishing action to stream '${STREAM_NAME}':`, { errorMessage: error.message, actionData, actor, error });
    return null;
  }
}

module.exports = {
  publishCriticalAction,
  getDlqMessages,
  retryDlqMessageById,
  deleteDlqMessageById,
  retryAllDlqMessages,
  clearAllDlqMessages,
  CRITICAL_ACTIONS_STREAM_NAME: STREAM_NAME,
  ACTUAL_DLQ_STREAM_NAME
};

/**
 * Retrieves messages from a Dead-Letter Queue (DLQ) Redis Stream.
 * @param {object} options
 * @param {string} [options.streamName=ACTUAL_DLQ_STREAM_NAME] - The name of the DLQ stream.
 * @param {string} [options.startId='-'] - The starting message ID for XRANGE.
 * @param {string} [options.endId='+'] - The ending message ID for XRANGE.
 * @param {number} [options.count=50] - The maximum number of messages to retrieve.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of DLQ messages.
 *                                    Each message object includes `id` (stream message ID) and `data` (parsed DLQ data).
 * @throws {Error} If Redis operation fails.
 */
async function getDlqMessages({
  streamName = ACTUAL_DLQ_STREAM_NAME,
  startId = '-',
  endId = '+',
  count = 50
}) {
  if (!redisClient || typeof redisClient.xrange !== 'function') {
    logger.error('QueueService: getDlqMessages - Redis client not available or does not support xrange.');
    throw new Error('Redis client not available for DLQ operations.');
  }

  let parsedCount = parseInt(count, 10);
  if (isNaN(parsedCount) || parsedCount <= 0) {
    logger.warn(`QueueService: getDlqMessages - Invalid count '${count}', defaulting to 50.`);
    parsedCount = 50; // Corrected variable for assignment
  }

  logger.debug(`QueueService: Fetching DLQ messages from stream '${streamName}' with startId='${startId}', endId='${endId}', count=${parsedCount}`);

  try {
    // XRANGE stream_name start_id end_id COUNT count
    const messages = await redisClient.xrange(streamName, startId, endId, 'COUNT', parsedCount);

    if (!messages || messages.length === 0) {
      return []; // No messages found
    }

    // Messages from XRANGE are arrays: [ [messageId, [field1, value1, field2, value2, ...]], ... ]
    const formattedMessages = messages.map(messageArr => {
      const messageId = messageArr[0];
      const fieldsArray = messageArr[1];
      let parsedData = null;

      // Find the 'data' field which contains the JSON string of dlqMessageData
      for (let i = 0; i < fieldsArray.length; i += 2) {
        if (fieldsArray[i] === 'data') {
          try {
            parsedData = JSON.parse(fieldsArray[i+1]);
          } catch (e) {
            logger.error(`QueueService: Failed to parse JSON data for DLQ message ID ${messageId} in stream ${streamName}:`, e);
            // Include raw data if parsing fails, to help with debugging
            parsedData = { error: 'Failed to parse DLQ message data content', raw_content: fieldsArray[i+1] };
          }
          break;
        }
      }

      if (parsedData === null) { // Should not happen if 'data' field is always present
         logger.warn(`QueueService: DLQ message ID ${messageId} in stream ${streamName} missing 'data' field.`, fieldsArray);
         parsedData = { error: "DLQ message missing 'data' field", raw_fields: fieldsArray };
      }

      return {
        id: messageId,
        data: parsedData
      };
    });

    return formattedMessages;
  } catch (error) {
    logger.error(`QueueService: Error fetching messages from DLQ stream '${streamName}':`, error);
    throw new Error(`Failed to retrieve messages from DLQ '${streamName}': ${error.message}`);
  }
}

/**
 * Retries a single message from the DLQ by re-publishing it to the main critical actions stream.
 * @param {string} dlqMessageId - The ID of the message in the DLQ to retry.
 * @returns {Promise<object>} Result object { success: boolean, message: string, newQueueMessageId?: string, originalDlqMessageId?: string }
 */
async function retryDlqMessageById(dlqMessageId) {
  if (!redisClient || typeof redisClient.xrange !== 'function' || typeof redisClient.xdel !== 'function') {
    logger.error('QueueService: retryDlqMessageById - Redis client not available or missing commands.');
    return { success: false, message: 'Redis client not available for DLQ operations.' };
  }
  if (!dlqMessageId) {
    return { success: false, message: 'DLQ Message ID is required.' };
  }

  try {
    const messages = await redisClient.xrange(ACTUAL_DLQ_STREAM_NAME, dlqMessageId, dlqMessageId, 'COUNT', 1);
    if (!messages || messages.length === 0) {
      return { success: false, message: 'Message not found in DLQ.', originalDlqMessageId: dlqMessageId };
    }

    const messageFieldsArray = messages[0][1];
    let dlqMessageDataStr;
    for (let i = 0; i < messageFieldsArray.length; i += 2) {
      if (messageFieldsArray[i] === 'data') {
        dlqMessageDataStr = messageFieldsArray[i+1];
        break;
      }
    }

    if (!dlqMessageDataStr) {
      logger.error(`QueueService: DLQ message ID ${dlqMessageId} in stream ${ACTUAL_DLQ_STREAM_NAME} missing 'data' field for retry.`);
      return { success: false, message: "DLQ message missing 'data' field, cannot retry.", originalDlqMessageId: dlqMessageId };
    }

    const dlqMessageData = JSON.parse(dlqMessageDataStr);
    const originalAction = dlqMessageData.parsed_action || JSON.parse(dlqMessageData.original_payload_string);
    const originalActor = dlqMessageData.actor || 'system_dlq_retry';

    if (!originalAction) {
        logger.error(`QueueService: Could not parse original action from DLQ message ID ${dlqMessageId}.`);
        return { success: false, message: 'Could not parse original action from DLQ message.', originalDlqMessageId: dlqMessageId };
    }

    const newQueueMessageId = await publishCriticalAction(originalAction, originalActor);

    if (newQueueMessageId) {
      await redisClient.xdel(ACTUAL_DLQ_STREAM_NAME, dlqMessageId);
      logger.info(`QueueService: DLQ message ID ${dlqMessageId} re-queued to main stream with new ID ${newQueueMessageId} and deleted from DLQ.`);
      return { success: true, message: 'DLQ message re-queued successfully.', originalDlqMessageId: dlqMessageId, newQueueMessageId };
    } else {
      logger.warn(`QueueService: Failed to re-queue DLQ message ID ${dlqMessageId} to main stream.`);
      return { success: false, message: 'Failed to re-queue message to main stream.', originalDlqMessageId: dlqMessageId };
    }
  } catch (error) {
    logger.error(`QueueService: Error during retryDlqMessageById for ID ${dlqMessageId}:`, error);
    return { success: false, message: `Error retrying DLQ message: ${error.message}`, originalDlqMessageId: dlqMessageId };
  }
}

/**
 * Deletes a single message from the DLQ.
 * @param {string} dlqMessageId - The ID of the message in the DLQ to delete.
 * @returns {Promise<object>} Result object { success: boolean, message: string, deletedMessageId?: string, deletedCount?: number }
 */
async function deleteDlqMessageById(dlqMessageId) {
  if (!redisClient || typeof redisClient.xdel !== 'function') {
    logger.error('QueueService: deleteDlqMessageById - Redis client not available or does not support xdel.');
    return { success: false, message: 'Redis client not available for DLQ operations.' };
  }
   if (!dlqMessageId) {
    return { success: false, message: 'DLQ Message ID is required.' };
  }

  try {
    const deletedCount = await redisClient.xdel(ACTUAL_DLQ_STREAM_NAME, dlqMessageId);
    if (deletedCount > 0) {
      logger.info(`QueueService: DLQ message ID ${dlqMessageId} deleted from stream ${ACTUAL_DLQ_STREAM_NAME}.`);
      return { success: true, message: 'DLQ message deleted.', deletedMessageId: dlqMessageId, deletedCount };
    } else {
      logger.warn(`QueueService: DLQ message ID ${dlqMessageId} not found in stream ${ACTUAL_DLQ_STREAM_NAME} or already deleted.`);
      return { success: false, message: 'DLQ message not found or already deleted.', deletedMessageId: dlqMessageId, deletedCount };
    }
  } catch (error) {
    logger.error(`QueueService: Error deleting DLQ message ID ${dlqMessageId}:`, error);
    return { success: false, message: `Error deleting DLQ message: ${error.message}`, deletedMessageId: dlqMessageId };
  }
}

/**
 * Retries all messages currently in the DLQ.
 * Fetches all messages first, then attempts to re-queue them one by one.
 * @returns {Promise<object>} Summary of the operation.
 */
async function retryAllDlqMessages() {
  if (!redisClient || typeof redisClient.xrange !== 'function' || typeof redisClient.xdel !== 'function') {
    logger.error('QueueService: retryAllDlqMessages - Redis client not available or missing commands.');
    return { message: 'Redis client not available for DLQ operations.', totalAttempted: 0, successfullyRequeued: 0, failedToRequeue: 0 };
  }

  let totalAttempted = 0;
  let successfullyRequeued = 0;
  let failedToRequeue = 0;

  try {
    const allDlqMessages = await redisClient.xrange(ACTUAL_DLQ_STREAM_NAME, '-', '+');
    if (!allDlqMessages || allDlqMessages.length === 0) {
      logger.info('QueueService: retryAllDlqMessages - DLQ is empty.');
      return { message: "DLQ is empty.", totalAttempted: 0, successfullyRequeued: 0, failedToRequeue: 0 };
    }

    totalAttempted = allDlqMessages.length;
    logger.info(`QueueService: retryAllDlqMessages - Attempting to retry ${totalAttempted} messages from DLQ '${ACTUAL_DLQ_STREAM_NAME}'.`);

    for (const [messageId, messageFields] of allDlqMessages) {
      let dlqMessageDataStr;
      for (let i = 0; i < messageFields.length; i += 2) {
        if (messageFields[i] === 'data') {
          dlqMessageDataStr = messageFields[i+1];
          break;
        }
      }

      if (!dlqMessageDataStr) {
        logger.warn(`QueueService: retryAllDlqMessages - Message ID ${messageId} missing 'data' field. Skipping.`);
        failedToRequeue++;
        continue;
      }

      try {
        const dlqMessageData = JSON.parse(dlqMessageDataStr);
        const originalAction = dlqMessageData.parsed_action || JSON.parse(dlqMessageData.original_payload_string);
        const originalActor = dlqMessageData.actor || 'system_dlq_retry_all';

        if (!originalAction) {
            logger.warn(`QueueService: retryAllDlqMessages - Could not parse original action from DLQ message ID ${messageId}. Skipping.`);
            failedToRequeue++;
            continue;
        }

        const newQueueMessageId = await publishCriticalAction(originalAction, originalActor);
        if (newQueueMessageId) {
          await redisClient.xdel(ACTUAL_DLQ_STREAM_NAME, messageId);
          successfullyRequeued++;
          logger.debug(`QueueService: retryAllDlqMessages - Re-queued DLQ message ${messageId} as new message ${newQueueMessageId}.`);
        } else {
          logger.warn(`QueueService: retryAllDlqMessages - Failed to re-queue DLQ message ${messageId}.`);
          failedToRequeue++;
        }
      } catch (e) {
        logger.error(`QueueService: retryAllDlqMessages - Error processing message ${messageId}:`, e);
        failedToRequeue++;
      }
    }
    const summary = {
        message: "Retry all DLQ messages attempt complete.",
        totalAttempted,
        successfullyRequeued,
        failedToRequeue
    };
    logger.info('QueueService: retryAllDlqMessages - Operation summary:', summary);
    return summary;

  } catch (error) {
    logger.error(`QueueService: retryAllDlqMessages - Error fetching all messages from DLQ '${ACTUAL_DLQ_STREAM_NAME}':`, error);
    return {
        message: `Error fetching messages from DLQ: ${error.message}`,
        totalAttempted,
        successfullyRequeued,
        failedToRequeue
    };
  }
}

/**
 * Clears all messages from the DLQ by deleting the stream.
 * @returns {Promise<object>} Result object { success: boolean, message: string }
 */
async function clearAllDlqMessages() {
  if (!redisClient || typeof redisClient.del !== 'function') {
    logger.error('QueueService: clearAllDlqMessages - Redis client not available or does not support del.');
    return { success: false, message: 'Redis client not available for DLQ operations.' };
  }

  try {
    await redisClient.del(ACTUAL_DLQ_STREAM_NAME);
    logger.info(`QueueService: DLQ stream '${ACTUAL_DLQ_STREAM_NAME}' deleted.`);
    return { success: true, message: `DLQ stream '${ACTUAL_DLQ_STREAM_NAME}' deleted.` };
  } catch (error) {
    logger.error(`QueueService: Error deleting DLQ stream '${ACTUAL_DLQ_STREAM_NAME}':`, error);
    return { success: false, message: `Error deleting DLQ stream: ${error.message}` };
  }
}
