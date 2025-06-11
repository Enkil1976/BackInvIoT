const express = require('express');
const { Client } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const moment = require('moment');

const redisClient = new Redis({
  host: '2h4eh9.easypanel.host',
  port: 7963,
  password: '11211121',
  username: 'default',
  connectTimeout: 5000,
  retryStrategy: (times) => {
    console.log(`Reintentando conexión Redis (intento ${times})`);
    return Math.min(times * 100, 5000);
  }
});

redisClient.on('error', err => {
  console.error('❌ Error de Redis:', err.message);
});

redisClient.on('connect', () => console.log('✅ Redis conectado correctamente'));

const app = express();

// Configuración mejorada de CORS
const corsOptions = {
  origin: [
    'https://cosmic-dango-25d9b8.netlify.app',
    'https://proyectos-iot.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilitar preflight para todas las rutas

app.use(express.json());

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.PG_URI || 'postgres://innovaiq:5Anf0rd01!@2h4eh9.easypanel.host:5423/innovaiq?sslmode=disable',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', (err) => {
  console.error('⚠️ Error en el pool de PostgreSQL:', err);
});

function calcDewPoint(temp, hum) {
  if (!temp || !hum) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(hum / 100);
  return +(b * alpha / (a - alpha)).toFixed(2);
}

// ========== MIDDLEWARE & HELPERS ==========

// 🔧 FIXED: Mejor generación de clave de caché
const cacheMiddleware = (key, ttl = 30) => async (req, res, next) => {
  try {
    const cacheKey = `${key}:${req.method}:${req.originalUrl}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      res.set('X-Cache', 'HIT');
      return res.json(JSON.parse(cachedData));
    }

    res.locals.cacheKey = cacheKey;
    res.locals.ttl = ttl;
    res.set('X-Cache', 'MISS');
    next();
  } catch (err) {
    next();
  }
};

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error en ${req.method} ${req.url}:`, err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// ========== ENDPOINTS ==========

// 1. Último registro de cada tabla
app.get('/api/latest/:table', cacheMiddleware('latest-record'), async (req, res) => {
  const { table } = req.params;
  const validTables = ['luxometro', 'calidad_agua', 'temhum1', 'temhum2'];

  if (!validTables.includes(table)) {
    return res.status(400).json({ error: 'Tabla inválida' });
  }

  try {
    const query = `SELECT * FROM ${table} ORDER BY received_at DESC LIMIT 1`;
    const result = await pool.query(query);
    const data = result.rows[0] || null;

    if (data && res.locals.cacheKey) {
      await redisClient.set(res.locals.cacheKey, JSON.stringify(data), 'EX', res.locals.ttl);
    }

    res.json(data);
  } catch (err) {
    throw new Error(`Error al obtener último registro: ${err.message}`);
  }
});

// 2. Datos históricos con paginación
app.get('/api/history/:table', cacheMiddleware('history-data', 60), async (req, res) => {
  const { table } = req.params;
  const { page = 1, limit = 100, from, to } = req.query;
  const offset = (page - 1) * limit;

  if (limit > 500) {
    return res.status(400).json({ error: 'El límite máximo es 500' });
  }

  try {
    let whereClause = '';
    const params = [];

    if (from || to) {
      const conditions = [];
      if (from) {
        conditions.push(`received_at >= $${params.length + 1}`);
        params.push(new Date(from));
      }
      if (to) {
        conditions.push(`received_at <= $${params.length + 1}`);
        params.push(new Date(to));
      }
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const countQuery = `SELECT COUNT(*) FROM ${table} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${table}
      ${whereClause}
      ORDER BY received_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(dataQuery, dataParams);

    const response = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
      data: dataResult.rows
    };

    if (res.locals.cacheKey) {
      await redisClient.set(res.locals.cacheKey, JSON.stringify(response), 'EX', res.locals.ttl);
    }

    res.json(response);
  } catch (err) {
    throw new Error(`Error al obtener histórico: ${err.message}`);
  }
});

// 3. Estadísticas diarias
app.get('/api/stats/:table', cacheMiddleware('daily-stats', 300), async (req, res) => {
  const { table } = req.params;
  const { days = 7 } = req.query;

  try {
    const query = `
      SELECT
        DATE(received_at) AS date,
        COUNT(*) AS records,
        AVG(temperatura) AS avg_temperatura,
        MIN(temperatura) AS min_temperatura,
        MAX(temperatura) AS max_temperatura,
        AVG(humedad) AS avg_humedad
      FROM ${table}
      WHERE received_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date DESC
    `;

    const result = await pool.query(query);
    const response = {
      days: parseInt(days, 10),
      stats: result.rows
    };

    if (res.locals.cacheKey) {
      await redisClient.set(res.locals.cacheKey, JSON.stringify(response), 'EX', res.locals.ttl);
    }

    res.json(response);
  } catch (err) {
    throw new Error(`Error al generar estadísticas: ${err.message}`);
  }
});

// 4. Datos para gráfico por hora
// 4. Datos para gráfico por hora (mejorado para calidad_agua)
app.get('/api/chart/:table', cacheMiddleware('chart-data', 180), async (req, res) => {
  const { table } = req.params;
  const { hours = 24 } = req.query;

  // Configuración dinámica por tabla
  const tableConfigs = {
    temhum1: {
      fields: ['temperatura', 'humedad']
    },
    temhum2: {
      fields: ['temperatura', 'humedad']
    },
    calidad_agua: {
      fields: ['ec', 'ppm', 'ph']
    },
    luxometro: {
      fields: ['lux']
    }
  };

  if (!tableConfigs[table]) {
    return res.status(400).json({ error: 'Tabla no soportada para gráficos' });
  }

  const selectedFields = tableConfigs[table].fields;

  try {
    const selectFields = selectedFields
      .map(f => `AVG(${f}) AS avg_${f}`)
      .join(', ');

    const query = `
      SELECT
        DATE_TRUNC('hour', received_at) AS hour,
        ${selectFields}
      FROM ${table}
      WHERE received_at >= NOW() - INTERVAL '${hours} hours'
      GROUP BY hour
      ORDER BY hour ASC
    `;

    const result = await pool.query(query);

    const response = {
      hours: parseInt(hours, 10),
      data: result.rows.map(row => {
        const entry = {
          time: moment(row.hour).format('YYYY-MM-DD HH:mm')
        };
        selectedFields.forEach(f => {
          entry[f] = row[`avg_${f}`];
        });
        return entry;
      })
    };

    if (res.locals.cacheKey) {
      await redisClient.set(res.locals.cacheKey, JSON.stringify(response), 'EX', res.locals.ttl);
    }

    res.json(response);
  } catch (err) {
    throw new Error(`Error al generar datos para gráficos: ${err.message}`);
  }
});


// 5. Estado del sistema
app.get('/api/system-status', async (req, res) => {
  try {
    const pgResult = await pool.query('SELECT NOW() AS db_time');
    await redisClient.ping();

    res.json({
      status: 'OK',
      postgres: {
        connected: true,
        time: pgResult.rows[0].db_time
      },
      redis: {
        connected: true
      },
      uptime: process.uptime()
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      error: err.message
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
  console.log('Endpoints disponibles:');
  console.log(`  GET /api/latest/:table`);
  console.log(`  GET /api/history/:table`);
  console.log(`  GET /api/stats/:table`);
  console.log(`  GET /api/chart/:table`);
  console.log(`  GET /api/system-status`);
});

module.exports = {
  app,
  pool,
  redisClient,
  calcDewPoint
};
