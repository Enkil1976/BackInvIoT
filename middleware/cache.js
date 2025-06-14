// Middleware de cache con Redis
const cacheMiddleware = (redisClient) => (key, ttl = 30) => async (req, res, next) => {
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

module.exports = cacheMiddleware;
