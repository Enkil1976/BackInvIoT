const Redis = require('ioredis');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');
const operationService = require('../services/operationService');

// Redis client for the worker
const workerRedisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USER,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Queue configuration
const PRIORITY_QUEUES = {
  1: 'notification_critical',
  2: 'notification_high', 
  3: 'notification_medium',
  4: 'notification_low',
  5: 'notification_background'
};

const CONSUMER_GROUP_NAME = 'notification_workers';
const CONSUMER_NAME = `notification_worker_${process.pid}_${Date.now()}`;

let isShuttingDown = false;
let workerLoopPromise = null;
let processingIntervalId = null;

/**
 * Initialize consumer groups for all priority queues
 */
async function initializeConsumerGroups() {
  try {
    for (const [priority, queueName] of Object.entries(PRIORITY_QUEUES)) {
      try {
        await workerRedisClient.xgroup('CREATE', queueName, CONSUMER_GROUP_NAME, '$', 'MKSTREAM');
        logger.info(`NotificationWorker: Consumer group '${CONSUMER_GROUP_NAME}' created for queue '${queueName}'`);
      } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
          logger.info(`NotificationWorker: Consumer group '${CONSUMER_GROUP_NAME}' already exists for queue '${queueName}'`);
        } else {
          logger.error(`NotificationWorker: Error creating consumer group for queue '${queueName}':`, error);
        }
      }
    }
  } catch (error) {
    logger.error('NotificationWorker: Error initializing consumer groups:', error);
    throw error;
  }
}

/**
 * Process a notification message from queue
 */
async function processNotificationMessage(queueName, messageId, messageData) {
  try {
    logger.info(`NotificationWorker: Processing notification message ${messageId} from ${queueName}`);
    
    const notificationData = JSON.parse(messageData.notification_data);
    const notificationId = notificationData.notificationId;
    
    if (!notificationId) {
      throw new Error('Missing notificationId in message data');
    }
    
    // Check if notification is ready to be processed (scheduled time)
    const notification = await notificationService.getNotification(notificationId);
    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }
    
    const now = new Date();
    const scheduledAt = new Date(notification.scheduled_at);
    
    if (scheduledAt > now) {
      logger.info(`NotificationWorker: Notification ${notificationId} scheduled for future (${scheduledAt}), requeueing`);
      
      // Calculate delay and requeue
      const delayMs = scheduledAt.getTime() - now.getTime();
      const delayMinutes = Math.ceil(delayMs / 60000);
      
      // Requeue with delay (simplified approach - in production might use Redis delayed queues)
      setTimeout(async () => {
        try {
          await notificationService.queueNotification(notificationData);
          logger.info(`NotificationWorker: Notification ${notificationId} requeued after delay`);
        } catch (error) {
          logger.error(`NotificationWorker: Error requeueing notification ${notificationId}:`, error);
        }
      }, Math.min(delayMs, 300000)); // Max 5 minutes delay for this approach
      
      return { success: true, requeued: true, delay: delayMinutes };
    }
    
    // Process the notification
    const result = await notificationService.processNotification(notificationId);
    
    if (result.success) {
      logger.info(`NotificationWorker: Successfully processed notification ${notificationId}`);
      
      // Acknowledge the message
      await workerRedisClient.xack(queueName, CONSUMER_GROUP_NAME, messageId);
      
      // Record successful processing
      await operationService.recordOperation({
        serviceName: 'NotificationWorker',
        action: 'notification_processed',
        status: 'SUCCESS',
        targetEntityType: 'notification',
        targetEntityId: notificationId.toString(),
        details: { messageId, queueName, result }
      });
      
      return { success: true, processed: true };
      
    } else {
      logger.warn(`NotificationWorker: Failed to process notification ${notificationId}:`, result);
      
      if (result.reason === 'rate_limited' && result.rescheduled) {
        // Rate limited and rescheduled, acknowledge message
        await workerRedisClient.xack(queueName, CONSUMER_GROUP_NAME, messageId);
        logger.info(`NotificationWorker: Notification ${notificationId} rate limited and rescheduled, message acknowledged`);
        return { success: true, rateLimited: true };
      } else {
        // Other failures - don't acknowledge, let it retry or go to DLQ
        logger.error(`NotificationWorker: Notification ${notificationId} processing failed permanently`);
        
        // Record failed processing
        await operationService.recordOperation({
          serviceName: 'NotificationWorker',
          action: 'notification_processing_failed',
          status: 'FAILURE',
          targetEntityType: 'notification',
          targetEntityId: notificationId.toString(),
          details: { messageId, queueName, error: result.error, attempts: result.attempts }
        });
        
        return { success: false, error: result.error };
      }
    }
    
  } catch (error) {
    logger.error(`NotificationWorker: Error processing message ${messageId}:`, error);
    
    // Don't acknowledge on error - let message be retried
    await operationService.recordOperation({
      serviceName: 'NotificationWorker',
      action: 'notification_worker_error',
      status: 'FAILURE',
      details: { messageId, queueName, error: error.message }
    });
    
    return { success: false, error: error.message };
  }
}

/**
 * Process pending notifications from database (fallback mechanism)
 */
async function processPendingNotifications() {
  try {
    // Get notifications that are ready to be processed but might have been missed
    const pendingResult = await require('../config/db').query(`
      SELECT id FROM notifications 
      WHERE status = 'pending' 
      AND scheduled_at <= NOW() 
      AND attempts < max_attempts
      ORDER BY priority ASC, created_at ASC
      LIMIT 10
    `);
    
    if (pendingResult.rows.length > 0) {
      logger.info(`NotificationWorker: Found ${pendingResult.rows.length} pending notifications to process`);
      
      for (const row of pendingResult.rows) {
        try {
          const result = await notificationService.processNotification(row.id);
          if (result.success) {
            logger.info(`NotificationWorker: Successfully processed pending notification ${row.id}`);
          } else {
            logger.warn(`NotificationWorker: Failed to process pending notification ${row.id}:`, result);
          }
        } catch (error) {
          logger.error(`NotificationWorker: Error processing pending notification ${row.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('NotificationWorker: Error processing pending notifications:', error);
  }
}

/**
 * Worker loop to process messages from priority queues
 */
async function workerLoop() {
  logger.info('NotificationWorker: Starting worker loop');
  
  while (!isShuttingDown) {
    try {
      // Process queues in priority order (1=critical, 5=background)
      let messageProcessed = false;
      
      for (let priority = 1; priority <= 5; priority++) {
        if (isShuttingDown) break;
        
        const queueName = PRIORITY_QUEUES[priority];
        
        try {
          const response = await workerRedisClient.xreadgroup(
            'GROUP', CONSUMER_GROUP_NAME, CONSUMER_NAME,
            'COUNT', 1, 'BLOCK', 1000, // 1 second block
            'STREAMS', queueName, '>'
          );
          
          if (response && response.length > 0 && response[0][1] && response[0][1].length > 0) {
            const messages = response[0][1];
            
            for (const [messageId, messageFieldsArray] of messages) {
              const messageData = {};
              for (let i = 0; i < messageFieldsArray.length; i += 2) {
                messageData[messageFieldsArray[i]] = messageFieldsArray[i + 1];
              }
              
              const result = await processNotificationMessage(queueName, messageId, messageData);
              messageProcessed = true;
              
              if (result.success && !result.requeued && !result.rateLimited) {
                logger.debug(`NotificationWorker: Message ${messageId} processed successfully`);
              }
            }
          }
          
        } catch (queueError) {
          if (!queueError.message.includes('NOGROUP')) {
            logger.error(`NotificationWorker: Error reading from queue ${queueName}:`, queueError);
          }
        }
      }
      
      // If no messages were processed, wait a bit longer
      if (!messageProcessed && !isShuttingDown) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      if (isShuttingDown && (error.message.includes('Connection is closed') || error.message.includes('Redis server is shutting down'))) {
        logger.info('NotificationWorker: Redis connection closed during shutdown');
        break;
      }
      
      logger.error('NotificationWorker: Error in worker loop:', error);
      
      if (!isShuttingDown) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  logger.info('NotificationWorker: Worker loop has exited');
}

/**
 * Start the notification worker
 */
async function startWorker() {
  if (workerLoopPromise) {
    logger.warn('NotificationWorker: Worker already started');
    return;
  }
  
  try {
    logger.info('NotificationWorker: Starting notification worker...');
    
    isShuttingDown = false;
    
    // Initialize consumer groups
    await initializeConsumerGroups();
    
    // Start the main worker loop
    workerLoopPromise = workerLoop();
    
    // Start periodic processing of pending notifications (every 2 minutes)
    processingIntervalId = setInterval(processPendingNotifications, 120000);
    
    logger.info('✅ NotificationWorker: Notification worker started successfully');
    
  } catch (error) {
    logger.error('NotificationWorker: Failed to start worker:', error);
    throw error;
  }
}

/**
 * Stop the notification worker
 */
async function stopWorker() {
  if (isShuttingDown && !workerLoopPromise && !processingIntervalId) {
    logger.info('NotificationWorker: Already shut down');
    return;
  }
  
  logger.info('NotificationWorker: Initiating shutdown...');
  isShuttingDown = true;
  
  // Clear the pending notifications interval
  if (processingIntervalId) {
    clearInterval(processingIntervalId);
    processingIntervalId = null;
    logger.info('NotificationWorker: Pending notifications processing interval cleared');
  }
  
  // Close Redis connection
  if (workerRedisClient && (workerRedisClient.status === 'ready' || workerRedisClient.status === 'connecting')) {
    logger.info('NotificationWorker: Closing Redis connection...');
    try {
      await workerRedisClient.quit();
      logger.info('NotificationWorker: Redis connection closed gracefully');
    } catch (error) {
      logger.error('NotificationWorker: Error closing Redis connection:', error);
      workerRedisClient.disconnect();
    }
  }
  
  // Wait for worker loop to complete
  if (workerLoopPromise) {
    logger.info('NotificationWorker: Waiting for worker loop to complete...');
    try {
      await workerLoopPromise;
      logger.info('NotificationWorker: Worker loop completed');
    } catch (error) {
      logger.error('NotificationWorker: Error during worker loop completion:', error);
    }
  }
  
  workerLoopPromise = null;
  logger.info('✅ NotificationWorker: Shutdown completed');
}

/**
 * Get worker statistics
 */
async function getWorkerStats() {
  try {
    const stats = {
      isRunning: !isShuttingDown && !!workerLoopPromise,
      consumerName: CONSUMER_NAME,
      queues: {}
    };
    
    // Get queue lengths
    for (const [priority, queueName] of Object.entries(PRIORITY_QUEUES)) {
      try {
        const length = await workerRedisClient.xlen(queueName);
        const pending = await workerRedisClient.xpending(queueName, CONSUMER_GROUP_NAME);
        
        stats.queues[queueName] = {
          priority: parseInt(priority),
          length,
          pending: pending[0] || 0
        };
      } catch (error) {
        stats.queues[queueName] = {
          priority: parseInt(priority),
          error: error.message
        };
      }
    }
    
    return stats;
  } catch (error) {
    logger.error('NotificationWorker: Error getting worker stats:', error);
    return { error: error.message };
  }
}

module.exports = {
  startWorker,
  stopWorker,
  getWorkerStats,
  processPendingNotifications
};

// For standalone execution
if (require.main === module) {
  logger.info('NotificationWorker: Starting as standalone process');
  
  startWorker().catch(error => {
    logger.error('NotificationWorker: Failed to start standalone worker:', error);
    process.exit(1);
  });
  
  process.on('SIGINT', async () => {
    logger.info('NotificationWorker: SIGINT received');
    await stopWorker();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('NotificationWorker: SIGTERM received');
    await stopWorker();
    process.exit(0);
  });
}
