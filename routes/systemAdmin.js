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

module.exports = router;
