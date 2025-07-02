#!/usr/bin/env node

/**
 * Debug script para verificar el estado actual de las reglas y sus cooldowns
 */

const pool = require('./config/db');
const logger = require('./config/logger');

const PRIORITY_COOLDOWNS = {
  1: 60,   // 1 hora
  2: 30,   // 30 minutos
  3: 15,   // 15 minutos
  4: 10,   // 10 minutos
  5: 5     // 5 minutos
};

function canTriggerRule(rule) {
  if (!rule.last_triggered_at) {
    return { canTrigger: true, reason: 'Never triggered before' };
  }

  const priority = Math.max(1, Math.min(5, rule.priority || 3));
  const cooldownMinutes = PRIORITY_COOLDOWNS[priority];
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  const lastTriggeredTime = new Date(rule.last_triggered_at).getTime();
  const now = Date.now();
  const timeSinceLastTrigger = now - lastTriggeredTime;
  
  const canTrigger = timeSinceLastTrigger >= cooldownMs;
  const minutesSince = Math.floor(timeSinceLastTrigger / (60 * 1000));
  const minutesRemaining = Math.max(0, cooldownMinutes - minutesSince);
  
  return {
    canTrigger,
    reason: canTrigger 
      ? `Ready to trigger (${minutesSince}m since last, cooldown is ${cooldownMinutes}m)`
      : `In cooldown: ${minutesRemaining}m remaining (${minutesSince}m since last, cooldown is ${cooldownMinutes}m)`
  };
}

async function debugRulesStatus() {
  try {
    logger.info('🔍 Debugging rules status and cooldowns...');

    // Obtener todas las reglas activas
    const rulesResult = await pool.query(`
      SELECT id, name, priority, is_enabled, last_triggered_at, conditions, actions
      FROM rules 
      ORDER BY priority DESC, id ASC
    `);

    logger.info(`Found ${rulesResult.rows.length} total rules in database`);
    
    const now = new Date().toISOString();
    logger.info(`Current time: ${now}`);
    
    console.log('\n📊 RULES STATUS REPORT:');
    console.log('='.repeat(80));
    
    for (const rule of rulesResult.rows) {
      const status = canTriggerRule(rule);
      const enabledText = rule.is_enabled ? '✅ ENABLED' : '❌ DISABLED';
      const priorityText = `P${rule.priority}`;
      const cooldownText = `${PRIORITY_COOLDOWNS[rule.priority] || 15}m`;
      
      console.log(`\nRule ${rule.id}: "${rule.name}"`);
      console.log(`  Status: ${enabledText} | Priority: ${priorityText} (${cooldownText} cooldown)`);
      console.log(`  Last triggered: ${rule.last_triggered_at || 'Never'}`);
      console.log(`  Trigger status: ${status.reason}`);
      
      // Verificar condiciones
      if (rule.conditions) {
        const conditionsText = JSON.stringify(rule.conditions).substring(0, 100);
        console.log(`  Conditions: ${conditionsText}...`);
      }
      
      // Verificar acciones
      if (rule.actions && rule.actions[0]) {
        const action = rule.actions[0];
        if (action.service === 'notificationService') {
          const channels = action.params?.channels || ['email'];
          console.log(`  Notification channels: ${channels.join(', ')}`);
        }
      }
    }
    
    // Obtener reglas que podrían estar enviando notificaciones ahora
    const enabledRules = rulesResult.rows.filter(r => r.is_enabled);
    const readyToTrigger = enabledRules.filter(r => canTriggerRule(r).canTrigger);
    
    console.log('\n🚨 RULES THAT CAN TRIGGER NOW:');
    console.log('='.repeat(50));
    
    if (readyToTrigger.length === 0) {
      console.log('None - all rules are disabled or in cooldown');
    } else {
      readyToTrigger.forEach(rule => {
        console.log(`- Rule ${rule.id}: "${rule.name}" (P${rule.priority})`);
      });
    }
    
    // Obtener logs recientes de notificaciones
    const recentLogs = await pool.query(`
      SELECT target_entity_id, action, status, created_at, details
      FROM operation_logs 
      WHERE service_name = 'RulesEngineService' 
        AND action IN ('rule_triggered', 'notification_alert_sent')
        AND created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('\n📝 RECENT RULE ACTIVITY (last hour):');
    console.log('='.repeat(50));
    
    if (recentLogs.rows.length === 0) {
      console.log('No rule activity in the last hour');
    } else {
      recentLogs.rows.forEach(log => {
        const time = new Date(log.created_at).toLocaleTimeString();
        console.log(`${time} - Rule ${log.target_entity_id}: ${log.action} (${log.status})`);
      });
    }

  } catch (error) {
    logger.error('💥 Debug failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the debug if this script is executed directly
if (require.main === module) {
  debugRulesStatus().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { debugRulesStatus };