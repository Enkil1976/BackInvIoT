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
  getDlqMessages, // <-- Add this
  CRITICAL_ACTIONS_STREAM_NAME: STREAM_NAME, // Existing export
  ACTUAL_DLQ_STREAM_NAME // Export DLQ stream name
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
