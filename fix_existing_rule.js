#!/usr/bin/env node

/**
 * Script para corregir la regla existente "Temperatura Alta - Sensor 1"
 * con la condición JSON completa
 */

const pool = require('./config/db');
const logger = require('./config/logger');

async function fixExistingRule() {
  try {
    logger.info('🔧 Fixing existing notification rule...');

    // Buscar la regla por nombre
    const findResult = await pool.query(
      "SELECT id, name, conditions FROM rules WHERE name LIKE '%Temperatura Alta%' OR name LIKE '%Sensor 1%'"
    );

    if (findResult.rows.length === 0) {
      logger.warn('No se encontró la regla "Temperatura Alta - Sensor 1"');
      return;
    }

    const rule = findResult.rows[0];
    logger.info(`Found rule: ${rule.name} (ID: ${rule.id})`);
    logger.info(`Current conditions: ${JSON.stringify(rule.conditions)}`);

    // Condición corregida
    const correctedConditions = {
      type: 'AND',
      clauses: [{
        source_type: 'sensor',
        source_id: 'temhum1',
        metric: 'temperatura',
        operator: '>',
        value: 15
      }]
    };

    // Acciones corregidas
    const correctedActions = [{
      service: 'notificationService',
      method: 'sendAlert',
      params: {
        message: 'alerta de temperatura: la temperatura actual del sensor TemHum1 está por encima del umbral (>15°C)',
        recipient_user_id: 1
      }
    }];

    // Actualizar la regla
    const updateResult = await pool.query(`
      UPDATE rules 
      SET conditions = $1, actions = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, conditions, actions
    `, [
      JSON.stringify(correctedConditions),
      JSON.stringify(correctedActions),
      rule.id
    ]);

    if (updateResult.rows.length > 0) {
      logger.info('✅ Rule updated successfully!');
      logger.info(`New conditions: ${JSON.stringify(updateResult.rows[0].conditions)}`);
      logger.info(`New actions: ${JSON.stringify(updateResult.rows[0].actions)}`);
    } else {
      logger.error('❌ Failed to update rule');
    }

  } catch (error) {
    logger.error('💥 Error fixing rule:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix if this script is executed directly
if (require.main === module) {
  fixExistingRule().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { fixExistingRule };