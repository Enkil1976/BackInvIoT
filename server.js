require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const moment = require('moment');
const winston = require('winston');
const { connectMqtt, disconnectMqtt, mqttEvents } = require('./services/mqttService'); // Import mqttEvents
const WebSocket = require('ws'); // Require WebSocket library
const { startScheduler, stopScheduler } = require('./services/schedulerEngineService'); // Import scheduler functions
const { startRulesEngine, stopRulesEngine } = require('./services/rulesEngineService'); // Import rules engine functions
const { startWorker: startCriticalActionWorker, stopWorker: stopCriticalActionWorker } = require('./workers/criticalActionWorker'); // Import worker
const url = require('url'); // For parsing URL query parameters
const jwt = require('jsonwebtoken'); // For JWT verification
const notificationService = require('./services/notificationService'); // Import notification service

let isShuttingDown = false; // Flag for graceful shutdown

// Configuración de logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Configuración de Redis (con variables de entorno)
const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USER,
  connectTimeout: 5000,
  retryStrategy: (times) => Math.min(times * 100, 5000),
});

redisClient.on('error', (err) => logger.error(`Redis Error: ${err.message}`));
redisClient.on('connect', () => logger.info('✅ Redis connected'));

// Pool de PostgreSQL mejorado
const pool = new Pool({
  connectionString: process.env.PG_URI,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Verificar conexión al iniciar
pool.query('SELECT 1')
  .then(() => logger.info('✅ PostgreSQL connected'))
  .catch(err => logger.error('PostgreSQL connection error:', err));

pool.on('error', (err) => logger.error(`PostgreSQL Pool Error: ${err.message}`));

// Initialize and connect MQTT client
connectMqtt();

const app = express();

const authRouter = require('./routes/auth');
const deviceRoutes = require('./routes/devices'); // Import device routes
const operationRoutes = require('./routes/operations'); // Import operation routes
const scheduledOperationRoutes = require('./routes/scheduledOperations'); // Import scheduled operation routes
const ruleRoutes = require('./routes/rules'); // Import rule routes
const systemAdminRoutes = require('./routes/systemAdmin'); // Import system admin routes

// CORS Config (mejorado para producción)
const allowedOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : 
  ['http://localhost:3000', 'http://localhost:3001'];

// Log allowed origins for debugging
logger.info(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);

const corsOptions = {
  origin: function (origin, callback) {
    logger.info(`Incoming request from origin: ${origin}`);
    
    // Permitir requests sin origen (como aplicaciones móviles o curl)
    if (!origin) return callback(null, true);
    
    // Verificar si el origen está en la lista blanca
    if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = `The CORS policy for this site does not allow access from the specified origin: ${origin}`;
    logger.warn(msg);
    return callback(new Error(msg), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  credentials: true,
  maxAge: 86400, // 24 horas
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS with the configuration
app.use(cors(corsOptions));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.get('Origin') || 'no-origin'}`);
  next();
});
app.use(express.json());

// Montar rutas de autenticación
app.use('/api/auth', authRouter);
app.use('/api/devices', deviceRoutes); // Use device routes
app.use('/api/operations', operationRoutes); // Use operation routes
app.use('/api/scheduled-operations', scheduledOperationRoutes); // Use scheduled operation routes
app.use('/api/rules', ruleRoutes); // Use rule routes
app.use('/api/system', systemAdminRoutes); // Use system admin routes

// Cache Middleware (con invalidación por escritura)
const cacheMiddleware = (key, ttl = 30) => async (req, res, next) => {
  const cacheKey = `${key}:${req.method}:${req.originalUrl}`;
  
  try {
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

// Validación simplificada sin express-validator
const validateTableParam = (req, res, next) => {
  const validTables = ['luxometro', 'calidad_agua', 'temhum1', 'temhum2'];
  if (!validTables.includes(req.params.table)) {
    return res.status(400).json({ error: 'Tabla no válida' });
  }
  next();
};

// Endpoints para datos históricos
app.get('/api/chart/:table',
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

app.get('/api/history/:table', 
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

app.get('/api/stats/:table',
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

// Endpoint: Último registro (con validación)
app.get('/api/latest/:table',
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

// Health Check Mejorado
app.get('/api/health', async (req, res) => {
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

// Middleware de errores profesional
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  logger.error(`${status} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  res.status(status).json({
    error: message,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor con manejo de cierre
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

// WebSocket Server Setup
const wss = new WebSocket.Server({ server });
app.locals.wss = wss; // Make wss available in app.locals for shutdown and broadcasting
app.locals.wsSubscriptions = new Map(); // Map<roomName, Set<WebSocketClient>>

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'];
  logger.info(`WebSocket: Connection attempt from ${clientIp}. Path: ${req.url}`);

  // Parse token from query parameter
  let token;
  try {
    const parsedUrl = url.parse(req.url, true); // true to parse query string
    token = parsedUrl.query.token;
  } catch (e) {
    logger.error(`WebSocket: Error parsing connection URL for token from ${clientIp}:`, e);
    ws.send(JSON.stringify({ type: 'error', event: 'authentication_failed', message: 'Invalid connection request.' }));
    ws.terminate();
    return;
  }

  if (!token) {
    logger.warn(`WebSocket: Connection attempt from ${clientIp} without token. Terminating.`);
    ws.send(JSON.stringify({ type: 'error', event: 'authentication_failed', message: 'Authentication token required.' }));
    ws.terminate();
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
    ws.user = { id: decoded.id, username: decoded.username, role: decoded.role }; // Attach user to ws object

    logger.info(`WebSocket: Client authenticated and connected: User ${ws.user.username} (ID: ${ws.user.id}, Role: ${ws.user.role}) from ${clientIp}`);

    // WebSocket message handler with subscription logic
    ws.on('message', (messageString) => {
      let parsedMessage;
      try {
        // Ensure messageString is treated as string before parsing
        parsedMessage = JSON.parse(messageString.toString());
        logger.info(`WebSocket: Received message from ${ws.user.username}: %j`, parsedMessage);
      } catch (e) {
        logger.warn(`WebSocket: Received non-JSON message from ${ws.user.username}: ${messageString.toString().substring(0,100)}...`);
        ws.send(JSON.stringify({ type: 'error', event: 'invalid_message_format', message: 'Message must be valid JSON.'}));
        return;
      }

      if (parsedMessage.type === 'subscribe' && parsedMessage.room && typeof parsedMessage.room === 'string') {
        const roomName = parsedMessage.room;
        // Basic validation for room name format (can be expanded)
        if (!roomName.match(/^(device_events:\w+|sensor_latest:[\w:-]+|operations_log:new)$/)) {
          logger.warn(`WebSocket: User ${ws.user.username} attempted to subscribe to invalid room format: '${roomName}'`);
          ws.send(JSON.stringify({ type: 'subscription_error', room: roomName, message: 'Invalid room name format or unsupported room.' }));
          return;
        }

        if (!app.locals.wsSubscriptions.has(roomName)) {
          app.locals.wsSubscriptions.set(roomName, new Set());
        }
        app.locals.wsSubscriptions.get(roomName).add(ws);
        logger.info(`WebSocket: User ${ws.user.username} subscribed to room '${roomName}'. Room size: ${app.locals.wsSubscriptions.get(roomName).size}`);
        ws.send(JSON.stringify({ type: 'subscribed', room: roomName, message: `Successfully subscribed to room '${roomName}'.` }));

      } else if (parsedMessage.type === 'unsubscribe' && parsedMessage.room && typeof parsedMessage.room === 'string') {
        const roomName = parsedMessage.room;
        if (app.locals.wsSubscriptions.has(roomName)) {
          const room = app.locals.wsSubscriptions.get(roomName);
          room.delete(ws);
          logger.info(`WebSocket: User ${ws.user.username} unsubscribed from room '${roomName}'. New room size: ${room.size}`);
          if (room.size === 0) { // Optional: clean up empty rooms
              // logger.debug(`WebSocket: Room '${roomName}' is now empty. Removing from subscriptions map.`);
              // app.locals.wsSubscriptions.delete(roomName);
          }
        } else {
          logger.warn(`WebSocket: User ${ws.user.username} attempted to unsubscribe from non-existent or empty room '${roomName}'.`);
        }
        ws.send(JSON.stringify({ type: 'unsubscribed', room: roomName, message: `Successfully unsubscribed from room '${roomName}'.` }));

      } else if (parsedMessage.type === 'ping') { // Basic keep-alive
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } else {
        logger.warn(`WebSocket: Received unhandled message type from ${ws.user.username}: %j`, parsedMessage);
        // Optional: send an error back for unhandled types
        // ws.send(JSON.stringify({ type: 'error', event: 'unknown_message_type', message: `Unknown message type: '${parsedMessage.type}'`}));
      }
    });

    ws.on('close', (code, reason) => {
      const reasonText = reason instanceof Buffer ? reason.toString() : reason;
      logger.info(`WebSocket: Client disconnected: User ${ws.user?.username || 'Unknown'} (ID: ${ws.user?.id}). Code: ${code}, Reason: ${reasonText || 'No reason given'}`);

      // Remove client from all subscribed rooms
      if (app.locals.wsSubscriptions) {
        app.locals.wsSubscriptions.forEach((roomSet, roomName) => {
          if (roomSet.has(ws)) {
            roomSet.delete(ws);
            logger.info(`WebSocket: Removed user ${ws.user?.username} from room '${roomName}' on disconnect. New room size: ${roomSet.size}`);
            if (roomSet.size === 0) {
                // logger.debug(`WebSocket: Room '${roomName}' is now empty after disconnect. Removing from subscriptions map.`);
                // app.locals.wsSubscriptions.delete(roomName);
            }
          }
        });
      }
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket: Error for user ${ws.user?.username || 'Unknown'}:`, error);
    });

    ws.send(JSON.stringify({ type: 'info', event: 'connection_success', message: 'WebSocket connection established and authenticated.' }));

  } catch (error) {
    logger.warn(`WebSocket: Invalid token for ${clientIp}. Connection terminated. Error: ${error.message}`);
    ws.send(JSON.stringify({ type: 'error', event: 'authentication_failed', message: `Authentication failed: ${error.message}` }));
    ws.terminate();
  }
});

app.locals.broadcastWebSocket = (messageObject) => {
  if (!app.locals.wss) {
    logger.error('WebSocket server (wss) not initialized on app.locals. Cannot broadcast.');
    return;
  }
  const messageString = JSON.stringify(messageObject);
  logger.info(`Broadcasting WebSocket message to all clients: ${messageString}`);
  app.locals.wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageString);
      } catch (error) {
        logger.error('Error sending message to a WebSocket client:', error);
      }
    }
  });
};

/**
 * Sends a message to all WebSocket clients authenticated as a specific user ID.
 * @param {string|number} userId - The ID of the user to target.
 * @param {object} messageObject - The message object to send (will be stringified).
 */
app.locals.sendToUser = (userId, messageObject) => {
  if (!app.locals.wss) {
    logger.error('WebSocket server (wss) not initialized on app.locals. Cannot send to user.');
    return 0; // Number of clients messaged
  }
  if (userId === undefined || userId === null) {
    logger.warn('sendToUser called with null or undefined userId.');
    return 0;
  }
  const messageString = JSON.stringify(messageObject);
  let sentCount = 0;
  logger.info(`Attempting to send WebSocket message to userId '${userId}': ${messageString.substring(0,100)}...`);

  app.locals.wss.clients.forEach((client) => {
    // Ensure client.user and client.user.id exist and match the target userId
    // Note: client.user.id is typically an integer from the DB/JWT. Ensure userId is of a comparable type.
    // If userId comes from a path param, it might be a string.
    if (client.readyState === WebSocket.OPEN && client.user && client.user.id !== undefined && String(client.user.id) === String(userId)) {
      try {
        client.send(messageString);
        sentCount++;
      } catch (error) {
        logger.error(`Error sending message to WebSocket client for userId ${userId} (client username ${client.user.username}):`, error);
      }
    }
  });
  if (sentCount > 0) {
    logger.info(`Message sent to ${sentCount} WebSocket client(s) for userId '${userId}'.`);
  } else {
    logger.info(`No active WebSocket clients found for userId '${userId}'.`);
  }
  return sentCount;
};

/**
 * Sends a message to all WebSocket clients subscribed to a specific room.
 * @param {string} roomName - The name of the room to target.
 * @param {object} messageObject - The message object to send (will be stringified).
 * @returns {number} The number of clients the message was successfully sent to.
 */
app.locals.sendToRoom = (roomName, messageObject) => {
  if (!app.locals.wss || !app.locals.wsSubscriptions) {
    logger.error('WebSocket server (wss) or subscriptions map not initialized. Cannot send to room.');
    return 0;
  }
  if (!roomName || typeof roomName !== 'string' || roomName.trim() === '') {
    logger.warn('sendToRoom called with invalid or missing roomName.');
    return 0;
  }

  const room = app.locals.wsSubscriptions.get(roomName);
  if (!room || room.size === 0) {
    logger.debug(`sendToRoom: No clients subscribed to room '${roomName}' or room does not exist.`);
    return 0;
  }

  const messageString = JSON.stringify(messageObject);
  let sentCount = 0;
  logger.info(`Attempting to send WebSocket message to room '${roomName}' (Subscribers: ${room.size}). Message (preview): ${messageString.substring(0,150)}...`);

  room.forEach((client) => {
    // Ensure client.user is checked as it's set after successful auth
    if (client.readyState === WebSocket.OPEN && client.user) {
      try {
        client.send(messageString);
        sentCount++;
      } catch (error) {
        logger.error(`Error sending message to WebSocket client in room '${roomName}' (User: ${client.user.username} ID: ${client.user.id}):`, error);
      }
    } else if (client.readyState !== WebSocket.OPEN) {
        logger.warn(`sendToRoom: Client in room '${roomName}' (User: ${client.user?.username}) not in OPEN state (State: ${client.readyState}). Skipping.`);
    } else if (!client.user) {
        logger.warn(`sendToRoom: Client in room '${roomName}' without user object (likely pre-auth or error during auth). Skipping.`);
    }
  });

  if (sentCount > 0) {
    logger.info(`Message successfully sent to ${sentCount} client(s) in room '${roomName}'.`);
  } else {
    logger.info(`Message not sent to any clients in room '${roomName}' (possibly no clients in OPEN state or other issues).`);
  }
  return sentCount;
};

/**
 * Sends a message to all WebSocket clients authenticated with a specific role.
 * @param {string} role - The role to target (e.g., 'admin', 'editor').
 * @param {object} messageObject - The message object to send (will be stringified).
 */
app.locals.sendToRole = (role, messageObject) => {
  if (!app.locals.wss) {
    logger.error('WebSocket server (wss) not initialized on app.locals. Cannot send to role.');
    return 0;
  }
  if (!role || typeof role !== 'string') {
      logger.warn('sendToRole called with invalid or missing role.');
      return 0;
  }
  const messageString = JSON.stringify(messageObject);
  let sentCount = 0;
  logger.info(`Attempting to send WebSocket message to role '${role}': ${messageString.substring(0,100)}...`);

  app.locals.wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.user && client.user.role === role) {
      try {
        client.send(messageString);
        sentCount++;
      } catch (error) {
        logger.error(`Error sending message to WebSocket client for role ${role} (client username ${client.user.username}):`, error);
      }
    }
  });
  if (sentCount > 0) {
    logger.info(`Message sent to ${sentCount} WebSocket client(s) with role '${role}'.`);
  } else {
    logger.info(`No active WebSocket clients found with role '${role}'.`);
  }
  return sentCount;
};

logger.info('✅ WebSocket server initialized and attached to HTTP server.');

// Set up MQTT Event Listener for sensor_latest_update
if (mqttEvents && app.locals.sendToRoom) {
  mqttEvents.on('sensor_latest_update', ({ sensorId, data }) => {
    const roomName = `sensor_latest:${sensorId}`;
    logger.info(`Event: 'sensor_latest_update' for sensorId '${sensorId}'. Publishing to WebSocket room '${roomName}'.`);
    app.locals.sendToRoom(roomName, {
      type: 'sensor_reading_updated', // Event type for WebSocket clients
      sensor_id: sensorId,
      data: data // The latest values that were set in Redis
    });
  });
  logger.info('MQTT Event listener for "sensor_latest_update" is set up for WebSocket broadcasts.');
} else {
  logger.warn('Could not set up MQTT event listener for WebSockets: mqttEvents or app.locals.sendToRoom missing.');
}

// Start the scheduler engine
startScheduler();

// Start the rules engine
startRulesEngine(); // This will use the _broadcastWebSocket set by its init function

// Start the Critical Action Worker
// This worker already accepts broadcastWebSocket via its startWorker function argument, which is good.
if (app.locals.broadcastWebSocket) {
  startCriticalActionWorker(app.locals.broadcastWebSocket);
} else {
  logger.error("CriticalActionWorker cannot start with broadcast capability: app.locals.broadcastWebSocket is not defined. Worker will start without it.");
  startCriticalActionWorker();
}


// Initialize services with dependencies
logger.info('Initializing services with dependencies...');
const deviceService = require('./services/deviceService');
if (deviceService.initDeviceService) {
  deviceService.initDeviceService({
    broadcastWebSocket: app.locals.broadcastWebSocket,
    sendToRole: app.locals.sendToRole, // Add sendToRole
    sendToRoom: app.locals.sendToRoom // Add sendToRoom
  });
} else {
  logger.warn('initDeviceService not found on deviceService module. WebSocket broadcasts from this service may not work as expected.');
}

const operationService = require('./services/operationService');
if (operationService.initOperationService) {
  operationService.initOperationService({
    broadcastWebSocket: app.locals.broadcastWebSocket,
    sendToRoom: app.locals.sendToRoom // Add sendToRoom for operations_log:new
  });
} else {
  logger.warn('initOperationService not found on operationService module. WebSocket broadcasts from this service may not work.');
}

const rulesEngineActualService = require('./services/rulesEngineService'); // Renamed to avoid conflict with startRulesEngine
if (rulesEngineActualService.initRulesEngineService) {
  rulesEngineActualService.initRulesEngineService({
    broadcastWebSocket: app.locals.broadcastWebSocket,
    sendToRoom: app.locals.sendToRoom // Add sendToRoom for potential rule-specific rooms
  });
} else {
  logger.warn('initRulesEngineService not found on rulesEngineService module. WebSocket broadcasts from this service may not work.');
}

const schedulerEngineService = require('./services/schedulerEngineService'); // Renamed to avoid conflict
if (schedulerEngineService.initSchedulerEngineService) {
  schedulerEngineService.initSchedulerEngineService({
    broadcastWebSocket: app.locals.broadcastWebSocket,
    sendToRoom: app.locals.sendToRoom // Add sendToRoom for potential schedule-specific rooms
  });
} else {
  logger.warn('initSchedulerEngineService not found on schedulerEngineService module. WebSocket broadcasts from this service may not work.');
}

if (notificationService.initNotificationService) {
  notificationService.initNotificationService({
    broadcastWebSocket: app.locals.broadcastWebSocket,
    sendToRoom: app.locals.sendToRoom // Add sendToRoom for notification rooms
  });
} else {
  logger.warn('initNotificationService not found on notificationService module.');
}
logger.info('Services initialized.');


// Manejo de cierre adecuado
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: Initiating graceful shutdown...');
  isShuttingDown = true;

  // 1. Stop background tasks that might interfere with shutdown or use resources
  logger.info('Stopping background services (Worker, Rules Engine, Scheduler)...');
  if (typeof stopCriticalActionWorker === 'function') {
    stopCriticalActionWorker().catch(err => logger.error('Error stopping Critical Action Worker:', err));
  }
  if (typeof stopRulesEngine === 'function') {
    stopRulesEngine();
  }
  if (typeof stopScheduler === 'function') {
    stopScheduler();
  }

  // Overall shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out overall (20s). Forcing exit.');
    process.exit(1);
  }, 20000);

  // 2. Close HTTP server - this stops accepting new connections
  logger.info('Closing HTTP server...');
  server.close((err) => {
    if (err) {
      logger.error('Error during HTTP server close:', err);
    } else {
      logger.info('HTTP server closed.');
    }

    // 3. Close WebSocket server
    if (app.locals.wss && typeof app.locals.wss.close === 'function') {
      logger.info('Closing WebSocket server...');
      let wsClosed = false;
      const wsCloseTimeout = setTimeout(() => {
        if (!wsClosed) {
          logger.warn('WebSocket server close timed out (5s). Forcing client termination.');
          if (app.locals.wss && app.locals.wss.clients) {
            app.locals.wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) client.terminate();
            });
          }
        }
      }, 5000);

      app.locals.wss.close(() => {
        wsClosed = true;
        clearTimeout(wsCloseTimeout);
        logger.info('WebSocket server closed.');
        disconnectResourcesAndExit();
      });
    } else {
      logger.info('WebSocket server not initialized or already closed. Proceeding with resource disconnection.');
      disconnectResourcesAndExit();
    }
  });

  function disconnectResourcesAndExit() {
    logger.info('Disconnecting resources (MQTT, Redis, PostgreSQL)...');
    let resourcesPending = 3;

    const resourceClosed = (resourceName) => {
      logger.info(`${resourceName} disconnected/closed.`);
      resourcesPending--;
      if (resourcesPending === 0) {
        logger.info('All resources disconnected/closed gracefully.');
        clearTimeout(shutdownTimeout);
        process.exit(0);
      }
    };

    if (typeof disconnectMqtt === 'function') {
      try {
        disconnectMqtt();
        resourceClosed('MQTT Client');
      } catch (e) { logger.error('Error disconnecting MQTT (sync call):', e); resourceClosed('MQTT Client (error)');}
    } else { resourceClosed('MQTT Client (not configured)'); }

    if (redisClient && typeof redisClient.quit === 'function') {
      redisClient.quit((err) => {
        if(err) logger.error('Error disconnecting main Redis client with quit:', err);
        resourceClosed('Main Redis Client');
      }).catch(err => {
        logger.error('Error during main Redis client quit promise:', err);
        if(redisClient.status !== 'end') redisClient.disconnect();
        resourceClosed('Main Redis Client (quit error)');
      });
    } else if (redisClient && typeof redisClient.disconnect === 'function') {
       redisClient.disconnect();
       resourceClosed('Main Redis Client (disconnect)');
    } else { resourceClosed('Main Redis Client (not configured)');}

    if (pool && typeof pool.end === 'function') {
      pool.end(() => {
        resourceClosed('PostgreSQL Pool');
      }).catch(err => {
         logger.error('Error ending PostgreSQL pool:', err);
         resourceClosed('PostgreSQL Pool (error)');
      });
    } else { resourceClosed('PostgreSQL Pool (not configured)');}
  }
});

// Función de punto de rocío (mejorada)
function calcDewPoint(temp, hum) {
  if (temp == null || hum == null) return null;
  
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * temp) / (b + temp) + Math.log(hum / 100);
  return Number((b * alpha / (a - alpha)).toFixed(2));
}

module.exports = { app, pool, redisClient, calcDewPoint };
