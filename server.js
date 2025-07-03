require('dotenv').config();
// Configurar zona horaria de Chile ANTES de cualquier otra importación
require('./config/timezone');
const express = require('express');
const cors = require('cors');
const logger = require('./config/logger');
const pool = require('./config/db');
const redisClient = require('./config/redis');
const healthRoutes = require('./routes/health');
const dataRoutes = require('./routes/data');
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const weatherRoutes = require('./routes/weather');
const notificationRoutes = require('./routes/notifications');
const notificationTemplateRoutes = require('./routes/notificationTemplate');
const errorHandler = require('./middleware/errorHandler');
const { connectMqtt, disconnectMqtt } = require('./services/mqttService');
const weatherScheduler = require('./services/weatherScheduler');
const { startRulesEngine, stopRulesEngine, initRulesEngineService } = require('./services/rulesEngineService');
const { initNotificationService } = require('./services/notificationService');
const { toChileLogString } = require('./config/timezone');

const app = express();

// CORS config
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'];

logger.info(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);

const corsOptions = {
  origin: function (origin, callback) {
    logger.info(`Incoming request from origin: ${origin}`);
    if (!origin) return callback(null, true);
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
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Log all incoming requests
app.use((req, res, next) => {
  logger.info(`[${toChileLogString()}] ${req.method} ${req.path} from ${req.get('Origin') || 'no-origin'}`);
  next();
});
app.use(express.json());

 // Mount routes
app.use('/api', healthRoutes);
app.use('/api', dataRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-templates', notificationTemplateRoutes);

// Error handler
app.use(errorHandler);

// Start server and handle shutdown
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  
  // Inicializar servicio MQTT
  logger.info('🔌 Initializing MQTT service...');
  connectMqtt();
  
  // Inicializar scheduler de clima
  logger.info('🌤️ Initializing Weather Scheduler...');
  try {
    weatherScheduler.start();
    logger.info('✅ Weather Scheduler initialized successfully');
  } catch (error) {
    logger.error('❌ Weather Scheduler initialization failed:', error);
  }

  // Inicializar servicios de notificaciones y motor de reglas
  logger.info('🔔 Initializing Notification Service...');
  try {
    initNotificationService();
    logger.info('✅ Notification Service initialized successfully');
  } catch (error) {
    logger.error('❌ Notification Service initialization failed:', error);
  }

  logger.info('⚙️ Initializing Rules Engine...');
  try {
    initRulesEngineService();
    startRulesEngine();
    logger.info('✅ Rules Engine initialized and started successfully');
  } catch (error) {
    logger.error('❌ Rules Engine initialization failed:', error);
  }
});

process.on('SIGTERM', () => {
  server.close(() => {
    // Desconectar servicios
    disconnectMqtt();
    weatherScheduler.stop();
    stopRulesEngine();
    pool.end();
    redisClient.disconnect();
    logger.info('Server terminated');
    process.exit(0);
  });
});

// Manejo adicional de señales para shutdown limpio
process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    disconnectMqtt();
    weatherScheduler.stop();
    stopRulesEngine();
    pool.end();
    redisClient.disconnect();
    logger.info('Server terminated');
    process.exit(0);
  });
});

module.exports = app;
