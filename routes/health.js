const express = require('express');
const pool = require('../config/db');
const redisClient = require('../config/redis');

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {}
  };

  try {
    await pool.query('SELECT 1');
    health.services.postgres = 'OK';

    // Verificar existencia y estructura de tablas
    const requiredTables = ['luxometro', 'calidad_agua', 'temhum1', 'temhum2'];
    const tablesInfo = {};

    for (const table of requiredTables) {
      try {
        const { rows } = await pool.query(
          `SELECT column_name, data_type 
           FROM information_schema.columns 
           WHERE table_name = $1`,
          [table]
        );
        tablesInfo[table] = {
          exists: rows.length > 0,
          columns: rows
        };
      } catch (err) {
        tablesInfo[table] = {
          exists: false,
          error: err.message
        };
      }
    }

    health.tables = tablesInfo;
    health.missing_tables = requiredTables.filter(t => !tablesInfo[t]?.exists);

  } catch (err) {
    health.services.postgres = 'FAIL';
    health.postgres_error = err.message;
  }

  try {
    await redisClient.ping();
    health.services.redis = 'OK';
  } catch (err) {
    health.services.redis = 'FAIL';
    health.redis_error = err.message;
  }

  res.status(health.status === 'OK' ? 200 : 503).json(health);
});

module.exports = router;
