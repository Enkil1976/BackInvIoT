const express = require('express');
const { protect: authenticate, authorize: requireRole } = require('../middleware/auth');
const logger = require('../config/logger');
const { body, param, query, validationResult } = require('express-validator');

module.exports = function(notificationService) {
  const router = express.Router();

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }
  next();
};

/**
 * POST /api/notifications/send
 * Send a notification immediately
 */
router.post('/api/notifications/send',
  authenticate,
  [
    body('subject').notEmpty().withMessage('Subject is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('recipient_type').notEmpty().withMessage('Recipient type is required'),
    body('recipient_target').notEmpty().withMessage('Recipient target is required'),
    body('channel').optional().isIn(['email', 'telegram', 'whatsapp', 'websocket', 'system_log']).withMessage('Invalid channel'),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5'),
    body('immediate').optional().isBoolean().withMessage('Immediate must be boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        subject,
        body,
        recipient_type,
        recipient_target,
        channel = 'system_log',
        type = 'info',
        priority = 5,
        originDetails = {},
        immediate = false
      } = req.body;

      // Add user context to origin details
      const enrichedOriginDetails = {
        ...originDetails,
        requestedBy: {
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role
        },
        service: 'NotificationAPI'
      };

      const result = await notificationService.sendNotification({
        subject,
        body,
        recipient_type,
        recipient_target,
        channel,
        type,
        priority,
        originDetails: enrichedOriginDetails,
        immediate
      });

      if (result.success) {
        logger.info(`Notification sent via API by user ${req.user.username}:`, {
          notificationId: result.notificationId,
          channel,
          immediate
        });

        res.json({
          success: true,
          message: immediate ? 'Notification sent immediately' : 'Notification queued for processing',
          data: {
            notificationId: result.notificationId,
            messageId: result.messageId,
            immediate,
            queued: result.queued
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to send notification'
        });
      }

    } catch (error) {
      logger.error('Error in send notification API:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/notifications/send-template
 * Send a notification using a template
 */
router.post('/api/notifications/send-template',
  authenticate,
  [
    body('templateName').notEmpty().withMessage('Template name is required'),
    body('variables').isObject().withMessage('Variables must be an object'),
    body('recipient_type').notEmpty().withMessage('Recipient type is required'),
    body('recipient_target').notEmpty().withMessage('Recipient target is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { templateName, variables, recipient_type, recipient_target, originDetails = {} } = req.body;

      const enrichedOriginDetails = {
        ...originDetails,
        requestedBy: {
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role
        },
        service: 'NotificationAPI'
      };

      const result = await notificationService.sendNotificationWithTemplate(
        templateName,
        variables,
        {
          recipient_type,
          recipient_target,
          originDetails: enrichedOriginDetails
        }
      );

      if (result.success) {
        logger.info(`Template notification sent via API by user ${req.user.username}:`, {
          templateName,
          channels: result.results.map(r => r.channel)
        });

        res.json({
          success: true,
          message: 'Template notification sent',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || 'Failed to send template notification'
        });
      }

    } catch (error) {
      logger.error('Error in send template notification API:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/notifications/schedule
 * Schedule a notification for future delivery
 */
router.post('/api/notifications/schedule',
  authenticate,
  [
    body('subject').notEmpty().withMessage('Subject is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('recipient_type').notEmpty().withMessage('Recipient type is required'),
    body('recipient_target').notEmpty().withMessage('Recipient target is required'),
    body('scheduledAt').isISO8601().withMessage('Scheduled time must be a valid ISO 8601 date'),
    body('channel').optional().isIn(['email', 'telegram', 'whatsapp', 'websocket', 'system_log']).withMessage('Invalid channel'),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        subject,
        body,
        recipient_type,
        recipient_target,
        scheduledAt,
        channel = 'system_log',
        type = 'info',
        priority = 5,
        originDetails = {}
      } = req.body;

      // Validate scheduled time is in the future
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time must be in the future'
        });
      }

      const enrichedOriginDetails = {
        ...originDetails,
        requestedBy: {
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role
        },
        service: 'NotificationAPI'
      };

      const result = await notificationService.sendNotification({
        subject,
        body,
        recipient_type,
        recipient_target,
        channel,
        type,
        priority,
        originDetails: enrichedOriginDetails,
        scheduledAt: scheduledDate,
        immediate: false
      });

      if (result.success) {
        logger.info(`Notification scheduled via API by user ${req.user.username}:`, {
          notificationId: result.notificationId,
          scheduledAt,
          channel
        });

        res.json({
          success: true,
          message: 'Notification scheduled successfully',
          data: {
            notificationId: result.notificationId,
            scheduledAt,
            messageId: result.messageId
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to schedule notification'
        });
      }

    } catch (error) {
      logger.error('Error in schedule notification API:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications/:id
 * Get notification details by ID
 */
router.get('/api/notifications/:id',
  authenticate,
  [
    param('id').isInt().withMessage('Notification ID must be an integer')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      const notification = await notificationService.getNotification(notificationId);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      // Check if user can view this notification (admin or owner)
      const canView = req.user.role === 'admin' || 
                     notification.origin_details?.requestedBy?.userId === req.user.id;

      if (!canView) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: notification
      });

    } catch (error) {
      logger.error('Error getting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications
 * List notifications with pagination and filters
 */
router.get('/api/notifications',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['pending', 'sent', 'failed']).withMessage('Invalid status'),
    query('channel').optional().isIn(['email', 'telegram', 'whatsapp', 'websocket', 'system_log']).withMessage('Invalid channel'),
    query('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Priority must be between 1 and 5')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        channel,
        priority,
        timeframe = '7 days'
      } = req.query;

      const offset = (page - 1) * limit;

      // Build query conditions
      let whereConditions = [`created_at >= NOW() - INTERVAL '${timeframe}'`];
      let queryParams = [];
      let paramIndex = 1;

      // Non-admin users can only see their own notifications
      if (req.user.role !== 'admin') {
        whereConditions.push(`origin_details->>'requestedBy'->>'userId' = $${paramIndex}`);
        queryParams.push(req.user.id.toString());
        paramIndex++;
      }

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      if (channel) {
        whereConditions.push(`channel = $${paramIndex}`);
        queryParams.push(channel);
        paramIndex++;
      }

      if (priority) {
        whereConditions.push(`priority = $${paramIndex}`);
        queryParams.push(priority);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause}`;
      const countResult = await require('../config/db').query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get notifications
      const query = `
        SELECT id, subject, recipient_type, recipient_target, channel, priority, status, 
               attempts, scheduled_at, sent_at, failed_at, error_message, created_at,
               origin_service
        FROM notifications 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(limit, offset);
      const result = await require('../config/db').query(query, queryParams);

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: {
          notifications: result.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Error listing notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications/stats
 * Get notification statistics
 */
router.get('/stats/summary',
  authenticate,
  requireRole(['admin', 'editor']),
  [
    query('timeframe').optional().isIn(['1 hour', '24 hours', '7 days', '30 days']).withMessage('Invalid timeframe')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { timeframe = '24 hours' } = req.query;
      const stats = await notificationService.getNotificationStats(timeframe);

      if (stats.success) {
        res.json({
          success: true,
          data: {
            timeframe,
            stats: stats.stats
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: stats.error || 'Failed to get statistics'
        });
      }

    } catch (error) {
      logger.error('Error getting notification stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications/templates
 * List available notification templates
 */
router.get('/templates/list',
  authenticate,
  async (req, res) => {
    try {
      const result = await require('../config/db').query(`
        SELECT id, name, subject_template, body_template, channels, priority, is_active, created_at
        FROM notification_templates 
        WHERE is_active = true 
        ORDER BY name
      `);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      logger.error('Error getting notification templates:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications/templates/:name
 * Get specific template details
 */
router.get('/templates/:name',
  authenticate,
  [
    param('name').notEmpty().withMessage('Template name is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const template = await notificationService.getTemplate(req.params.name);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      res.json({
        success: true,
        data: template
      });

    } catch (error) {
      logger.error('Error getting notification template:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/notifications/channels
 * List available notification channels
 */
router.get('/channels/list',
  authenticate,
  async (req, res) => {
    try {
      const result = await require('../config/db').query(`
        SELECT name, is_active, rate_limit_per_minute, rate_limit_per_hour, 
               rate_limit_per_day, created_at, updated_at
        FROM notification_channels 
        ORDER BY name
      `);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      logger.error('Error getting notification channels:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

/**
 * PUT /api/notifications/channels/:name
 * Update channel configuration (admin only)
 */
router.put('/channels/:name',
  authenticate,
  requireRole(['admin']),
  [
    param('name').notEmpty().withMessage('Channel name is required'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('rate_limit_per_minute').optional().isInt({ min: 1 }).withMessage('rate_limit_per_minute must be positive integer'),
    body('rate_limit_per_hour').optional().isInt({ min: 1 }).withMessage('rate_limit_per_hour must be positive integer'),
    body('rate_limit_per_day').optional().isInt({ min: 1 }).withMessage('rate_limit_per_day must be positive integer')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const channelName = req.params.name;
      const updates = req.body;

      // Build update query
      const updateFields = [];
      const queryParams = [];
      let paramIndex = 1;

      for (const [field, value] of Object.entries(updates)) {
        if (['is_active', 'rate_limit_per_minute', 'rate_limit_per_hour', 'rate_limit_per_day'].includes(field)) {
          updateFields.push(`${field} = $${paramIndex}`);
          queryParams.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updateFields.push(`updated_at = NOW()`);
      queryParams.push(channelName);

      const query = `
        UPDATE notification_channels 
        SET ${updateFields.join(', ')}
        WHERE name = $${paramIndex}
        RETURNING *
      `;

      const result = await require('../config/db').query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found'
        });
      }

      logger.info(`Channel ${channelName} updated by admin ${req.user.username}:`, updates);

      res.json({
        success: true,
        message: 'Channel updated successfully',
        data: result.rows[0]
      });

    } catch (error) {
      logger.error('Error updating notification channel:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
);

  return router;
};
