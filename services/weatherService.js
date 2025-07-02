const axios = require('axios');
const pool = require('../config/db');
const { getChileDate, toChileISOString } = require('../config/timezone');

/**
 * Weather Service - Integración con WeatherAPI.com
 * Proporciona datos meteorológicos en tiempo real e históricos
 */
class WeatherService {
  constructor() {
    this.apiKey = process.env.WEATHER_API_KEY;
    this.baseUrl = 'http://api.weatherapi.com/v1';
    this.location = process.env.WEATHER_LOCATION || 'las chilcas,Villarrica,Chile'; // Default location
    
    if (!this.apiKey) {
      console.warn('[WeatherService] WEATHER_API_KEY no configurada. Servicio deshabilitado.');
    }
  }

  /**
   * Obtiene datos meteorológicos actuales
   * @param {string} location - Ubicación (opcional, usa default si no se especifica)
   * @returns {Promise<Object>} Datos meteorológicos actuales
   */
  async getCurrentWeather(location = null) {
    if (!this.apiKey) {
      throw new Error('Weather API key not configured');
    }

    try {
      const searchLocation = location || this.location;
      const url = `${this.baseUrl}/current.json`;
      
      console.log(`[WeatherService] Fetching current weather for: ${searchLocation}`);
      
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          q: searchLocation,
          aqi: 'yes', // Include air quality data
          lang: 'es'  // Spanish language
        },
        timeout: 10000
      });

      const data = response.data;
      
      // Formatear datos según nuestro schema
      const weatherData = {
        location: {
          name: data.location.name,
          region: data.location.region,
          country: data.location.country,
          lat: data.location.lat,
          lon: data.location.lon,
          timezone: data.location.tz_id,
          localtime: data.location.localtime
        },
        current: {
          temperatura: data.current.temp_c,
          humedad: data.current.humidity,
          sensacion_termica: data.current.feelslike_c,
          punto_rocio: this.calculateDewPoint(data.current.temp_c, data.current.humidity),
          presion: data.current.pressure_mb,
          velocidad_viento: data.current.wind_kph,
          direccion_viento: data.current.wind_dir,
          visibilidad: data.current.vis_km,
          uv_index: data.current.uv,
          condicion: data.current.condition.text,
          icono: data.current.condition.icon,
          calidad_aire: data.current.air_quality ? {
            co: data.current.air_quality.co,
            no2: data.current.air_quality.no2,
            o3: data.current.air_quality.o3,
            so2: data.current.air_quality.so2,
            pm2_5: data.current.air_quality.pm2_5,
            pm10: data.current.air_quality.pm10
          } : null,
          ultima_actualizacion: data.current.last_updated
        },
        timestamp: toChileISOString(),
        received_at: new Date().toISOString()
      };

      return weatherData;
    } catch (error) {
      console.error('[WeatherService] Error fetching current weather:', error.message);
      if (error.response) {
        console.error('[WeatherService] API Response:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Obtiene datos históricos del clima
   * @param {string} date - Fecha en formato YYYY-MM-DD
   * @param {string} location - Ubicación (opcional)
   * @returns {Promise<Object>} Datos históricos del día
   */
  async getHistoricalWeather(date, location = null) {
    if (!this.apiKey) {
      throw new Error('Weather API key not configured');
    }

    try {
      const searchLocation = location || this.location;
      const url = `${this.baseUrl}/history.json`;
      
      console.log(`[WeatherService] Fetching historical weather for: ${searchLocation} on ${date}`);
      
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          q: searchLocation,
          dt: date,
          lang: 'es'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('[WeatherService] Error fetching historical weather:', error.message);
      throw error;
    }
  }

  /**
   * Guarda datos meteorológicos actuales en la base de datos
   * @param {Object} weatherData - Datos meteorológicos formateados
   */
  async saveCurrentWeatherToDB(weatherData = null) {
    try {
      // Si no se proporcionan datos, obtenerlos de la API
      const data = weatherData || await this.getCurrentWeather();
      
      const query = `
        INSERT INTO weather_current (
          temperatura, humedad, sensacion_termica, punto_rocio,
          presion, velocidad_viento, direccion_viento, visibilidad,
          uv_index, condicion, icono, calidad_aire_pm2_5, calidad_aire_pm10,
          location_name, location_lat, location_lon, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id, received_at
      `;

      const values = [
        data.current.temperatura,
        data.current.humedad,
        data.current.sensacion_termica,
        data.current.punto_rocio,
        data.current.presion,
        data.current.velocidad_viento,
        data.current.direccion_viento,
        data.current.visibilidad,
        data.current.uv_index,
        data.current.condicion,
        data.current.icono,
        data.current.calidad_aire?.pm2_5 || null,
        data.current.calidad_aire?.pm10 || null,
        data.location.name,
        data.location.lat,
        data.location.lon,
        data.received_at
      ];

      const result = await pool.query(query, values);
      
      console.log(`[WeatherService] Weather data saved to DB with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      console.error('[WeatherService] Error saving weather data to DB:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene datos meteorológicos recientes de la base de datos
   * @param {number} hours - Número de horas hacia atrás (default: 24)
   * @returns {Promise<Array>} Array de datos meteorológicos
   */
  async getRecentWeatherFromDB(hours = 24) {
    try {
      const query = `
        SELECT 
          id, temperatura, humedad, sensacion_termica, punto_rocio,
          presion, velocidad_viento, direccion_viento, visibilidad,
          uv_index, condicion, icono, calidad_aire_pm2_5, calidad_aire_pm10,
          location_name, location_lat, location_lon, received_at
        FROM weather_current 
        WHERE received_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY received_at ASC
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('[WeatherService] Error getting recent weather from DB:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene las últimas lecturas meteorológicas
   * @param {number} limit - Número de registros (default: 1)
   * @returns {Promise<Array>} Últimas lecturas
   */
  async getLatestWeatherFromDB(limit = 1) {
    try {
      const query = `
        SELECT 
          id, temperatura, humedad, sensacion_termica, punto_rocio,
          presion, velocidad_viento, direccion_viento, visibilidad,
          uv_index, condicion, icono, calidad_aire_pm2_5, calidad_aire_pm10,
          location_name, location_lat, location_lon, received_at
        FROM weather_current 
        ORDER BY received_at DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('[WeatherService] Error getting latest weather from DB:', error.message);
      throw error;
    }
  }

  /**
   * Calcula el punto de rocío usando la fórmula de Magnus
   * @param {number} temp - Temperatura en Celsius
   * @param {number} humidity - Humedad relativa en %
   * @returns {number} Punto de rocío en Celsius
   */
  calculateDewPoint(temp, humidity) {
    const a = 17.27;
    const b = 237.7;
    
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    const dewPoint = (b * alpha) / (a - alpha);
    
    return Math.round(dewPoint * 10) / 10; // Redondear a 1 decimal
  }

  /**
   * Verifica si el servicio está configurado correctamente
   * @returns {boolean} True si está configurado
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Obtiene información de configuración del servicio
   * @returns {Object} Información de configuración
   */
  getServiceInfo() {
    return {
      configured: this.isConfigured(),
      location: this.location,
      apiUrl: this.baseUrl,
      hasApiKey: !!this.apiKey
    };
  }
}

module.exports = new WeatherService();