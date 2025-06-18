const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService'); // Assuming path is correct
const { protect, authorize } = require('../middleware/auth'); // Assuming path is correct
const logger = require('../config/logger'); // Assuming path is correct

/**
 * @swagger
 * /api/system/dlq/critical-actions:
 *   get:
 *     summary: Retrieve messages from the Critical Actions Dead-Letter Queue (DLQ)
 *     tags: [System, DLQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *         description: "Redis Stream ID to start fetching from (exclusive for XREAD, inclusive for XRANGE's first element). Default: '-' (beginning)."
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *         description: "Redis Stream ID to end fetching at. Default: '+' (end)."
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 50
 *         description: "Maximum number of messages to return."
 *     responses:
 *       200:
 *         description: An array of DLQ messages.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The Redis Stream message ID.
 *                   data:
 *                     type: object
 *                     description: The parsed DLQ message data.
 *                     properties:
 *                       original_message_id: { type: string }
 *                       original_stream: { type: string }
 *                       original_payload_string: { type: string }
 *                       parsed_action: { type: object }
 *                       actor: { type: string }
 *                       published_at_original: { type: string, format: 'date-time' }
 *                       last_error_message: { type: string }
 *                       attempts_made: { type: integer }
 *                       failed_at: { type: string, format: 'date-time' }
 *                       dlq_reason: { type: string }
 *       401:
 *         description: Not authorized, no token or invalid token.
 *       403:
 *         description: Forbidden, user does not have admin role.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/dlq/critical-actions',
  protect,
  authorize(['admin']),
  async (req, res) => {
    try {
      const { start, end, count } = req.query;
      const options = {
        streamName: queueService.ACTUAL_DLQ_STREAM_NAME, // Use exported DLQ stream name
        startId: start, // service function handles default if undefined
        endId: end,     // service function handles default if undefined
        count: count    // service function handles default if undefined
      };

      const dlqMessages = await queueService.getDlqMessages(options);
      res.status(200).json(dlqMessages);
    } catch (error) {
      logger.error(`Error in GET /api/system/dlq/critical-actions: ${error.message}`, { stack: error.stack, query: req.query });
      if (error.status) { // If service threw an error with a status
          return res.status(error.status).json({ error: error.message });
      }
      // Default to 500 for unexpected errors (e.g., Redis connection down)
      res.status(500).json({ error: 'Failed to retrieve DLQ messages.' });
    }
  }
);

// Add other system/admin routes here in the future if needed

/**
 * @swagger
 * /api/system/dlq/critical-actions/message/{messageId}/retry:
 *   post:
 *     summary: Retry a specific message from the Critical Actions DLQ
 *     tags: [System, DLQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the DLQ message to retry (e.g., "1678886400000-0").
 *     responses:
 *       200:
 *         description: Result of the retry attempt.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 newQueueMessageId: { type: string, nullable: true }
 *                 originalDlqMessageId: { type: string, nullable: true }
 *       400:
 *         description: Invalid message ID format.
 *       404:
 *         description: Message not found in DLQ.
 *       500:
 *         description: Internal server error or failed to re-queue.
 */
router.post(
  '/dlq/critical-actions/message/:messageId/retry',
  protect,
  authorize(['admin']),
  async (req, res) => {
    const { messageId } = req.params;
    // Basic Redis Stream ID format check (example: 1609459200000-0)
    if (!messageId || typeof messageId !== 'string' || !/^\d+-\d+$/.test(messageId)) {
        return res.status(400).json({ error: 'Invalid DLQ message ID format provided.' });
    }
    try {
      const result = await queueService.retryDlqMessageById(messageId);
      if (!result.success && result.message && result.message.toLowerCase().includes('not found')) {
        return res.status(404).json(result);
      }
      res.status(result.success ? 200 : 500).json(result); // 500 if re-queue failed but not 'not found'
    } catch (error) {
      logger.error(`Error retrying DLQ message ${messageId}: ${error.message}`, { stack: error.stack });
      res.status(500).json({ error: 'Failed to retry DLQ message.', details: error.message });
    }
  }
);

/**
 * @swagger
 * /api/system/dlq/critical-actions/message/{messageId}:
 *   delete:
 *     summary: Delete a specific message from the Critical Actions DLQ
 *     tags: [System, DLQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the DLQ message to delete (e.g., "1678886400000-0").
 *     responses:
 *       200:
 *         description: Result of the delete attempt (message deleted).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 deletedMessageId: { type: string }
 *                 deletedCount: { type: integer }
 *       400:
 *         description: Invalid message ID format.
 *       404:
 *         description: Message not found in DLQ or already deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *                 deletedMessageId: { type: string }
 *                 deletedCount: { type: integer, example: 0 }
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/dlq/critical-actions/message/:messageId',
  protect,
  authorize(['admin']),
  async (req, res) => {
    const { messageId } = req.params;
     if (!messageId || typeof messageId !== 'string' || !/^\d+-\d+$/.test(messageId)) {
        return res.status(400).json({ error: 'Invalid DLQ message ID format provided.' });
    }
    try {
      const result = await queueService.deleteDlqMessageById(messageId);
      // If service indicates success and count > 0, it's a 200.
      // If service indicates not found (success: false, count: 0), it's a 404.
      if (result.success && result.deletedCount && result.deletedCount > 0) {
          res.status(200).json(result);
      } else {
          res.status(404).json(result);
      }
    } catch (error) {
      logger.error(`Error deleting DLQ message ${messageId}: ${error.message}`, { stack: error.stack });
      res.status(500).json({ error: 'Failed to delete DLQ message.', details: error.message });
    }
  }
);

/**
 * @swagger
 * /api/system/dlq/critical-actions/retry-all:
 *   post:
 *     summary: Attempt to retry all messages in the Critical Actions DLQ
 *     tags: [System, DLQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: batchSize
 *         schema:
 *            type: integer
 *            default: 10
 *         description: "Optional batch size for processing (though current service implementation retries all in one go)."
 *     responses:
 *       200:
 *         description: Summary of the retry-all operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 totalAttempted: { type: integer }
 *                 successfullyRequeued: { type: integer }
 *                 failedToRequeue: { type: integer }
 *       400:
 *         description: Invalid batchSize provided.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/dlq/critical-actions/retry-all',
  protect,
  authorize(['admin']),
  async (req, res) => {
    try {
      // Note: current queueService.retryAllDlqMessages doesn't use batchSize, but we keep param for future.
      const batchSize = req.query.batchSize ? parseInt(req.query.batchSize, 10) : undefined;
      if (batchSize !== undefined && (isNaN(batchSize) || batchSize <= 0)) {
          return res.status(400).json({ error: 'Invalid batchSize provided. Must be a positive integer.'});
      }
      const result = await queueService.retryAllDlqMessages(); // batchSize is not used by current service impl.
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Error retrying all DLQ messages: ${error.message}`, { stack: error.stack });
      res.status(500).json({ error: 'Failed to retry all DLQ messages.', details: error.message });
    }
  }
);

/**
 * @swagger
 * /api/system/dlq/critical-actions/clear-all:
 *   delete:
 *     summary: Clear all messages from the Critical Actions DLQ by deleting the stream
 *     tags: [System, DLQ]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Confirmation that the DLQ stream was deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/dlq/critical-actions/clear-all',
  protect,
  authorize(['admin']),
  async (req, res) => {
    try {
      const result = await queueService.clearAllDlqMessages();
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      logger.error(`Error clearing all DLQ messages: ${error.message}`, { stack: error.stack });
      res.status(500).json({ error: 'Failed to clear all DLQ messages.', details: error.message });
    }
  }
);

module.exports = router;
