const express = require('express');
const pool = require('../config/db');
const redisClient = require('../config/redis');
const logger = require('../config/logger');
const calcDewPoint = require('../utils/dewPoint');
const validateTableParam = require('../middleware/validate');
const cacheMiddleware = require('../middleware/cache')(redisClient);

const authMiddleware = require('../middleware/auth');
const router = express.Router();

// /api/chart/:table
router.get('/chart/:table',
  validateTableParam,
  cacheMiddleware('chart-data', 300),
  async (req, res, next) => {
    const { table } = req.params;
    const { hours = 24 } = req.query;

    try {
      const result = await pool.query(
        `SELECT * FROM ${table} 
         WHERE received_at >= NOW() - INTERVAL '${hours} hours'
         ORDER BY received_at ASC`
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// /api/history/:table
router.get('/history/:table',
  validateTableParam,
  cacheMiddleware('history-data', 600),
  async (req, res, next) => {
    const { table } = req.params;
    const { limit = 100, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    try {
      const result = await pool.query({
        text: `SELECT * FROM ${table} ORDER BY received_at DESC LIMIT $1 OFFSET $2`,
        values: [limit, offset]
      });
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// /api/stats/:table
router.get('/stats/:table',
  validateTableParam,
  cacheMiddleware('stats-data', 3600),
  async (req, res, next) => {
    const { table } = req.params;

    try {
      // Verificar columnas disponibles
      const { rows: columns } = await pool.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = $1`,
        [table]
      );

      const columnNames = columns.map(c => c.column_name);
      const isTemHumTable = columnNames.includes('temperatura') && columnNames.includes('humedad');
      const isCalidadAgua = table === 'calidad_agua';
      const isLuxometro = table === 'luxometro';

      let query;
      if (isTemHumTable) {
        query = `SELECT 
          DATE(received_at) as fecha,
          COUNT(*) as total,
          AVG(temperatura) as avg_temp,
          MIN(temperatura) as min_temp,
          MAX(temperatura) as max_temp,
          AVG(humedad) as avg_humidity,
          MIN(humedad) as min_humidity,
          MAX(humedad) as max_humidity
         FROM ${table}
         WHERE received_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(received_at)
         ORDER BY fecha DESC`;
      } else if (isCalidadAgua) {
        query = `SELECT 
          DATE(received_at) as fecha,
          COUNT(*) as total,
          AVG(ph) as avg_ph,
          MIN(ph) as min_ph,
          MAX(ph) as max_ph,
          AVG(ec) as avg_ec,
          MIN(ec) as min_ec,
          MAX(ec) as max_ec,
          AVG(ppm) as avg_ppm,
          MIN(ppm) as min_ppm,
          MAX(ppm) as max_ppm
         FROM ${table}
         WHERE received_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(received_at)
         ORDER BY fecha DESC`;
      } else if (isLuxometro) {
        query = `SELECT 
          DATE(received_at) as fecha,
          COUNT(*) as total,
          AVG(light) as avg_light,
          MIN(light) as min_light,
          MAX(light) as max_light,
          AVG(white_light) as avg_white,
          MIN(white_light) as min_white,
          MAX(white_light) as max_white,
          AVG(raw_light) as avg_raw,
          MIN(raw_light) as min_raw,
          MAX(raw_light) as max_raw
         FROM ${table}
         WHERE received_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(received_at)
         ORDER BY fecha DESC`;
      } else {
        query = `SELECT 
          DATE(received_at) as fecha,
          COUNT(*) as total
         FROM ${table}
         WHERE received_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(received_at)
         ORDER BY fecha DESC`;
      }

      const stats = await pool.query(query);

      const dailyStats = stats.rows.map(day => {
        const result = { fecha: day.fecha, total: day.total };

        if (isTemHumTable) {
          result.temperatura = {
            promedio: day.avg_temp,
            minimo: day.min_temp,
            maximo: day.max_temp
          };
          result.humedad = {
            promedio: day.avg_humidity,
            minimo: day.min_humidity,
            maximo: day.max_humidity
          };
        } else if (isCalidadAgua) {
          result.ph = {
            promedio: day.avg_ph,
            minimo: day.min_ph,
            maximo: day.max_ph
          };
          result.ec = {
            promedio: day.avg_ec,
            minimo: day.min_ec,
            maximo: day.max_ec
          };
          result.ppm = {
            promedio: day.avg_ppm,
            minimo: day.min_ppm,
            maximo: day.max_ppm
          };
        } else if (isLuxometro) {
          result.light = {
            promedio: day.avg_light,
            minimo: day.min_light,
            maximo: day.max_light
          };
          result.white_light = {
            promedio: day.avg_white,
            minimo: day.min_white,
            maximo: day.max_white
          };
          result.raw_light = {
            promedio: day.avg_raw,
            minimo: day.min_raw,
            maximo: day.max_raw
          };
        }

        return result;
      });

      res.json(dailyStats);
    } catch (err) {
      next(err);
    }
  }
);

// /api/latest/:table
router.get('/latest/:table',
  authMiddleware,
  validateTableParam,
  cacheMiddleware('latest-record'),
  async (req, res, next) => {
    const { table } = req.params;

    try {
      logger.info(`Querying latest record from table: ${table}`);
      const startTime = Date.now();
      logger.info(`Getting connection from pool for table ${table}`);
      const client = await pool.connect();
      logger.info(`Got connection from pool for table ${table}`);
      try {
        logger.info(`Starting database transaction for table ${table}`);
        try {
          await client.query('BEGIN');

          // Test simple query
          const testQuery = await client.query({
            text: `SELECT 1 FROM ${table} LIMIT 1`,
            timeout: 5000
          });
          logger.info(`Test query succeeded for table ${table}`);

          // Full query
          const result = await client.query({
            text: `SELECT * FROM ${table} ORDER BY received_at DESC LIMIT 1`,
            timeout: 5000
          });

          await client.query('COMMIT');
          logger.info(`Transaction committed for table ${table}`);

          const duration = Date.now() - startTime;
          logger.info(`Query completed in ${duration}ms for ${table}`, {
            rowCount: result.rowCount,
            queryDuration: duration
          });

          let data = result.rows[0] || null;

          // Calcular punto de rocío para sensores de humedad
          if (data && (table === 'temhum1' || table === 'temhum2')) {
            data.dew_point = calcDewPoint(data.temperatura, data.humedad);
          }

          if (data && res.locals.cacheKey) {
            await redisClient.set(res.locals.cacheKey, JSON.stringify(data), 'EX', res.locals.ttl);
          }

          client.release();
          res.json(data);
          return;
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Transaction rolled back for table ${table}:`, err);
          throw err;
        }
      } catch (queryErr) {
        logger.error(`Database query failed for table ${table}:`, {
          error: queryErr.message,
          stack: queryErr.stack
        });
        throw queryErr;
      }
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
