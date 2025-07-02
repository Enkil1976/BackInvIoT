#!/usr/bin/env node

/**
 * Test script para demostrar el sistema de prioridades de notificaciones
 * Crea una regla de prioridad alta (5) para probar notificaciones cada 5 minutos
 */

const pool = require('./config/db');
const logger = require('./config/logger');

async function testPrioritySystem() {
  try {
    logger.info('🧪 Testing priority-based notification system...');

    // Crear una regla de prioridad crítica (5) que se activará frecuentemente
    const testRule = {
      name: 'Test Prioridad Crítica',
      description: 'Regla de prueba para demostrar notificaciones cada 5 minutos',
      priority: 5, // Prioridad crítica - cada 5 minutos
      is_enabled: true,
      conditions: {
        type: 'AND',
        clauses: [{
          source_type: 'sensor',
          source_id: 'temhum1',
          metric: 'temperatura',
          operator: '>',
          value: 10 // Umbral bajo para que se active fácilmente
        }]
      },
      actions: [{
        service: 'notificationService',
        method: 'sendAlert',
        params: {
          message: 'PRUEBA: Alerta de prioridad crítica - notificación cada 5 minutos',
          recipient_user_id: 1,
          channels: ['email', 'telegram', 'whatsapp']
        }
      }]
    };

    // Insertar la regla de prueba
    const insertResult = await pool.query(`
      INSERT INTO rules (name, description, priority, is_enabled, conditions, actions)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        priority = EXCLUDED.priority,
        conditions = EXCLUDED.conditions,
        actions = EXCLUDED.actions,
        updated_at = NOW()
      RETURNING id, name, priority
    `, [
      testRule.name,
      testRule.description,
      testRule.priority,
      testRule.is_enabled,
      JSON.stringify(testRule.conditions),
      JSON.stringify(testRule.actions)
    ]);

    const rule = insertResult.rows[0];
    logger.info(`✅ Test rule created/updated: ID ${rule.id}, Priority ${rule.priority}`);

    // Mostrar información del sistema de prioridades
    logger.info('📊 Priority System Overview:');
    logger.info('  Priority 5 (Crítica): Notifications every 5 minutes');
    logger.info('  Priority 4 (Alta): Notifications every 10 minutes');
    logger.info('  Priority 3 (Media): Notifications every 15 minutes');
    logger.info('  Priority 2 (Baja): Notifications every 30 minutes');
    logger.info('  Priority 1 (Muy Baja): Notifications every 1 hour');

    // Verificar reglas existentes y sus cooldowns
    const allRulesResult = await pool.query(`
      SELECT id, name, priority, last_triggered_at, is_enabled
      FROM rules 
      WHERE is_enabled = true
      ORDER BY priority DESC, last_triggered_at DESC NULLS LAST
    `);

    logger.info('\n📋 Current Active Rules with Cooldowns:');
    const now = new Date();
    
    for (const rule of allRulesResult.rows) {
      const priorityMap = { 5: '5m', 4: '10m', 3: '15m', 2: '30m', 1: '60m' };
      const cooldownPeriod = priorityMap[rule.priority] || '15m';
      
      let cooldownStatus = 'Never triggered - Can trigger now';
      if (rule.last_triggered_at) {
        const timeSince = (now - new Date(rule.last_triggered_at)) / (1000 * 60); // minutes
        const cooldownMinutes = { 5: 5, 4: 10, 3: 15, 2: 30, 1: 60 }[rule.priority] || 15;
        const remaining = Math.max(0, cooldownMinutes - timeSince);
        
        if (remaining > 0) {
          cooldownStatus = `In cooldown: ${remaining.toFixed(1)}m remaining`;
        } else {
          cooldownStatus = `Ready to trigger (${timeSince.toFixed(1)}m since last)`;
        }
      }
      
      logger.info(`  Rule ${rule.id}: "${rule.name}" (P${rule.priority}/${cooldownPeriod}) - ${cooldownStatus}`);
    }

    logger.info('\n🔄 The rules engine evaluates every 30 seconds and will respect priority-based cooldowns.');
    logger.info('✅ Priority system test setup complete!');

  } catch (error) {
    logger.error('💥 Priority system test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPrioritySystem().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { testPrioritySystem };