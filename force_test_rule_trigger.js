#!/usr/bin/env node

const pool = require('./config/db');
const logger = require('./config/logger');

async function forceTestRuleTrigger() {
  try {
    // Resetear la regla de prueba para que pueda activarse inmediatamente
    const resetResult = await pool.query(`
      UPDATE rules 
      SET last_triggered_at = NULL
      WHERE name = 'TEST COOLDOWN - Temperatura > 0'
      RETURNING id, name
    `);

    if (resetResult.rows.length > 0) {
      const rule = resetResult.rows[0];
      logger.info(`✅ Reset test rule ${rule.id}: "${rule.name}"`);
      logger.info('🕐 Rule should trigger in the next evaluation cycle (within 30 seconds)');
    } else {
      logger.warn('❌ Test rule not found');
    }

  } catch (error) {
    logger.error('💥 Failed to reset test rule:', error);
  } finally {
    await pool.end();
  }
}

forceTestRuleTrigger();