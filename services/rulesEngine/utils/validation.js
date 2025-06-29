const logger = require('../../../config/logger');

/**
 * Validates and parses numeric values with proper error handling
 * @param {*} value - Value to parse
 * @param {string} context - Context for error logging
 * @param {string} ruleName - Rule name for error logging
 * @returns {number|null} Parsed number or null if invalid
 */
function validateAndParseNumeric(value, context, ruleName) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    logger.warn(`${context}: Invalid numeric value '${value}' in ${ruleName}`);
    return null;
  }
  return parsed;
}

/**
 * Validates duration string format and converts to milliseconds
 * @param {string} durationStr - Duration string (e.g., "5m", "1h")
 * @returns {number|null} Duration in milliseconds or null if invalid
 */
function parseDurationToMs(durationStr) {
  if (typeof durationStr !== 'string') return null;
  const match = durationStr.match(/^(\d+)([smh])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    default: return null;
  }
}

/**
 * Validates clause structure based on source type
 * @param {Object} clause - Clause to validate
 * @param {string} ruleId - Rule ID for error logging
 * @returns {boolean} True if valid, false otherwise
 */
function validateClause(clause, ruleId) {
  if (!clause || !clause.source_type) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Invalid clause structure: missing source_type`);
    return false;
  }

  switch (clause.source_type) {
    case 'device':
      return validateDeviceClause(clause, ruleId);
    case 'sensor':
      return validateSensorClause(clause, ruleId);
    case 'time':
      return validateTimeClause(clause, ruleId);
    case 'sensor_history':
      return validateSensorHistoryClause(clause, ruleId);
    case 'sensor_sustained_state':
      return validateSensorSustainedStateClause(clause, ruleId);
    case 'sensor_trend':
      return validateSensorTrendClause(clause, ruleId);
    case 'sensor_heartbeat':
      return validateSensorHeartbeatClause(clause, ruleId);
    default:
      logger.warn(`RulesEngine: Rule ${ruleId} - Unknown source_type: ${clause.source_type}`);
      return false;
  }
}

function validateDeviceClause(clause, ruleId) {
  if (!clause.source_id || !clause.property) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Device clause missing source_id or property`);
    return false;
  }
  if (clause.property === 'status' && !clause.operator) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Device status clause missing operator`);
    return false;
  }
  return true;
}

function validateSensorClause(clause, ruleId) {
  if (!clause.source_id || !clause.metric || !clause.operator) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Sensor clause missing required fields`);
    return false;
  }
  if (clause.value === undefined && !clause.value_from) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Sensor clause missing value or value_from`);
    return false;
  }
  return true;
}

function validateTimeClause(clause, ruleId) {
  if (!clause.condition_type) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Time clause missing condition_type`);
    return false;
  }
  
  switch (clause.condition_type) {
    case 'daily_window':
      if (!clause.after_time || !clause.before_time) {
        logger.warn(`RulesEngine: Rule ${ruleId} - Daily window clause missing time fields`);
        return false;
      }
      break;
    case 'day_of_week':
      if (!Array.isArray(clause.days)) {
        logger.warn(`RulesEngine: Rule ${ruleId} - Day of week clause missing days array`);
        return false;
      }
      break;
    case 'datetime_range':
      if (!clause.after_datetime || !clause.before_datetime) {
        logger.warn(`RulesEngine: Rule ${ruleId} - Datetime range clause missing datetime fields`);
        return false;
      }
      break;
  }
  return true;
}

function validateSensorHistoryClause(clause, ruleId) {
  const required = ['source_id', 'metric', 'aggregator', 'operator'];
  for (const field of required) {
    if (!clause[field]) {
      logger.warn(`RulesEngine: Rule ${ruleId} - Sensor history clause missing ${field}`);
      return false;
    }
  }
  if (!clause.time_window && !clause.samples) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Sensor history clause missing time_window or samples`);
    return false;
  }
  return true;
}

function validateSensorSustainedStateClause(clause, ruleId) {
  const required = ['source_id', 'metric', 'comparison_operator', 'comparison_value', 'operator', 'value'];
  for (const field of required) {
    if (clause[field] === undefined) {
      logger.warn(`RulesEngine: Rule ${ruleId} - Sensor sustained state clause missing ${field}`);
      return false;
    }
  }
  if (!clause.time_window && !clause.samples) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Sensor sustained state clause missing time_window or samples`);
    return false;
  }
  return true;
}

function validateSensorTrendClause(clause, ruleId) {
  const required = ['source_id', 'metric', 'trend_type', 'threshold_change', 'operator', 'value'];
  for (const field of required) {
    if (clause[field] === undefined) {
      logger.warn(`RulesEngine: Rule ${ruleId} - Sensor trend clause missing ${field}`);
      return false;
    }
  }
  if (!clause.time_window && !clause.samples) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Sensor trend clause missing time_window or samples`);
    return false;
  }
  return true;
}

function validateSensorHeartbeatClause(clause, ruleId) {
  const required = ['source_id', 'max_inactivity', 'operator', 'value'];
  for (const field of required) {
    if (clause[field] === undefined) {
      logger.warn(`RulesEngine: Rule ${ruleId} - Sensor heartbeat clause missing ${field}`);
      return false;
    }
  }
  return true;
}

module.exports = {
  validateAndParseNumeric,
  parseDurationToMs,
  validateClause,
  validateDeviceClause,
  validateSensorClause,
  validateTimeClause,
  validateSensorHistoryClause,
  validateSensorSustainedStateClause,
  validateSensorTrendClause,
  validateSensorHeartbeatClause
};
