const redisClient = require('../config/redis');
const logger = require('../config/logger');

const STREAM_NAME = process.env.CRITICAL_ACTIONS_STREAM_NAME || 'critical_actions_stream';
const MAX_STREAM_LENGTH = parseInt(process.env.CRITICAL_ACTIONS_STREAM_MAXLEN, 10) || 10000; // Approx. max length

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
  CRITICAL_ACTIONS_STREAM_NAME: STREAM_NAME // Export stream name for worker/consumers
};
