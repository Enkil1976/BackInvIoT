require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.PG_URI,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT 1')
  .then(() => logger.info('✅ PostgreSQL connected'))
  .catch(err => logger.error('PostgreSQL connection error:', err));

pool.on('error', (err) => logger.error(`PostgreSQL Pool Error: ${err.message}`));

module.exports = pool;
