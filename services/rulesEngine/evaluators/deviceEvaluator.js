const logger = require('../../../config/logger');
const { validateAndParseNumeric } = require('../utils/validation');

/**
 * Evaluates device-related clauses
 * @param {string} ruleId - Rule ID for logging
 * @param {Object} clause - Device clause to evaluate
 * @param {Object} contextData - Context data for the rule
 * @returns {Promise<boolean>} Evaluation result
 */
async function evaluateDeviceClause(ruleId, clause, contextData) {
  if (clause.source_type !== 'device' || !clause.source_id || clause.property !== 'status') {
    logger.warn(`RulesEngine: Rule ${ruleId} - Invalid device clause structure`);
    return false;
  }

  const deviceContextKey = `device_${clause.source_id}`;
  const deviceState = contextData[deviceContextKey];

  if (deviceState === undefined || deviceState === null || deviceState.error) {
    logger.debug(`RulesEngine: Rule ${ruleId} - No valid data for device ${clause.source_id} in context`);
    return false;
  }

  if (deviceState.status === undefined) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Device status is undefined for ${clause.source_id}`);
    return false;
  }

  const actualDeviceStatus = deviceState.status;
  let expectedDeviceStatus;

  // Handle value_from sensor comparison
  if (clause.value_from && typeof clause.value_from === 'object' && 
      clause.value_from.source_type === 'sensor' && clause.value_from.source_id && clause.value_from.metric) {
    const compSensorKey = `sensor_${clause.value_from.source_id}`;
    const compSensorData = contextData[compSensorKey];
    
    if (compSensorData && compSensorData[clause.value_from.metric] !== undefined) {
      expectedDeviceStatus = compSensorData[clause.value_from.metric];
    } else {
      logger.warn(`RulesEngine: Rule ${ruleId}, value_from sensor data for ${compSensorKey}.${clause.value_from.metric} not found`);
      return false;
    }
  } else {
    expectedDeviceStatus = clause.value;
  }

  logger.debug(`RulesEngine: Device Eval: Rule ${ruleId} - Device ${clause.source_id} status is '${actualDeviceStatus}', rule expects operator '${clause.operator}' with value '${expectedDeviceStatus}'`);

  return evaluateComparison(actualDeviceStatus, clause.operator, expectedDeviceStatus, ruleId);
}

/**
 * Evaluates comparison operations for device status
 * @param {*} actual - Actual value
 * @param {string} operator - Comparison operator
 * @param {*} expected - Expected value
 * @param {string} ruleId - Rule ID for logging
 * @returns {boolean} Comparison result
 */
function evaluateComparison(actual, operator, expected, ruleId) {
  switch (operator) {
    case '==':
    case '===':
      return actual === expected;
    case '!=':
    case '!==':
      return actual !== expected;
    default:
      logger.warn(`RulesEngine: Unsupported operator '${operator}' for device status in rule ${ruleId}`);
      return false;
  }
}

module.exports = {
  evaluateDeviceClause
};
