const logger = require('../config/logger');
const operationService = require('./operationService'); // To log the notification action

let _broadcastWebSocket = null; // Included for consistency, though not used initially

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

    // Future: Implement actual sending mechanisms based on recipient_type
    // e.g., if (recipient_type === 'email') { /* ... send email ... */ }
    // e.g., if (recipient_type === 'user_id' && _broadcastWebSocket) { /* ... send targeted WebSocket ... */ }

    return { success: true, message: `Notification logged for ${recipient_type}: ${recipient_target}` };
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
