const cron = require('node-cron');
const pool = require('../config/db');
const logger = require('../config/logger');
const redisClient = require('../config/redis'); // Import Redis client
const { app } = require('../server'); // For WebSocket broadcasts
// const deviceService = require('./deviceService'); // Actions will be queued or handled by other services
const operationService = require('./operationService'); // For logging direct actions or queueing outcomes
const { publishCriticalAction } = require('./queueService'); // For publishing actions to queue

let rulesEngineJob;

// Helper function to evaluate a single condition clause
async function evaluateClause(ruleId, clause, contextDataForRule) {
  if (!clause || !contextDataForRule) {
    logger.warn(`RulesEngine: Rule ${ruleId} - evaluateClause called with invalid clause or contextData.`);
    return false;
  }
  logger.debug(`RulesEngine: Rule ${ruleId} - Evaluating clause: %j`, clause);

  if (clause.source_type === 'device' && clause.source_id && clause.property === 'status') {
    const deviceContextKey = `device_${clause.source_id}`;
    const deviceState = contextDataForRule[deviceContextKey];

    if (deviceState === undefined || deviceState === null || deviceState.error ) {
      logger.debug(`RulesEngine: Rule ${ruleId} - No valid data for device ${clause.source_id} in context for clause. Context: %j`, contextDataForRule);
      return false;
    }
     if (deviceState.status === undefined) {
       logger.warn(`RulesEngine: Rule ${ruleId} - Device status is undefined for ${clause.source_id} in context. Context: %j`, contextDataForRule);
       return false;
    }
    const actualDeviceStatus = deviceState.status;
    const expectedDeviceStatus = clause.value;
    logger.debug(`RulesEngine: Device Eval: Rule ${ruleId} - Device ${clause.source_id} status is '${actualDeviceStatus}', rule expects operator '${clause.operator}' with value '${expectedDeviceStatus}'`);
    switch (clause.operator) {
      case '==': case '===': return actualDeviceStatus === expectedDeviceStatus;
      case '!=': case '!==': return actualDeviceStatus !== expectedDeviceStatus;
      default:
        logger.warn(`RulesEngine: Unsupported operator '${clause.operator}' for device status in rule ${ruleId}. Clause: %j`, clause);
        return false;
    }

  } else if (clause.source_type === 'sensor' && clause.source_id && clause.metric && clause.operator && clause.value !== undefined) {
    const sensorContextKey = `sensor_${clause.source_id}`;
    const sensorData = contextDataForRule[sensorContextKey];

    if (sensorData === undefined || sensorData === null || sensorData.error) {
      logger.debug(`RulesEngine: Rule ${ruleId} - No valid data for sensor '${clause.source_id}' in context. Context: %j`, contextDataForRule);
      return false;
    }
    if (sensorData[clause.metric] === undefined) {
      logger.warn(`RulesEngine: Rule ${ruleId} - Metric '${clause.metric}' not found for sensor '${clause.source_id}' in context. Data: %j`, sensorData);
      return false;
    }

    const actualValueStr = sensorData[clause.metric];
    const actualValueNum = parseFloat(actualValueStr);
    const expectedValueNum = parseFloat(clause.value);

    if (isNaN(actualValueNum)) {
        logger.warn(`RulesEngine: Rule ${ruleId} - Actual sensor value '${actualValueStr}' for ${clause.source_id}.${clause.metric} is not a number.`);
        return false;
    }
    if (isNaN(expectedValueNum)) {
        logger.warn(`RulesEngine: Rule ${ruleId} - Expected value '${clause.value}' in rule for ${clause.source_id}.${clause.metric} is not a number.`);
        return false;
    }

    logger.debug(`RulesEngine: Sensor Eval: Rule ${ruleId} - Sensor ${clause.source_id}.${clause.metric} is ${actualValueNum}, rule expects operator '${clause.operator}' with value ${expectedValueNum}`);

    switch (clause.operator) {
      case '>': return actualValueNum > expectedValueNum;
      case '<': return actualValueNum < expectedValueNum;
      case '>=': return actualValueNum >= expectedValueNum;
      case '<=': return actualValueNum <= expectedValueNum;
      case '==': case '===': return actualValueNum === expectedValueNum;
      case '!=': case '!==': return actualValueNum !== expectedValueNum;
      default:
        logger.warn(`RulesEngine: Unsupported operator '${clause.operator}' for sensor metric in rule ${ruleId}. Clause: %j`, clause);
        return false;
    }
  } else if (clause.source_type === 'time') {
    if (!clause.condition_type) {
      logger.warn(`RulesEngine: Rule ${ruleId}, time condition missing 'condition_type'. Clause: %j`, clause);
      return false;
    }
    const now = new Date(); // Current time for evaluation
    switch (clause.condition_type) {
      case 'daily_window':
        if (!clause.after_time || !clause.before_time || typeof clause.after_time !== 'string' || typeof clause.before_time !== 'string') {
          logger.warn(`RulesEngine: Rule ${ruleId}, daily_window condition missing or invalid after_time/before_time. Clause: %j`, clause);
          return false;
        }
        const hours = ('0' + now.getUTCHours()).slice(-2);
        const minutes = ('0' + now.getUTCMinutes()).slice(-2);
        const seconds = ('0' + now.getUTCSeconds()).slice(-2);
        const currentTimeStr = `${hours}:${minutes}:${seconds}`; // Format HH:MM:SS

        logger.debug(`RulesEngine: Rule ${ruleId}, daily_window check: CurrentTimeUTC='${currentTimeStr}', After='${clause.after_time}', Before='${clause.before_time}'`);

        if (clause.after_time > clause.before_time) { // Spans midnight (e.g., 22:00 to 05:00)
          return (currentTimeStr >= clause.after_time || currentTimeStr < clause.before_time);
        } else { // Same day window (e.g., 09:00 to 17:00)
          return (currentTimeStr >= clause.after_time && currentTimeStr < clause.before_time);
        }

      case 'day_of_week':
        if (!Array.isArray(clause.days) || clause.days.some(d => typeof d !== 'number' || d < 0 || d > 6)) {
          logger.warn(`RulesEngine: Rule ${ruleId}, day_of_week condition 'days' is not a valid array of numbers (0-6). Clause: %j`, clause);
          return false;
        }
        const currentUTCDay = now.getUTCDay(); // Sunday=0, Monday=1,... Saturday=6
        logger.debug(`RulesEngine: Rule ${ruleId}, day_of_week check: CurrentUTCDay='${currentUTCDay}', AllowedDays='${JSON.stringify(clause.days)}'`);
        return clause.days.includes(currentUTCDay);

      case 'datetime_range':
        if (!clause.after_datetime || !clause.before_datetime) {
          logger.warn(`RulesEngine: Rule ${ruleId}, datetime_range condition missing after_datetime or before_datetime. Clause: %j`, clause);
          return false;
        }
        const afterDatetime = new Date(clause.after_datetime);
        const beforeDatetime = new Date(clause.before_datetime);

        if (isNaN(afterDatetime.getTime()) || isNaN(beforeDatetime.getTime())) {
          logger.warn(`RulesEngine: Rule ${ruleId}, datetime_range condition has invalid date strings. After='${clause.after_datetime}', Before='${clause.before_datetime}'. Clause: %j`, clause);
          return false;
        }
        logger.debug(`RulesEngine: Rule ${ruleId}, datetime_range check: CurrentUTCDateTime='${now.toISOString()}', After='${afterDatetime.toISOString()}', Before='${beforeDatetime.toISOString()}'`);
        return (now >= afterDatetime && now <= beforeDatetime);

      default:
        logger.warn(`RulesEngine: Rule ${ruleId}, unknown time condition_type '${clause.condition_type}'. Clause: %j`, clause);
        return false;
    }
  } else if (clause.source_type === 'sensor_history') {
    if (!clause.source_id || !clause.metric || !clause.aggregator || !clause.samples || !clause.operator || clause.value === undefined) {
      logger.warn(`RulesEngine: Rule ${ruleId}, sensor_history clause missing required fields (source_id, metric, aggregator, samples, operator, value). Clause: %j`, clause);
      return false;
    }
    const samplesToFetch = parseInt(clause.samples, 10);
    if (isNaN(samplesToFetch) || samplesToFetch <= 0) {
      logger.warn(`RulesEngine: Rule ${ruleId}, sensor_history clause 'samples' is not a valid positive integer. Clause: %j`, clause);
      return false;
    }

    const listKey = `sensor_history:${clause.source_id}:${clause.metric}`;
    let aggregatedValue;

    try {
      const rawSamples = await redisClient.lrange(listKey, 0, samplesToFetch - 1);
      if (!rawSamples || rawSamples.length === 0) {
        logger.debug(`RulesEngine: Rule ${ruleId}, no history data found for ${listKey}.`);
        return false;
      }

      const numericValues = rawSamples.map(s => {
        try {
          return parseFloat(JSON.parse(s).val);
        } catch (e) {
          logger.warn(`RulesEngine: Rule ${ruleId}, error parsing historical data point '${s}' from ${listKey}: ${e.message}`);
          return NaN;
        }
      }).filter(v => !isNaN(v));

      if (numericValues.length === 0) { // Could also check if numericValues.length < samplesToFetch if strict sample count is needed
        logger.debug(`RulesEngine: Rule ${ruleId}, no valid numeric values in historical data for ${listKey} after parsing (or not enough samples if strict). Found: ${numericValues.length}`);
        return false;
      }

      logger.debug(`RulesEngine: Rule ${ruleId}, evaluating ${listKey} with ${numericValues.length} values: ${JSON.stringify(numericValues)} for aggregator ${clause.aggregator}`);

      switch (clause.aggregator.toLowerCase()) {
        case 'avg':
          aggregatedValue = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
          break;
        case 'min':
          aggregatedValue = Math.min(...numericValues);
          break;
        case 'max':
          aggregatedValue = Math.max(...numericValues);
          break;
        case 'sum':
          aggregatedValue = numericValues.reduce((sum, val) => sum + val, 0);
          break;
        default:
          logger.warn(`RulesEngine: Rule ${ruleId}, unsupported aggregator '${clause.aggregator}' for sensor_history. Clause: %j`, clause);
          return false;
      }

      if (aggregatedValue === undefined || isNaN(aggregatedValue)) {
          logger.warn(`RulesEngine: Rule ${ruleId}, aggregatedValue is undefined or NaN for ${listKey}. Aggregator: ${clause.aggregator}`);
          return false;
      }

      const expectedValueNum = parseFloat(clause.value);
      if (isNaN(expectedValueNum)) {
        logger.warn(`RulesEngine: Rule ${ruleId}, expected value '${clause.value}' in sensor_history clause is not a number. Clause: %j`, clause);
        return false;
      }

      logger.debug(`RulesEngine: SensorHistory Eval for rule ${ruleId}: ${clause.source_id}.${clause.metric} (agg: ${clause.aggregator}, ${numericValues.length} samples) = ${aggregatedValue}, rule expects ${clause.operator} ${expectedValueNum}`);

      switch (clause.operator) {
        case '>': return aggregatedValue > expectedValueNum;
        case '<': return aggregatedValue < expectedValueNum;
        case '>=': return aggregatedValue >= expectedValueNum;
        case '<=': return aggregatedValue <= expectedValueNum;
        case '==': case '===': return aggregatedValue === expectedValueNum;
        case '!=': case '!==': return aggregatedValue !== expectedValueNum;
        default:
          logger.warn(`RulesEngine: Rule ${ruleId}, unsupported operator '${clause.operator}' for sensor_history. Clause: %j`, clause);
          return false;
      }
    } catch (error) {
      logger.error(`RulesEngine: Rule ${ruleId}, error processing sensor_history clause for ${listKey}: ${error.message}`, { stack: error.stack });
      return false;
    }
  } else {
    logger.warn(`RulesEngine: Unknown or unsupported clause source_type '${clause.source_type}' or missing fields in rule ${ruleId}: %j`, clause);
    return false;
  }
}

// Helper function to evaluate the overall conditions object for a rule
async function areConditionsMet(ruleId, conditions, contextDataForRule) {
  if (!conditions) {
    logger.warn(`RulesEngine: Rule ${ruleId} - Evaluating rule with empty or null conditions. Defaulting to false.`);
    return false;
  }

  // Handle single condition object directly
  if (conditions.source_type) {
    return await evaluateClause(ruleId, conditions, contextDataForRule);
  }

  // Handle AND/OR clauses
  if (conditions.clauses && Array.isArray(conditions.clauses)) {
    if (conditions.type === 'AND') {
      if (conditions.clauses.length === 0) {
        logger.debug(`RulesEngine: Rule ${ruleId} - Empty AND clause array evaluated as true (vacuously true).`);
        return true;
      }
      for (const clause of conditions.clauses) {
        if (!(await evaluateClause(ruleId, clause, contextDataForRule))) {
          return false; // For AND, one false means the entire condition set is false
        }
      }
      return true; // All clauses in AND were true
    } else if (conditions.type === 'OR') {
      if (conditions.clauses.length === 0) {
        logger.debug(`RulesEngine: Rule ${ruleId} - Empty OR clause array evaluated as false.`);
        return false;
      }
      for (const clause of conditions.clauses) {
        if (await evaluateClause(ruleId, clause, contextDataForRule)) {
          return true; // For OR, one true means the entire condition set is true
        }
      }
      return false; // All clauses in OR were false
    } else {
      logger.warn(`RulesEngine: Rule ${ruleId} - Conditions object has clauses but no valid type (AND/OR): %j`, conditions);
      return false;
    }
  } else {
    logger.warn(`RulesEngine: Rule ${ruleId} - Unknown top-level condition structure or missing clauses array: %j`, conditions);
    return false;
  }
}

async function evaluateRules() {
  logger.info('RulesEngine: Running evaluation cycle...');
  let enabledRules = [];
  try {
    const result = await pool.query("SELECT * FROM rules WHERE is_enabled = TRUE ORDER BY priority DESC, id ASC");
    enabledRules = result.rows;
  } catch (dbError) {
    logger.error('RulesEngine: Error fetching enabled rules:', { message: dbError.message, stack: dbError.stack });
    return;
  }

  if (enabledRules.length === 0) {
    logger.info('RulesEngine: No enabled rules found to evaluate in this cycle.');
    return;
  }

  logger.info(`RulesEngine: Found ${enabledRules.length} enabled rule(s) to evaluate.`);
  const contextData = {}; // To store fetched data for evaluation, potentially per rule or globally for the cycle

  for (const rule of enabledRules) {
    logger.info(`RulesEngine: Evaluating rule ID ${rule.id} ('${rule.name}'), Priority: ${rule.priority}.`);
    contextData[rule.id] = {}; // Per-rule context for fetched data

    // --- Data Gathering Step ---
    const processClause = async (clause) => {
      if (clause.source_type === 'device' && clause.source_id && clause.property === 'status') {
        const deviceHardwareId = clause.source_id;
        logger.info(`RulesEngine: Rule ${rule.id} requires status for device (HW_ID): ${deviceHardwareId}`);
        try {
          const deviceResult = await pool.query("SELECT id, name, status, device_id FROM devices WHERE device_id = $1", [deviceHardwareId]);
          if (deviceResult.rows.length > 0) {
            contextData[rule.id][`device_${deviceHardwareId}`] = deviceResult.rows[0];
            logger.info(`RulesEngine: Fetched status for device ${deviceHardwareId}: ${deviceResult.rows[0].status}`);
          } else {
            logger.warn(`RulesEngine: Device (HW_ID) '${deviceHardwareId}' in rule ${rule.id} not found.`);
            contextData[rule.id][`device_${deviceHardwareId}`] = null; // Mark as not found
          }
        } catch (fetchError) {
          logger.error(`RulesEngine: Error fetching device ${deviceHardwareId} for rule ${rule.id}:`, { message: fetchError.message, stack: fetchError.stack });
          contextData[rule.id][`device_${deviceHardwareId}`] = { error: 'Failed to fetch' }; // Mark as error
        }
      } else if (clause.source_type === 'sensor' && clause.source_id && clause.metric) {
        const redisKey = `sensor_latest:${clause.source_id}`;
        const contextKey = `sensor_${clause.source_id}`;
        logger.debug(`RulesEngine: Rule ${rule.id} requires sensor data for '${clause.source_id}' (metric: ${clause.metric}). Key: ${redisKey}`);
        try {
            const sensorData = await redisClient.hgetall(redisKey);
            if (sensorData && Object.keys(sensorData).length > 0) {
                contextData[rule.id][contextKey] = sensorData;
                logger.debug(`RulesEngine: Fetched sensor data for ${redisKey}: %j`, sensorData);
            } else {
                logger.warn(`RulesEngine: No data found in Redis for sensor key '${redisKey}' (Rule ${rule.id}).`);
                contextData[rule.id][contextKey] = null; // Mark as not found
            }
        } catch (redisFetchError) {
            logger.error(`RulesEngine: Error fetching sensor data from Redis for key '${redisKey}' (Rule ${rule.id}):`, { message: redisFetchError.message, stack: redisFetchError.stack });
            contextData[rule.id][contextKey] = { error: 'Failed to fetch from Redis' }; // Mark as error
        }
      } else if (clause.source_type) {
         logger.warn(`RulesEngine: Unhandled source_type '${clause.source_type}' in rule ${rule.id}: %j`, clause);
      } else {
        // This could be a structural issue with the condition definition itself if no source_type
        logger.warn(`RulesEngine: Clause missing 'source_type' in rule ${rule.id}: %j`, clause);
      }
    };

    if (rule.conditions) {
      if (rule.conditions.clauses && Array.isArray(rule.conditions.clauses)) { // Handle "AND" / "OR" structures
        for (const clause of rule.conditions.clauses) {
          await processClause(clause);
        }
      } else if (rule.conditions.source_type) { // Handle single condition object
        await processClause(rule.conditions);
      } else {
        logger.warn(`RulesEngine: Rule ID ${rule.id} has an unknown 'conditions' structure: %j`, rule.conditions);
      }
    } else {
        logger.warn(`RulesEngine: Rule ID ${rule.id} has no 'conditions' defined.`);
    }


    // --- Condition Evaluation Step ---
    let conditionsMet = false;
    try {
        // Pass rule.id for better logging context within evaluation helpers
        conditionsMet = await areConditionsMet(rule.id, rule.conditions, contextData[rule.id]);
        logger.info(`RulesEngine: Rule ID ${rule.id} ('${rule.name}') conditions evaluation result: ${conditionsMet}`);
    } catch (evalError) {
        logger.error(`RulesEngine: Error during condition evaluation for rule ID ${rule.id}:`, { message: evalError.message, stack: evalError.stack });
        conditionsMet = false; // Treat errors in evaluation as conditions not met
    }

    if (conditionsMet) {
      logger.info(`RulesEngine: Conditions MET for rule ID ${rule.id} ('${rule.name}'). Triggering actions.`);
      await executeRuleActions(rule, contextData[rule.id]);

      try {
        await pool.query("UPDATE rules SET last_triggered_at = NOW() WHERE id = $1", [rule.id]);
        logger.info(`RulesEngine: Updated last_triggered_at for rule ID ${rule.id}.`);
      } catch (updateError) {
        logger.error(`RulesEngine: Failed to update last_triggered_at for rule ID ${rule.id}:`, updateError);
      }

      try {
        await operationService.recordOperation({
          serviceName: 'RulesEngineService', action: 'rule_triggered', targetEntityType: 'rule',
          targetEntityId: rule.id.toString(), status: 'SUCCESS', // Assuming actions were attempted
          details: { ruleName: rule.name, conditions: rule.conditions, actionsExecuted: rule.actions } // actionsExecuted might be refined later
        });
      } catch (opLogError) {
        logger.error(`RulesEngine: Failed to log rule execution for rule ID ${rule.id}:`, opLogError);
      }

      if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
        try {
            app.locals.broadcastWebSocket({
                type: 'rule_triggered',
                data: {
                    rule_id: rule.id,
                    rule_name: rule.name,
                    timestamp: new Date().toISOString(),
                    actions_attempted: rule.actions // Or a summary of actions taken
                }
            });
        } catch (broadcastErr) {
            logger.error(`RulesEngine: Failed to broadcast rule_triggered event for rule ID ${rule.id}:`, broadcastErr);
        }
      } else {
        logger.warn(`[WebSocket Broadcast Simulated/Skipped] Event: rule_triggered for rule ID ${rule.id}. broadcastWebSocket not available.`);
      }

    } else {
      // logger.info(`RulesEngine: Conditions NOT MET for rule ID ${rule.id} ('${rule.name}').`);
    }
  }
  logger.info('RulesEngine: Finished evaluation cycle.');
}

async function executeRuleActions(rule, contextDataForRule) {
  logger.info(`RulesEngine: Executing actions for rule ID ${rule.id} ('${rule.name}'). Actions: %j`, rule.actions);
  if (!Array.isArray(rule.actions)) {
    logger.error(`RulesEngine: Actions for rule ID ${rule.id} is not an array. Actions: %j`, rule.actions);
    return;
  }

  for (const action of rule.actions) {
    try {
      logger.debug(`RulesEngine: Preparing action for rule ${rule.id}: %j`, action);
      if (action.service === 'deviceService' && action.method === 'updateDeviceStatus') {
        if (!action.target_device_id || !action.params || action.params.status === undefined) {
          logger.error(`RulesEngine: Missing target_device_id or params.status for updateDeviceStatus action in rule ${rule.id}: %j`, action);
          // Log this misconfiguration
          await operationService.recordOperation({
            serviceName: 'RulesEngineService', action: 'action_configuration_error', targetEntityType: 'rule',
            targetEntityId: rule.id.toString(), status: 'FAILURE',
            details: { ruleName: rule.name, action: action, error: `Missing target_device_id or params.status` }
          });
          continue;
        }

        const actionToQueue = {
            type: 'device_action',
            targetService: 'deviceService',
            targetMethod: 'updateDeviceStatus',
            payload: {
                deviceId: action.target_device_id, // Hardware ID
                status: action.params.status
            },
            origin: {
                service: 'RulesEngineService',
                ruleId: rule.id,
                ruleName: rule.name,
                actionDetails: action
            }
        };
        const messageId = await publishCriticalAction(actionToQueue, `RulesEngineService (Rule ID: ${rule.id})`);
        if (messageId) {
            logger.info(`RulesEngine: Action for rule ${rule.id} published to queue. HW_ID ${action.target_device_id}, Status ${action.params.status}. Msg ID: ${messageId}`);
             await operationService.recordOperation({
                serviceName: 'RulesEngineService', action: 'action_queued', targetEntityType: 'rule',
                targetEntityId: rule.id.toString(), status: 'SUCCESS',
                details: { ruleName: rule.name, action: action, queueMessageId: messageId, queuedAction: actionToQueue }
            });
        } else {
            logger.error(`RulesEngine: Failed to publish action to queue for rule ${rule.id}: %j`, actionToQueue);
            await operationService.recordOperation({
                serviceName: 'RulesEngineService', action: 'action_queueing_failure', targetEntityType: 'rule',
                targetEntityId: rule.id.toString(), status: 'FAILURE',
                details: { ruleName: rule.name, action: action, attemptedAction: actionToQueue, error: "Publish returned null/false" }
            });
        }

      } else if (action.service === 'deviceService' && action.method === 'setDeviceConfiguration') {
        if (!action.target_device_id || !action.params || typeof action.params.config !== 'object' || action.params.config === null) {
          logger.error(`RulesEngine: Missing target_device_id or invalid 'config' object for setDeviceConfiguration action in rule ${rule.id}: %j`, action);
          await operationService.recordOperation({
            serviceName: 'RulesEngineService', action: 'action_configuration_error', targetEntityType: 'rule',
            targetEntityId: rule.id.toString(), status: 'FAILURE',
            details: { ruleName: rule.name, action: action, error: `Missing target_device_id or invalid 'config' object` }
          });
          continue;
        }
        const actionToQueue = {
            type: 'device_config_action',
            targetService: 'deviceService',
            targetMethod: 'setDeviceConfiguration',
            payload: {
                deviceId: action.target_device_id, // Hardware ID
                config: action.params.config
            },
            origin: {
                service: 'RulesEngineService',
                ruleId: rule.id,
                ruleName: rule.name,
                actionDetails: action
            }
        };
        const messageId = await publishCriticalAction(actionToQueue, `RulesEngineService (Rule ID: ${rule.id})`);
        if (messageId) {
            logger.info(`RulesEngine: Action 'setDeviceConfiguration' for rule ${rule.id} published to queue. HW_ID ${action.target_device_id}. Msg ID: ${messageId}`);
            await operationService.recordOperation({
                serviceName: 'RulesEngineService', action: 'action_queued', targetEntityType: 'rule',
                targetEntityId: rule.id.toString(), status: 'SUCCESS',
                details: { ruleName: rule.name, action: action, queueMessageId: messageId, queuedAction: actionToQueue }
            });
        } else {
            logger.error(`RulesEngine: Failed to publish 'setDeviceConfiguration' action to queue for rule ${rule.id}: %j`, actionToQueue);
            await operationService.recordOperation({
                serviceName: 'RulesEngineService', action: 'action_queueing_failure', targetEntityType: 'rule',
                targetEntityId: rule.id.toString(), status: 'FAILURE',
                details: { ruleName: rule.name, action: action, attemptedAction: actionToQueue, error: "Publish returned null/false" }
            });
        }

      } else if (action.service === 'operationService' && action.method === 'recordOperation') {
        if (!action.params) {
            logger.error(`RulesEngine: Missing params for operationService.recordOperation action in rule ${rule.id}: %j`, action);
            continue;
        }
        await operationService.recordOperation({
            userId: null,
            deviceId: action.params.deviceId || null,
            serviceName: action.params.serviceName || 'RulesEngineGeneratedLog', // More specific serviceName
            action: action.params.action || 'rule_custom_log_event', // More specific action
            targetEntityType: action.params.targetEntityType || 'rule',
            targetEntityId: action.params.targetEntityId || rule.id.toString(),
            status: action.params.status || 'INFO',
            details: action.params.details || { ruleId: rule.id, ruleName: rule.name, custom_message: "Action triggered by rule." }
        });
        logger.info(`RulesEngine: Action executed for rule ${rule.id}: operationService.recordOperation`);

      } else {
        logger.warn(`RulesEngine: Unsupported action service/method in rule ${rule.id}: ${action.service}.${action.method}`);
        // Optionally log this as a specific type of failure in operations_log
         await operationService.recordOperation({
            serviceName: 'RulesEngineService', action: 'action_execution_failure', targetEntityType: 'rule',
            targetEntityId: rule.id.toString(), status: 'FAILURE',
            details: { ruleName: rule.name, action: action, error: `Unsupported action ${action.service}.${action.method}` }
        });
      }
    } catch (error) {
      logger.error(`RulesEngine: Error executing an action for rule ID ${rule.id}: %j`, { action, errorMessage: error.message, errorStack: error.stack });
      // Log this specific action failure to operationService
      try {
        await operationService.recordOperation({
            serviceName: 'RulesEngineService', action: 'action_execution_exception', targetEntityType: 'rule',
            targetEntityId: rule.id.toString(), status: 'FAILURE',
            details: { ruleName: rule.name, action: action, error: error.message, stack: error.stack }
        });
      } catch (opLogError) {
          logger.error(`RulesEngine: CRITICAL - Failed to log action execution exception for rule ID ${rule.id}:`, opLogError);
      }
      // Decide if one failed action should stop others in the rule. For now, continue to next action.
    }
  }
}

function startRulesEngine() {
  if (rulesEngineJob) {
    logger.warn('Rules Engine job is already running.');
    return;
  }

  // Schedule to run, e.g., every 10 seconds for more responsive testing. Adjust for production.
  // cron.schedule('*/10 * * * * *', evaluateRules, { // Every 10 seconds
  rulesEngineJob = cron.schedule('*/30 * * * * *', evaluateRules, { // Every 30 seconds as per example
    scheduled: true,
    timezone: "Etc/UTC" // Important for consistency
  });

  logger.info('Rules Engine started. Job scheduled to evaluate rules periodically (e.g., every 30 seconds).');
}

function stopRulesEngine() {
  if (rulesEngineJob) {
    logger.info('Attempting to stop Rules Engine...');
    rulesEngineJob.stop();
    rulesEngineJob = null;
    logger.info('Rules Engine stopped.');
  } else {
    logger.info('Rules Engine is not currently running.');
  }
}

module.exports = {
  startRulesEngine,
  stopRulesEngine,
  // evaluateRules, // Potentially export for manual triggering/testing during development
};
