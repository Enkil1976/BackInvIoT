const logger = require('../../../config/logger');
const pool = require('../../../config/db');
const redisClient = require('../../../config/redis');
const contextCache = require('./contextCache');
const config = require('../config');

/**
 * Fetches and caches context data for rules
 */
class DataFetcher {
  constructor() {
    this.batchQueries = new Map(); // For batching database queries
  }

  /**
   * Gathers all required context data for a rule
   * @param {Object} rule - Rule object
   * @returns {Promise<Object>} Context data object
   */
  async gatherContextDataForRule(rule) {
    const contextData = {};
    const deviceIds = new Set();
    const sensorIds = new Set();

    // Extract all required IDs from rule conditions
    this.extractRequiredIds(rule.conditions, deviceIds, sensorIds);

    // Batch fetch device data
    if (deviceIds.size > 0) {
      const deviceData = await this.batchFetchDevices(Array.from(deviceIds));
      for (const [deviceId, data] of Object.entries(deviceData)) {
        contextData[`device_${deviceId}`] = data;
      }
    }

    // Batch fetch sensor data
    if (sensorIds.size > 0) {
      const sensorData = await this.batchFetchSensors(Array.from(sensorIds));
      for (const [sensorId, data] of Object.entries(sensorData)) {
        contextData[`sensor_${sensorId}`] = data;
      }
    }

    return contextData;
  }

  /**
   * Recursively extracts device and sensor IDs from rule conditions
   * @param {Object} conditions - Rule conditions
   * @param {Set} deviceIds - Set to collect device IDs
   * @param {Set} sensorIds - Set to collect sensor IDs
   */
  extractRequiredIds(conditions, deviceIds, sensorIds) {
    if (!conditions) return;

    // Single clause
    if (conditions.source_type) {
      this.extractIdsFromClause(conditions, deviceIds, sensorIds);
      return;
    }

    // Complex conditions with clauses array
    if (conditions.clauses && Array.isArray(conditions.clauses)) {
      for (const clause of conditions.clauses) {
        this.extractIdsFromClause(clause, deviceIds, sensorIds);
      }
    }
  }

  /**
   * Extracts IDs from a single clause
   * @param {Object} clause - Single clause
   * @param {Set} deviceIds - Set to collect device IDs
   * @param {Set} sensorIds - Set to collect sensor IDs
   */
  extractIdsFromClause(clause, deviceIds, sensorIds) {
    if (!clause.source_type || !clause.source_id) return;

    switch (clause.source_type) {
      case 'device':
        deviceIds.add(clause.source_id);
        break;
      
      case 'sensor':
      case 'sensor_history':
      case 'sensor_sustained_state':
      case 'sensor_trend':
      case 'sensor_heartbeat':
        sensorIds.add(clause.source_id);
        
        // Check for value_from sensor references
        if (clause.value_from && clause.value_from.source_type === 'sensor' && clause.value_from.source_id) {
          sensorIds.add(clause.value_from.source_id);
        }
        break;
    }
  }

  /**
   * Batch fetches device data with caching
   * @param {Array} deviceIds - Array of device IDs to fetch
   * @returns {Promise<Object>} Object mapping device IDs to their data
   */
  async batchFetchDevices(deviceIds) {
    const result = {};
    const uncachedIds = [];

    // Check cache first
    for (const deviceId of deviceIds) {
      const cacheKey = `device_${deviceId}`;
      if (contextCache.has(cacheKey)) {
        result[deviceId] = contextCache.cache.get(cacheKey);
      } else {
        uncachedIds.push(deviceId);
      }
    }

    // Batch fetch uncached devices
    if (uncachedIds.length > 0) {
      try {
        const query = "SELECT id, name, status, device_id FROM devices WHERE device_id = ANY($1)";
        const dbResult = await pool.query(query, [uncachedIds]);
        
        // Process results
        const deviceMap = new Map();
        for (const row of dbResult.rows) {
          deviceMap.set(row.device_id, row);
        }

        // Cache and add to result
        for (const deviceId of uncachedIds) {
          const deviceData = deviceMap.get(deviceId) || null;
          const cacheKey = `device_${deviceId}`;
          
          contextCache.set(cacheKey, deviceData);
          result[deviceId] = deviceData;
          
          if (!deviceData) {
            logger.warn(`RulesEngine: Device (HW_ID) '${deviceId}' not found in database`);
          }
        }

        logger.debug(`RulesEngine: Batch fetched ${dbResult.rows.length} devices from database`);
      } catch (error) {
        logger.error(`RulesEngine: Error batch fetching devices:`, error);
        
        // Set error state for failed fetches
        for (const deviceId of uncachedIds) {
          result[deviceId] = { error: 'Failed to fetch device data' };
        }
      }
    }

    return result;
  }

  /**
   * Batch fetches sensor data with caching
   * @param {Array} sensorIds - Array of sensor IDs to fetch
   * @returns {Promise<Object>} Object mapping sensor IDs to their data
   */
  async batchFetchSensors(sensorIds) {
    const result = {};
    const uncachedIds = [];

    // Check cache first
    for (const sensorId of sensorIds) {
      const cacheKey = `sensor_${sensorId}`;
      if (contextCache.has(cacheKey)) {
        result[sensorId] = contextCache.cache.get(cacheKey);
      } else {
        uncachedIds.push(sensorId);
      }
    }

    // Batch fetch uncached sensors from Redis
    if (uncachedIds.length > 0) {
      try {
        const pipeline = redisClient.pipeline();
        
        // Add all sensor queries to pipeline
        for (const sensorId of uncachedIds) {
          const redisKey = `sensor_latest:${sensorId}`;
          pipeline.hgetall(redisKey);
        }

        const results = await pipeline.exec();
        
        // Process pipeline results
        for (let i = 0; i < uncachedIds.length; i++) {
          const sensorId = uncachedIds[i];
          const [error, sensorData] = results[i];
          const cacheKey = `sensor_${sensorId}`;
          
          if (error) {
            logger.error(`RulesEngine: Error fetching sensor ${sensorId} from Redis:`, error);
            result[sensorId] = { error: 'Failed to fetch sensor from Redis' };
          } else if (sensorData && Object.keys(sensorData).length > 0) {
            contextCache.set(cacheKey, sensorData);
            result[sensorId] = sensorData;
          } else {
            logger.warn(`RulesEngine: No data found in Redis for sensor '${sensorId}'`);
            contextCache.set(cacheKey, null);
            result[sensorId] = null;
          }
        }

        logger.debug(`RulesEngine: Batch fetched ${uncachedIds.length} sensors from Redis`);
      } catch (error) {
        logger.error(`RulesEngine: Error batch fetching sensors from Redis:`, error);
        
        // Set error state for failed fetches
        for (const sensorId of uncachedIds) {
          result[sensorId] = { error: 'Failed to fetch sensor from Redis' };
        }
      }
    }

    return result;
  }

  /**
   * Fetches device data for a single device (with caching)
   * @param {string} deviceId - Device hardware ID
   * @returns {Promise<Object|null>} Device data or null if not found
   */
  async fetchDeviceData(deviceId) {
    const cacheKey = `device_${deviceId}`;
    
    return await contextCache.get(cacheKey, async () => {
      try {
        const result = await pool.query(
          "SELECT id, name, status, device_id FROM devices WHERE device_id = $1", 
          [deviceId]
        );
        
        if (result.rows.length > 0) {
          logger.debug(`RulesEngine: Fetched device data for ${deviceId}: ${result.rows[0].status}`);
          return result.rows[0];
        } else {
          logger.warn(`RulesEngine: Device (HW_ID) '${deviceId}' not found`);
          return null;
        }
      } catch (error) {
        logger.error(`RulesEngine: Error fetching device ${deviceId}:`, error);
        return { error: 'Failed to fetch device status' };
      }
    });
  }

  /**
   * Fetches sensor data for a single sensor (with caching)
   * @param {string} sensorId - Sensor ID
   * @returns {Promise<Object|null>} Sensor data or null if not found
   */
  async fetchSensorData(sensorId) {
    const cacheKey = `sensor_${sensorId}`;
    
    return await contextCache.get(cacheKey, async () => {
      try {
        const redisKey = `sensor_latest:${sensorId}`;
        const sensorData = await redisClient.hgetall(redisKey);
        
        if (sensorData && Object.keys(sensorData).length > 0) {
          logger.debug(`RulesEngine: Fetched sensor data for ${sensorId}:`, sensorData);
          return sensorData;
        } else {
          logger.warn(`RulesEngine: No data found in Redis for sensor '${sensorId}'`);
          return null;
        }
      } catch (error) {
        logger.error(`RulesEngine: Error fetching sensor data from Redis for '${sensorId}':`, error);
        return { error: 'Failed to fetch sensor from Redis' };
      }
    });
  }

  /**
   * Clears all cached data
   */
  clearCache() {
    contextCache.clear();
    logger.info('RulesEngine: Context data cache cleared');
  }

  /**
   * Gets cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return contextCache.getStats();
  }
}

// Create singleton instance
const dataFetcher = new DataFetcher();

module.exports = dataFetcher;
