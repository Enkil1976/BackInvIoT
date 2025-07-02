const logger = require('../config/logger');
const operationService = require('./operationService');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
let _broadcastWebSocket = null;

/**
 * Initializes the NotificationService with dependencies.
 * @param {object} dependencies - Object containing dependencies like broadcastWebSocket.
 */
function initNotificationService(dependencies) {
  if (dependencies && dependencies.broadcastWebSocket) {
    _broadcastWebSocket = dependencies.broadcastWebSocket;
    // logger.info('NotificationService initialized with broadcastWebSocket capability.');
  } else {
    // logger.warn('NotificationService initialized WITHOUT broadcastWebSocket capability.');
  }
  logger.info('NotificationService initialized.'); // General init log
}

/**
 * Sends a notification (currently logs it and records an operation).
 * @param {object} params
 * @param {string} params.subject - Subject of the notification.
 * @param {string} params.body - Body/content of the notification.
 * @param {string} params.recipient_type - Type of recipient (e.g., 'email', 'system_log', 'user_id').
 * @param {string} params.recipient_target - Specific target (e.g., email address, log category, user ID).
 * @param {string} [params.type='info'] - Type of notification (e.g., 'info', 'alert', 'warning', 'error').
 * @param {object} [params.originDetails={}] - Optional details about the origin of the notification (e.g., ruleId, scheduleId)
 */
async function sendNotification({
  subject,
  body,
  recipient_type,
  recipient_target,
  type = 'info',
  originDetails = {} // e.g. { ruleId: 'xyz', scheduleId: 123 }
}) {
  if (!subject || !body || !recipient_type || !recipient_target) {
    const errorMsg = 'Missing required fields for sendNotification: subject, body, recipient_type, and recipient_target are required.';
    logger.error(`NotificationService: ${errorMsg}`, { subject, body, recipient_type, recipient_target, type });
    // Optionally throw an error if this is called directly and needs strictness
    // For now, just log and record a failure, as it might be called by worker from queue
    await operationService.recordOperation({
        serviceName: 'NotificationService',
        action: 'send_notification_attempt',
        status: 'FAILURE',
        details: { error: errorMsg, subject, body, recipient_type, recipient_target, type, originDetails }
    }).catch(opErr => logger.error('NotificationService: Failed to record FAILED notification attempt:', opErr));
    return { success: false, message: errorMsg };
  }

  // Log the notification action
  logger.info(`NotificationService: [${type.toUpperCase()}] To: ${recipient_type} (\`${recipient_target}\`) - Subject: "${subject}" - Body: "${body.substring(0, 100)}..."`, { originDetails });

  try {
    // Record the successful logging of the notification as an operation
    await operationService.recordOperation({
      serviceName: 'NotificationService',
      action: 'notification_sent_log', // Indicates it was logged, not necessarily externally sent
      status: 'SUCCESS',
      targetEntityType: recipient_type,
      targetEntityId: recipient_target.toString(), // Ensure it's a string
      details: { subject, body, type, originDetails }
    });

    // Send notification through configured channels
    let actualDeliveryStatus = 'logged';
    
    // Get channel configuration if specified
    const channelName = originDetails.channel || 'system_log';
    
    try {
      const channelResult = await pool.query(
        'SELECT webhook_url, auth_token, payload_template FROM notification_channels WHERE name = $1 AND is_active = true',
        [channelName]
      );
      
      if (channelResult.rows.length > 0 && channelResult.rows[0].webhook_url) {
        const channel = channelResult.rows[0];
        
        // Check if we have a notification payload in the body (for rules engine alerts)
        let payload;
        try {
          const bodyObj = JSON.parse(body);
          if (bodyObj && bodyObj.usuario && bodyObj.canal && bodyObj.mensaje) {
            // This is a rules engine alert, use the specific format for n8n
            payload = bodyObj;
            logger.info(`NotificationService: Using rules engine alert format for ${channelName}:`, payload);
          } else {
            throw new Error('Not a rules engine alert format');
          }
        } catch (parseError) {
          // Fallback to template-based payload replacement
          let payloadStr = JSON.stringify(channel.payload_template)
            .replace(/{{recipient_target}}/g, recipient_target)
            .replace(/{{subject}}/g, subject)
            .replace(/{{body}}/g, body);
          
          // Check if priority is defined before using it
          if (typeof priority !== 'undefined') {
            payloadStr = payloadStr.replace(/{{priority}}/g, priority.toString());
          }
          
          payload = JSON.parse(payloadStr);
        }
        
        logger.info(`NotificationService: Sending to ${channelName} webhook: ${channel.webhook_url}`);
        
        // Send to n8n webhook
        const fetch = require('node-fetch');
        
        // Generate JWT token for n8n webhook authentication
        const webhookToken = jwt.sign(
          { 
            service: 'notification_service',
            channel: channelName,
            timestamp: Date.now()
          }, 
          JWT_SECRET, 
          { 
            expiresIn: '5m' // Token válido por 5 minutos
          }
        );
        
        const response = await fetch(channel.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${webhookToken}`
          },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          actualDeliveryStatus = `sent_${channelName}`;
          const responseText = await response.text();
          logger.info(`NotificationService: Successfully sent ${channelName} notification via webhook. Response: ${responseText}`);
        } else {
          const errorText = await response.text();
          logger.error(`NotificationService: Webhook failed for ${channelName}: ${response.status} ${response.statusText}. Response: ${errorText}`);
          actualDeliveryStatus = `failed_${channelName}`;
        }
      } else {
        logger.info(`NotificationService: No active webhook configured for channel: ${channelName}`);
      }
    } catch (webhookError) {
      logger.error(`NotificationService: Error sending webhook for ${channelName}:`, webhookError.message);
      logger.error(`NotificationService: Full error details:`, webhookError);
      actualDeliveryStatus = `error_${channelName}`;
    }

    return { success: true, message: `Notification ${actualDeliveryStatus} for ${recipient_type}: ${recipient_target}` };
  } catch (error) {
    logger.error('NotificationService: Error during sendNotification processing (e.g., logging operation):', error);
    // Return failure if logging operation fails, as it's part of its current core job
    return { success: false, message: `Error during notification processing: ${error.message}` };
  }
}

module.exports = {
  initNotificationService,
  sendNotification,
};
