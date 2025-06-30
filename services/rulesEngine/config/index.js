/**
 * Configuration module for Rules Engine
 * Centralizes all configuration values and environment variables
 */

const config = {
  // Sensor history configuration
  SENSOR_HISTORY_MAX_LENGTH: parseInt(process.env.SENSOR_HISTORY_MAX_LENGTH, 10) || 100,
  
  // Cache configuration
  CONTEXT_CACHE_TTL_MS: parseInt(process.env.CONTEXT_CACHE_TTL_MS, 10) || 30000, // 30 seconds
  CONTEXT_CACHE_MAX_SIZE: parseInt(process.env.CONTEXT_CACHE_MAX_SIZE, 10) || 1000,
  
  // Rules engine timing
  EVALUATION_INTERVAL: process.env.RULES_EVALUATION_INTERVAL || '*/30 * * * * *', // 30 seconds
  EVALUATION_TIMEZONE: process.env.RULES_EVALUATION_TIMEZONE || 'Etc/UTC',
  
  // Performance settings
  MAX_CONCURRENT_RULES: parseInt(process.env.MAX_CONCURRENT_RULES, 10) || 50,
  BATCH_QUERY_SIZE: parseInt(process.env.BATCH_QUERY_SIZE, 10) || 100,
  
  // Validation settings
  MAX_CLAUSE_DEPTH: parseInt(process.env.MAX_CLAUSE_DEPTH, 10) || 10,
  MAX_CONDITIONS_PER_RULE: parseInt(process.env.MAX_CONDITIONS_PER_RULE, 10) || 100
};

module.exports = config;
