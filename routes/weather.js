const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const weatherService = require('../services/weatherService');
const logger = require('../config/logger');
const redisClient = require('../config/redis');
const cacheMiddleware = require('../middleware/cache')(redisClient);

const router = express.Router();

/**
 * @route GET /api/weather/current
 * @desc Get current weather data from WeatherAPI.com
 * @access Public
 */
router.get('/current', async (req, res, next) => {
  try {
    const { location } = req.query;
    
    logger.info('[WeatherRoutes] Fetching current weather data', { location });
    
    if (!weatherService.isConfigured()) {
      return res.status(503).json({
        error: 'Weather service not configured',
        message: 'WEATHER_API_KEY not set in environment variables'
      });
    }
    
    const weatherData = await weatherService.getCurrentWeather(location);
    
    res.json({
      success: true,
      data: weatherData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[WeatherRoutes] Error fetching current weather:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check WEATHER_API_KEY configuration'
      });
    }
    
    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'Invalid location',
        message: 'The specified location could not be found'
      });
    }
    
    next(error);
  }
});

/**
 * @route POST /api/weather/collect
 * @desc Manually trigger weather data collection and storage
 * @access Protected - Editor and above
 */
router.post('/collect', 
  protect, 
  authorize('admin', 'editor'),
  async (req, res, next) => {
    try {
      const { location } = req.body;
      
      logger.info('[WeatherRoutes] Manual weather data collection triggered', { 
        user: req.user.username,
        location 
      });
      
      if (!weatherService.isConfigured()) {
        return res.status(503).json({
          error: 'Weather service not configured',
          message: 'WEATHER_API_KEY not set in environment variables'
        });
      }
      
      const savedData = await weatherService.saveCurrentWeatherToDB(null, location);
      
      res.json({
        success: true,
        message: 'Weather data collected and saved successfully',
        data: savedData
      });
    } catch (error) {
      logger.error('[WeatherRoutes] Error in manual weather collection:', error);
      next(error);
    }
  }
);

/**
 * @route GET /api/weather/latest
 * @desc Get latest weather data from database
 * @access Public
 */
router.get('/latest', 
  cacheMiddleware('weather-latest', 300), // 5 minute cache
  async (req, res, next) => {
    try {
      const { limit = 1 } = req.query;
      
      logger.info('[WeatherRoutes] Fetching latest weather data from DB', { limit });
      
      const data = await weatherService.getLatestWeatherFromDB(parseInt(limit));
      
      if (data.length === 0) {
        return res.status(404).json({
          error: 'No weather data found',
          message: 'No weather data has been collected yet'
        });
      }
      
      res.json({
        success: true,
        data: limit == 1 ? data[0] : data,
        count: data.length
      });
    } catch (error) {
      logger.error('[WeatherRoutes] Error fetching latest weather data:', error);
      next(error);
    }
  }
);

/**
 * @route GET /api/weather/history
 * @desc Get historical weather data from database
 * @access Public
 */
router.get('/history', 
  cacheMiddleware('weather-history', 600), // 10 minute cache
  async (req, res, next) => {
    try {
      const { hours = 24, limit = 100, page = 1 } = req.query;
      
      logger.info('[WeatherRoutes] Fetching weather history', { hours, limit, page });
      
      let data;
      if (parseInt(hours) <= 168) { // Up to 1 week, use hours-based query
        data = await weatherService.getRecentWeatherFromDB(parseInt(hours));
      } else {
        // For longer periods, use pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const query = `
          SELECT * FROM weather_current 
          ORDER BY received_at DESC 
          LIMIT $1 OFFSET $2
        `;
        const pool = require('../config/db');
        const result = await pool.query(query, [parseInt(limit), offset]);
        data = result.rows;
      }
      
      res.json({
        success: true,
        data: data,
        count: data.length,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hours: parseInt(hours)
        }
      });
    } catch (error) {
      logger.error('[WeatherRoutes] Error fetching weather history:', error);
      next(error);
    }
  }
);

/**
 * @route GET /api/weather/chart
 * @desc Get weather data formatted for charts (similar to sensor data)
 * @access Public
 */
router.get('/chart', 
  cacheMiddleware('weather-chart', 300), // 5 minute cache
  async (req, res, next) => {
    try {
      const { hours = 24 } = req.query;
      
      logger.info('[WeatherRoutes] Fetching weather chart data', { hours });
      
      const data = await weatherService.getRecentWeatherFromDB(parseInt(hours));
      
      // Format data similar to sensor data for chart compatibility
      const chartData = data.map(record => ({
        id: record.id,
        temperatura: record.temperatura,
        humedad: record.humedad,
        sensacion_termica: record.sensacion_termica,
        punto_rocio: record.punto_rocio,
        presion: record.presion,
        velocidad_viento: record.velocidad_viento,
        uv_index: record.uv_index,
        visibilidad: record.visibilidad,
        condicion: record.condicion,
        received_at: record.received_at,
        time: record.received_at, // Add time field for chart compatibility
        chileTime: record.received_at // Charts expect this format
      }));
      
      res.json(chartData);
    } catch (error) {
      logger.error('[WeatherRoutes] Error fetching weather chart data:', error);
      next(error);
    }
  }
);

/**
 * @route GET /api/weather/stats
 * @desc Get weather statistics (daily averages, min/max, etc.)
 * @access Public
 */
router.get('/stats', 
  cacheMiddleware('weather-stats', 3600), // 1 hour cache
  async (req, res, next) => {
    try {
      const { days = 7 } = req.query;
      
      logger.info('[WeatherRoutes] Fetching weather statistics', { days });
      
      const pool = require('../config/db');
      const query = `
        SELECT 
          DATE(received_at) as fecha,
          COUNT(*) as total,
          AVG(temperatura) as avg_temp,
          MIN(temperatura) as min_temp,
          MAX(temperatura) as max_temp,
          AVG(humedad) as avg_humidity,
          MIN(humedad) as min_humidity,
          MAX(humedad) as max_humidity,
          AVG(sensacion_termica) as avg_feels_like,
          MIN(sensacion_termica) as min_feels_like,
          MAX(sensacion_termica) as max_feels_like,
          AVG(presion) as avg_pressure,
          MIN(presion) as min_pressure,
          MAX(presion) as max_pressure,
          AVG(velocidad_viento) as avg_wind_speed,
          MAX(velocidad_viento) as max_wind_speed,
          AVG(uv_index) as avg_uv_index,
          MAX(uv_index) as max_uv_index
        FROM weather_current
        WHERE received_at >= NOW() - INTERVAL '${parseInt(days)} days'
        GROUP BY DATE(received_at)
        ORDER BY fecha DESC
      `;
      
      const result = await pool.query(query);
      
      const stats = result.rows.map(day => ({
        fecha: day.fecha,
        total: day.total,
        temperatura: {
          promedio: parseFloat(day.avg_temp),
          minimo: parseFloat(day.min_temp),
          maximo: parseFloat(day.max_temp)
        },
        humedad: {
          promedio: parseFloat(day.avg_humidity),
          minimo: parseFloat(day.min_humidity),
          maximo: parseFloat(day.max_humidity)
        },
        sensacion_termica: {
          promedio: parseFloat(day.avg_feels_like),
          minimo: parseFloat(day.min_feels_like),
          maximo: parseFloat(day.max_feels_like)
        },
        presion: {
          promedio: parseFloat(day.avg_pressure),
          minimo: parseFloat(day.min_pressure),
          maximo: parseFloat(day.max_pressure)
        },
        viento: {
          velocidad_promedio: parseFloat(day.avg_wind_speed),
          velocidad_maxima: parseFloat(day.max_wind_speed)
        },
        uv_index: {
          promedio: parseFloat(day.avg_uv_index),
          maximo: parseFloat(day.max_uv_index)
        }
      }));
      
      res.json({
        success: true,
        data: stats,
        period: `${days} days`
      });
    } catch (error) {
      logger.error('[WeatherRoutes] Error fetching weather statistics:', error);
      next(error);
    }
  }
);

/**
 * @route GET /api/weather/config
 * @desc Get weather service configuration info
 * @access Protected - Admin only
 */
router.get('/config', 
  protect, 
  authorize('admin'),
  async (req, res, next) => {
    try {
      const serviceInfo = weatherService.getServiceInfo();
      
      res.json({
        success: true,
        config: serviceInfo
      });
    } catch (error) {
      logger.error('[WeatherRoutes] Error getting weather config:', error);
      next(error);
    }
  }
);

module.exports = router;