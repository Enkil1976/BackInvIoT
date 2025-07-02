#!/usr/bin/env node

const pool = require('./config/db');
const logger = require('./config/logger');

async function createTestRule() {
  try {
    // Crear una regla que siempre se active (condición muy fácil de cumplir)
    const testRule = {
      name: 'TEST COOLDOWN - Temperatura > 0',
      description: 'Regla de prueba para verificar cooldown - se activa siempre',
      priority: 4, // 10 minutos de cooldown
      is_enabled: true,
      conditions: {
        type: 'AND',
        clauses: [{
          source_type: 'sensor',
          source_id: 'temhum1',
          metric: 'temperatura',
          operator: '>',
          value: 0 // Se activará siempre que haya temperatura > 0
        }]
      },
      actions: [{
        service: 'notificationService',
        method: 'sendAlert',
        params: {
          message: '🧪 PRUEBA COOLDOWN: Esta notificación debería aparecer solo cada 10 minutos (P4)',
          recipient_user_id: 1,
          channels: ['email']
        }
      }]
    };

    // Eliminar regla existente si existe
    await pool.query('DELETE FROM rules WHERE name = $1', [testRule.name]);

    // Insertar nueva regla
    const result = await pool.query(`
      INSERT INTO rules (name, description, priority, is_enabled, conditions, actions)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, priority
    `, [
      testRule.name,
      testRule.description,
      testRule.priority,
      testRule.is_enabled,
      JSON.stringify(testRule.conditions),
      JSON.stringify(testRule.actions)
    ]);

    const rule = result.rows[0];
    logger.info(`✅ Test rule created: ID ${rule.id}, Name: "${rule.name}", Priority: ${rule.priority}`);
    logger.info('🕐 This rule should trigger immediately, then be blocked for 10 minutes');
    logger.info('📊 Monitor the logs to verify cooldown is working correctly');

  } catch (error) {
    logger.error('💥 Failed to create test rule:', error);
  } finally {
    await pool.end();
  }
}

createTestRule();