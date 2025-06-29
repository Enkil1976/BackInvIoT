require('dotenv').config();
const Redis = require('ioredis');
const logger = require('./logger');

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

module.exports = redisClient;
