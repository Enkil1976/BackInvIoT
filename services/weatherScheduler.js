const cron = require('node-cron');
const weatherService = require('./weatherService');
const logger = require('../config/logger');
const { toChileLogString } = require('../config/timezone');

/**
 * Weather Scheduler Service
 * Manages automated weather data collection using cron jobs
 */
class WeatherScheduler {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastCollectionTime = null;
    this.collectionCount = 0;
    this.errorCount = 0;
    
    // Default schedule: every hour at minute 0
    this.schedule = process.env.WEATHER_CRON_SCHEDULE || '0 * * * *';
    
    logger.info(`[WeatherScheduler] Initialized with schedule: ${this.schedule}`);
  }

  /**
   * Start the weather data collection scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn('[WeatherScheduler] Scheduler is already running');
      return;
    }

    if (!weatherService.isConfigured()) {
      logger.warn('[WeatherScheduler] Weather service not configured, scheduler disabled');
      return;
    }

    try {
      this.cronJob = cron.schedule(this.schedule, async () => {
        await this.collectWeatherData();
      }, {
        scheduled: false,
        timezone: 'America/Santiago' // Use Chile timezone for scheduling
      });

      this.cronJob.start();
      this.isRunning = true;
      
      logger.info(`[WeatherScheduler] Started successfully at ${toChileLogString()}`);
      logger.info(`[WeatherScheduler] Next collection scheduled according to: ${this.schedule}`);
      
      // Optionally collect data immediately when starting
      if (process.env.WEATHER_COLLECT_ON_START === 'true') {
        setTimeout(() => {
          this.collectWeatherData();
        }, 5000); // Wait 5 seconds after startup
      }
      
    } catch (error) {
      logger.error('[WeatherScheduler] Failed to start scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop the weather data collection scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[WeatherScheduler] Scheduler is not running');
      return;
    }

    try {
      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob.destroy();
        this.cronJob = null;
      }
      
      this.isRunning = false;
      logger.info(`[WeatherScheduler] Stopped at ${toChileLogString()}`);
    } catch (error) {
      logger.error('[WeatherScheduler] Error stopping scheduler:', error);
    }
  }

  /**
   * Collect weather data and store in database
   */
  async collectWeatherData() {
    const startTime = Date.now();
    
    try {
      logger.info(`[WeatherScheduler] Starting scheduled weather collection at ${toChileLogString()}`);
      
      if (!weatherService.isConfigured()) {
        logger.error('[WeatherScheduler] Weather service not configured');
        this.errorCount++;
        return;
      }

      // Collect and save weather data
      const savedData = await weatherService.saveCurrentWeatherToDB();
      
      this.lastCollectionTime = new Date();
      this.collectionCount++;
      
      const duration = Date.now() - startTime;
      
      logger.info(`[WeatherScheduler] Successfully collected weather data`, {
        id: savedData.id,
        location: savedData.location_name || 'Unknown',
        temperature: savedData.temperatura,
        humidity: savedData.humedad,
        duration: `${duration}ms`,
        totalCollections: this.collectionCount
      });

      // Reset error count on successful collection
      if (this.errorCount > 0) {
        logger.info(`[WeatherScheduler] Error count reset after successful collection`);
        this.errorCount = 0;
      }

    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      
      logger.error(`[WeatherScheduler] Failed to collect weather data`, {
        error: error.message,
        duration: `${duration}ms`,
        errorCount: this.errorCount,
        totalCollections: this.collectionCount
      });

      // If too many consecutive errors, consider stopping the scheduler
      if (this.errorCount >= 5) {
        logger.error(`[WeatherScheduler] Too many consecutive errors (${this.errorCount}), stopping scheduler`);
        this.stop();
      }
    }
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isConfigured: weatherService.isConfigured(),
      schedule: this.schedule,
      lastCollectionTime: this.lastCollectionTime,
      collectionCount: this.collectionCount,
      errorCount: this.errorCount,
      nextRun: this.cronJob && this.isRunning ? 'Scheduled' : 'N/A',
      serviceInfo: weatherService.getServiceInfo()
    };
  }

  /**
   * Update scheduler configuration
   */
  updateSchedule(newSchedule) {
    if (!cron.validate(newSchedule)) {
      throw new Error(`Invalid cron schedule: ${newSchedule}`);
    }

    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }
    
    this.schedule = newSchedule;
    logger.info(`[WeatherScheduler] Schedule updated to: ${newSchedule}`);
    
    if (wasRunning) {
      this.start();
    }
  }

  /**
   * Force immediate weather collection (manual trigger)
   */
  async triggerCollection() {
    logger.info('[WeatherScheduler] Manual weather collection triggered');
    await this.collectWeatherData();
  }
}

// Create and export singleton instance
const weatherScheduler = new WeatherScheduler();

module.exports = weatherScheduler;