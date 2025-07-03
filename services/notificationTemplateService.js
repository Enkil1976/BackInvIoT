const pool = require('../config/db');
const redisClient = require('../config/redis');
const logger = require('../config/logger');
const { toChileISOString } = require('../config/timezone');

/**
 * Notification Template Service
 * Handles dynamic variable replacement in notification messages
 * Supports variables like {temhum1.temperatura}, {calidad_agua.ph}, etc.
 */
class NotificationTemplateService {
  constructor() {
    this.variablePattern = /\{([^}]+)\}/g;
    this.cache = new Map();
    this.cacheExpiry = 30 * 1000; // 30 seconds cache
  }

  /**
   * Process notification message template and replace variables
   * @param {string} template - Message template with variables like {temhum1.temperatura}
   * @param {Object} context - Additional context data
   * @returns {Promise<string>} - Processed message with replaced variables
   */
  async processTemplate(template, context = {}) {
    if (!template || typeof template !== 'string') {
      return template;
    }

    try {
      logger.debug('[NotificationTemplate] Processing template:', template);

      // Find all variables in the template
      const variables = this.extractVariables(template);
      
      if (variables.length === 0) {
        return template;
      }

      // Get values for all variables
      const variableValues = await this.resolveVariables(variables, context);
      
      // Replace variables in template
      let processedMessage = template;
      for (const [variable, value] of Object.entries(variableValues)) {
        const placeholder = `{${variable}}`;
        processedMessage = processedMessage.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
      }

      logger.debug('[NotificationTemplate] Processed message:', processedMessage);
      return processedMessage;

    } catch (error) {
      logger.error('[NotificationTemplate] Error processing template:', error);
      return template; // Return original template if processing fails
    }
  }

  /**
   * Extract all variables from template
   * @param {string} template - Template string
   * @returns {Array<string>} - Array of variable names
   */
  extractVariables(template) {
    const variables = [];
    let match;
    
    while ((match = this.variablePattern.exec(template)) !== null) {
      variables.push(match[1]);
    }
    
    // Reset regex lastIndex
    this.variablePattern.lastIndex = 0;
    
    return [...new Set(variables)]; // Remove duplicates
  }

  /**
   * Resolve variable values from sensor data
   * @param {Array<string>} variables - Array of variable names
   * @param {Object} context - Additional context data
   * @returns {Promise<Object>} - Object with variable values
   */
  async resolveVariables(variables, context = {}) {
    const resolvedValues = {};

    for (const variable of variables) {
      try {
        const value = await this.resolveVariable(variable, context);
        resolvedValues[variable] = value;
      } catch (error) {
        logger.warn(`[NotificationTemplate] Failed to resolve variable {${variable}}:`, error.message);
        resolvedValues[variable] = `{${variable}}`; // Keep original if resolution fails
      }
    }

    return resolvedValues;
  }

  /**
   * Resolve a single variable value
   * @param {string} variable - Variable name (e.g., "temhum1.temperatura")
   * @param {Object} context - Additional context data
   * @returns {Promise<string>} - Resolved value
   */
  async resolveVariable(variable, context = {}) {
    // Check context first
    if (context[variable] !== undefined) {
      return this.formatValue(context[variable]);
    }

    // Parse variable parts
    const parts = variable.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid variable format: ${variable}. Expected format: sensor.field`);
    }

    const [sensorTable, fieldName] = parts;

    // Get sensor data
    const sensorData = await this.getSensorData(sensorTable);
    
    if (!sensorData) {
      throw new Error(`No data found for sensor: ${sensorTable}`);
    }

    if (sensorData[fieldName] === undefined) {
      throw new Error(`Field ${fieldName} not found in sensor ${sensorTable}`);
    }

    return this.formatValue(sensorData[fieldName]);
  }

  /**
   * Get latest sensor data from cache or database
   * @param {string} sensorTable - Sensor table name
   * @returns {Promise<Object|null>} - Sensor data
   */
  async getSensorData(sensorTable) {
    const cacheKey = `sensor_data_${sensorTable}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    let sensorData = null;

    try {
      // Try Redis first (faster)
      const redisKey = `sensor_latest:${sensorTable}`;
      const redisData = await redisClient.hgetall(redisKey);
      
      if (redisData && Object.keys(redisData).length > 0) {
        sensorData = redisData;
        logger.debug(`[NotificationTemplate] Got ${sensorTable} data from Redis`);
      } else {
        // Fallback to database
        sensorData = await this.getSensorDataFromDB(sensorTable);
        logger.debug(`[NotificationTemplate] Got ${sensorTable} data from database`);
      }

      // Cache the result
      if (sensorData) {
        this.cache.set(cacheKey, {
          data: sensorData,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error(`[NotificationTemplate] Error getting sensor data for ${sensorTable}:`, error);
      sensorData = null;
    }

    return sensorData;
  }

  /**
   * Get sensor data from database
   * @param {string} sensorTable - Sensor table name
   * @returns {Promise<Object|null>} - Sensor data
   */
  async getSensorDataFromDB(sensorTable) {
    const validTables = ['temhum1', 'temhum2', 'calidad_agua', 'power_monitor_logs'];
    
    if (!validTables.includes(sensorTable)) {
      throw new Error(`Invalid sensor table: ${sensorTable}`);
    }

    try {
      const query = `SELECT * FROM ${sensorTable} ORDER BY received_at DESC LIMIT 1`;
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`[NotificationTemplate] Database error for ${sensorTable}:`, error);
      return null;
    }
  }

  /**
   * Format value for display
   * @param {*} value - Value to format
   * @returns {string} - Formatted value
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    if (typeof value === 'number') {
      // Format numbers with appropriate decimal places
      if (Number.isInteger(value)) {
        return value.toString();
      } else {
        return value.toFixed(2);
      }
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    if (value instanceof Date) {
      return toChileISOString(value);
    }

    return String(value);
  }

  /**
   * Get available variables for a given sensor configuration
   * @returns {Promise<Object>} - Available variables organized by sensor
   */
  async getAvailableVariables() {
    const variables = {
      temhum1: {
        label: 'Temperatura y Humedad 1',
        fields: {
          temperatura: { label: 'Temperatura', unit: '°C' },
          humedad: { label: 'Humedad', unit: '%' },
          heatindex: { label: 'Índice de Calor', unit: '°C' },
          dewpoint: { label: 'Punto de Rocío', unit: '°C' },
          rssi: { label: 'Señal RSSI', unit: 'dBm' }
        }
      },
      temhum2: {
        label: 'Temperatura y Humedad 2',
        fields: {
          temperatura: { label: 'Temperatura', unit: '°C' },
          humedad: { label: 'Humedad', unit: '%' },
          heatindex: { label: 'Índice de Calor', unit: '°C' },
          dewpoint: { label: 'Punto de Rocío', unit: '°C' },
          rssi: { label: 'Señal RSSI', unit: 'dBm' }
        }
      },
      calidad_agua: {
        label: 'Calidad del Agua',
        fields: {
          ph: { label: 'pH', unit: '' },
          ec: { label: 'Conductividad', unit: 'µS/cm' },
          ppm: { label: 'PPM', unit: 'ppm' },
          temperatura: { label: 'Temperatura del Agua', unit: '°C' },
          rssi: { label: 'Señal RSSI', unit: 'dBm' }
        }
      },
      power_monitor_logs: {
        label: 'Monitor de Energía',
        fields: {
          voltage: { label: 'Voltaje', unit: 'V' },
          current: { label: 'Corriente', unit: 'A' },
          power: { label: 'Potencia', unit: 'W' },
          energy: { label: 'Energía', unit: 'kWh' },
          frequency: { label: 'Frecuencia', unit: 'Hz' },
          power_factor: { label: 'Factor de Potencia', unit: '' }
        }
      }
    };

    return variables;
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.cache.clear();
    logger.debug('[NotificationTemplate] Cache cleared');
  }
}

// Export singleton instance
module.exports = new NotificationTemplateService();