const logger = require('../../../config/logger');
const { validateClause } = require('../utils/validation');
const { evaluateDeviceClause } = require('./deviceEvaluator');
const { evaluateSensorClause } = require('./sensorEvaluator');
const { evaluateTimeClause } = require('./timeEvaluator');
const { 
  evaluateSensorHistoryClause,
  evaluateSensorSustainedStateClause,
  evaluateSensorTrendClause,
  evaluateSensorHeartbeatClause
} = require('./historyEvaluator');

/**
 * Main clause evaluator that delegates to specialized evaluators
 * @param {string} ruleId - Rule ID for logging
 * @param {Object} clause - Clause to evaluate
 * @param {Object} contextData - Context data for the rule
 * @returns {Promise<boolean>} Evaluation result
 */
async function evaluateClause(ruleId, clause, contextData) {
  if (!clause || !contextData) {
    logger.warn(`RulesEngine: Rule ${ruleId} - evaluateClause called with invalid clause or contextData`);
    return false;
  }

  // Validate clause structure
  if (!validateClause(clause, ruleId)) {
    return false;
  }

  logger.debug(`RulesEngine: Rule ${ruleId} - Evaluating clause: %j`, clause);

  try {
    switch (clause.source_type) {
      case 'device':
        return await evaluateDeviceClause(ruleId, clause, contextData);
      
      case 'sensor':
        return await evaluateSensorClause(ruleId, clause, contextData);
      
      case 'time':
        return await evaluateTimeClause(ruleId, clause, contextData);
      
      case 'sensor_history':
        return await evaluateSensorHistoryClause(ruleId, clause, contextData);
      
      case 'sensor_sustained_state':
        return await evaluateSensorSustainedStateClause(ruleId, clause, contextData);
      
      case 'sensor_trend':
        return await evaluateSensorTrendClause(ruleId, clause, contextData);
      
      case 'sensor_heartbeat':
        return await evaluateSensorHeartbeatClause(ruleId, clause, contextData);
      
      default:
        logger.warn(`RulesEngine: Unknown or unsupported clause source_type '${clause.source_type}' in rule ${ruleId}`);
        return false;
    }
  } catch (error) {
    logger.error(`RulesEngine: Rule ${ruleId} - Error evaluating clause: ${error.message}`, { 
      stack: error.stack, 
      clause: clause 
    });
    return false;
  }
}

/**
 * Evaluates conditions (can be a single clause or complex AND/OR structure)
 * @param {string} ruleId - Rule ID for logging
 * @param {Object} conditions - Conditions to evaluate
 * @param {Object} contextData - Context data for the rule
 * @returns {Promise<boolean>} Evaluation result
 */
async function areConditionsMet(ruleId, conditions, contextData) {
  if (!conditions) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Evaluating rule with empty or null conditions. Defaulting to false`);
    return false;
  }

  // Single clause
  if (conditions.source_type) {
    return await evaluateClause(ruleId, conditions, contextData);
  }

  // Complex conditions with clauses array
  if (conditions.clauses && Array.isArray(conditions.clauses)) {
    if (conditions.type === 'AND') {
      if (conditions.clauses.length === 0) {
        logger.debug(`RulesEngine: Rule ${ruleId} - Empty AND clause array evaluated as true`);
        return true;
      }
      
      for (const clause of conditions.clauses) {
        if (!(await evaluateClause(ruleId, clause, contextData))) {
          return false;
        }
      }
      return true;
      
    } else if (conditions.type === 'OR') {
      if (conditions.clauses.length === 0) {
        logger.debug(`RulesEngine: Rule ${ruleId} - Empty OR clause array evaluated as false`);
        return false;
      }
      
      for (const clause of conditions.clauses) {
        if (await evaluateClause(ruleId, clause, contextData)) {
          return true;
        }
      }
      return false;
      
    } else {
      logger.warn(`RulesEngine: Rule ${ruleId} - Conditions object has clauses but no valid type (AND/OR): %j`, conditions);
      return false;
    }
  } else {
    logger.warn(`RulesEngine: Rule ${ruleId} - Unknown top-level condition structure: %j`, conditions);
    return false;
  }
}

module.exports = {
  evaluateClause,
  areConditionsMet
};
