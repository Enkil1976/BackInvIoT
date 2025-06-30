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
const errorHandler = require('./middleware/errorHandler');
const { toChileLogString } = require('./config/timezone');

const app = express();

// CORS config
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

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

// Error handler
app.use(errorHandler);

// Start server and handle shutdown
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    pool.end();
    redisClient.disconnect();
    logger.info('Server terminated');
    process.exit(0);
  });
});
