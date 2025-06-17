const mqtt = require('mqtt');
const pool = require('../config/db');
const logger = require('../config/logger');
const redisClient = require('../config/redis'); // Import Redis client

const SENSOR_HISTORY_MAX_LENGTH = parseInt(process.env.SENSOR_HISTORY_MAX_LENGTH, 10) || 100; // Max N readings

// Environment variables for MQTT connection (ensure these are set in your .env file)
// MQTT_BROKER_URL: Full URL to your MQTT broker (e.g., mqtt://your_broker.com:1883 or ws://your_broker.com:8083/mqtt for WebSocket)
// MQTT_USERNAME: Username for MQTT broker authentication (optional)
// MQTT_PASSWORD: Password for MQTT broker authentication (optional)
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io'; // Default to public EMQX broker for now
const MQTT_CLIENT_ID = `mqtt_client_${Math.random().toString(16).slice(3)}`;
const MQTT_TOPIC_TO_SUBSCRIBE = 'Invernadero/#';

let client;

const connectMqtt = () => {
  const options = {
    clientId: MQTT_CLIENT_ID,
    clean: true,
    connectTimeout: 4000,
    username: process.env.MQTT_USERNAME, // Uncomment and set in .env if auth is needed
    password: process.env.MQTT_PASSWORD, // Uncomment and set in .env if auth is needed
    reconnectPeriod: 1000,
  };

  client = mqtt.connect(MQTT_BROKER_URL, options);

  client.on('connect', () => {
    logger.info('✅ MQTT connected to broker');
    subscribeToTopics();
  });

  client.on('reconnect', () => {
    logger.info('🔄 MQTT reconnecting...');
  });

  client.on('error', (error) => {
    logger.error('MQTT connection error:', error);
  });

  client.on('message', (topic, message) => {
    handleIncomingMessage(topic, message);
  });
};

const subscribeToTopics = () => {
  client.subscribe(MQTT_TOPIC_TO_SUBSCRIBE, (err) => {
    if (!err) {
      logger.info(`✅ Subscribed to topic: ${MQTT_TOPIC_TO_SUBSCRIBE}`);
    } else {
      logger.error('MQTT subscription error:', err);
    }
  });
};

const handleIncomingMessage = async (topic, message) => {
  logger.info(`📨 Message received on topic ${topic}: ${message.toString()}`);
  const topicParts = topic.split('/');
  const receivedAt = new Date();
  let query;
  let values;
  let tableName;
  // idOrGroup will be used for TemHum1, TemHum2, Agua, or a PowerSensorDeviceID
  let idOrGroup;

  if (topicParts.length === 3 && topicParts[0] === 'Invernadero') {
    idOrGroup = topicParts[1];
    const dataType = topicParts[2];

    if ((idOrGroup === 'TemHum1' || idOrGroup === 'TemHum2') && dataType === 'data') {
      tableName = idOrGroup.toLowerCase();
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (error) {
        logger.error(`Failed to parse JSON for ${topic}: ${error.message}`);
        return;
      }

      if (data.temperatura === undefined || data.humedad === undefined || !data.stats) {
        logger.warn(`Missing core fields in TemHum data for ${tableName}: ${JSON.stringify(data)}`);
        return;
      }

      query = `
        INSERT INTO ${tableName} (
          temperatura, humedad, heatindex, dewpoint, rssi, boot, mem,
          stats_tmin, stats_tmax, stats_tavg, stats_hmin, stats_hmax, stats_havg,
          stats_total, stats_errors, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `;
      values = [
        data.temperatura, data.humedad, data.heatindex, data.dewpoint, data.rssi, data.boot, data.mem,
        data.stats.tmin, data.stats.tmax, data.stats.tavg, data.stats.hmin, data.stats.hmax, data.stats.havg,
        data.stats.total, data.stats.errors, receivedAt
      ];

      // Update Redis cache for TemHum sensor
      try {
        const sensorKey = `sensor_latest:${tableName}`; // e.g., sensor_latest:temhum1
        await redisClient.hmset(sensorKey,
          'temperatura', data.temperatura,
          'humedad', data.humedad,
          'heatindex', data.heatindex,
          'dewpoint', data.dewpoint,
          'rssi', data.rssi,
          'last_updated', receivedAt.toISOString()
        );
        logger.info(`Updated Redis cache for ${sensorKey}`);

        // Add to Redis List for history (temperatura)
        const tempListKey = `sensor_history:${tableName}:temperatura`;
        const tempDataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data.temperatura });
        redisClient.multi().lpush(tempListKey, tempDataPoint).ltrim(tempListKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec().catch(err => {
            logger.error(`Failed to update Redis list for ${tempListKey}:`, err);
        });

        // Add to Redis List for history (humedad)
        const humListKey = `sensor_history:${tableName}:humedad`;
        const humDataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data.humedad });
        redisClient.multi().lpush(humListKey, humDataPoint).ltrim(humListKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec().catch(err => {
            logger.error(`Failed to update Redis list for ${humListKey}:`, err);
        });
        // Add other TemHum fields to lists if needed (e.g. heatindex, dewpoint, rssi)

      } catch (redisError) {
        logger.error(`Failed to update Redis cache for ${tableName}:`, redisError);
      }

    } else if (idOrGroup === 'Agua') {
      tableName = 'calidad_agua';
      if (dataType === 'data') {
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch (error) {
          logger.error(`Failed to parse JSON for ${topic}: ${error.message}`);
          return;
        }
        if (data.ph === undefined || data.ec === undefined || data.ppm === undefined) {
          logger.warn(`Missing ph, ec, or ppm in Agua data: ${JSON.stringify(data)}`);
          return;
        }
        query = `INSERT INTO ${tableName} (ph, ec, ppm, temperatura_agua, received_at) VALUES ($1, $2, $3, $4, $5)`;
        values = [data.ph, data.ec, data.ppm, data.temperatura_agua || null, receivedAt];

        // Update Redis cache for Agua/data
        try {
          const sensorKey = `sensor_latest:calidad_agua`;
          await redisClient.hmset(sensorKey,
            'ph', data.ph,
            'ec', data.ec,
            'ppm', data.ppm,
            // If data.temperatura_agua is present in this payload, cache it too.
            ...(data.temperatura_agua !== undefined && { 'temperatura_agua': data.temperatura_agua }),
            'last_updated_multiparam', receivedAt.toISOString()
          );
          logger.info(`Updated Redis cache for ${sensorKey} (multi-param)`);

          // Add to Redis Lists for history (pH, EC, PPM)
          const paramsToLog = ['ph', 'ec', 'ppm'];
          if (data.temperatura_agua !== undefined) paramsToLog.push('temperatura_agua');

          for (const param of paramsToLog) {
              if (data[param] !== undefined) {
                  const listKey = `sensor_history:calidad_agua:${param}`;
                  const dataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data[param] });
                  redisClient.multi().lpush(listKey, dataPoint).ltrim(listKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec().catch(err => {
                      logger.error(`Failed to update Redis list for ${listKey}:`, err);
                  });
              }
          }
        } catch (redisError) {
          logger.error(`Failed to update Redis cache for ${sensorKey} (multi-param):`, redisError);
        }

      } else if (dataType === 'Temperatura') {
        const waterTemp = parseFloat(message.toString());
        if (isNaN(waterTemp)) {
          logger.error(`Failed to parse water temperature as a number from topic ${topic}: ${message.toString()}`);
          return;
        }
        query = `INSERT INTO ${tableName} (temperatura_agua, received_at) VALUES ($1, $2)`;
        values = [waterTemp, receivedAt];

        // Update Redis cache for Agua/Temperatura
        try {
          const sensorKey = `sensor_latest:calidad_agua`;
          await redisClient.hmset(sensorKey,
            'temperatura_agua', waterTemp,
            'last_updated_temp_agua', receivedAt.toISOString()
          );
          logger.info(`Updated Redis cache for ${sensorKey} (temp_agua)`);

          // Add to Redis List for history (temperatura_agua)
          const tempListKey = `sensor_history:calidad_agua:temperatura_agua`;
          const tempDataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: waterTemp });
          redisClient.multi().lpush(tempListKey, tempDataPoint).ltrim(tempListKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec().catch(err => {
              logger.error(`Failed to update Redis list for ${tempListKey}:`, err);
          });

        } catch (redisError) {
          logger.error(`Failed to update Redis cache for ${sensorKey} (temp_agua):`, redisError);
        }

      } else {
        logger.warn(`Unknown dataType '${dataType}' for group 'Agua' on topic: ${topic}`);
        return;
      }
    } else if (dataType === 'data') { // Assumed to be PowerSensor by elimination
      const powerSensorHardwareId = idOrGroup;
      let data;
      try {
          data = JSON.parse(message.toString());
      } catch (error) {
          logger.error(`Failed to parse JSON for power sensor topic ${topic}: ${error.message}`);
          return;
      }

      if (data.voltage === undefined || data.current === undefined || data.power === undefined) {
          logger.warn(`Missing voltage, current, or power in payload for power sensor ${powerSensorHardwareId}: ${JSON.stringify(data)}`);
          return;
      }

      try {
          const sensorDeviceResult = await pool.query(
              "SELECT id, config FROM devices WHERE device_id = $1 AND type = 'power_sensor'",
              [powerSensorHardwareId]
          );

          if (sensorDeviceResult.rows.length === 0) {
              logger.warn(`Power sensor with device_id '${powerSensorHardwareId}' not found or not configured as 'power_sensor' type.`);
              return;
          }

          const sensorDevice = sensorDeviceResult.rows[0];
          const monitoredDeviceId = sensorDevice.config?.monitors_device_id;

          if (!monitoredDeviceId) {
              logger.warn(`Power sensor ${powerSensorHardwareId} (DB ID: ${sensorDevice.id}) is not configured to monitor any device (missing 'monitors_device_id' in config).`);
              return;
          }

          tableName = 'power_monitor_logs';
          query = `
              INSERT INTO power_monitor_logs (monitored_device_id, voltage, current, power, sensor_timestamp, received_at)
              VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
          `;
          values = [
              monitoredDeviceId,
              data.voltage,
              data.current,
              data.power,
              data.sensor_timestamp || null,
              receivedAt
          ];

          // Update Redis cache for PowerSensor
          try {
            const sensorKey = `sensor_latest:power:${powerSensorHardwareId}`;
            await redisClient.hmset(sensorKey,
              'voltage', data.voltage,
              'current', data.current,
              'power', data.power,
              ...(data.sensor_timestamp && { 'sensor_timestamp': data.sensor_timestamp }), // Cache if present
              'last_updated', receivedAt.toISOString()
            );
            logger.info(`Updated Redis cache for ${sensorKey}`);

            // Add to Redis Lists for history (voltage, current, power)
            const metricsToLog = ['voltage', 'current', 'power'];
            for (const metric of metricsToLog) {
                if (data[metric] !== undefined) {
                    const listKey = `sensor_history:power:${powerSensorHardwareId}:${metric}`;
                    const dataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data[metric] });
                    redisClient.multi().lpush(listKey, dataPoint).ltrim(listKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec().catch(err => {
                        logger.error(`Failed to update Redis list for ${listKey}:`, err);
                    });
                }
            }

          } catch (redisError) {
            logger.error(`Failed to update Redis cache for power sensor ${powerSensorHardwareId}:`, redisError);
          }

      } catch (dbSubQueryError) {
          logger.error(`Error processing power sensor data for ${powerSensorHardwareId}: ${dbSubQueryError.message}`, { errorStack: dbSubQueryError.stack });
          return;
      }
    } else {
      logger.warn(`Unhandled topic structure or dataType: ${topic} (idOrGroup: ${idOrGroup}, dataType: ${dataType})`);
      return;
    }
  } else {
    logger.warn(`Received message on unexpected topic structure (not Invernadero/X/Y): ${topic}`);
    return;
  }

  if (query && values && tableName) {
    try {
      await pool.query(query, values);
      logger.info(`✅ Data inserted into ${tableName} from topic ${topic}`);
    } catch (dbError) {
      logger.error(`Error inserting data into ${tableName} from topic ${topic}: ${dbError.message}`, {
        sql: query,
        // Avoid logging potentially large 'values' array directly unless necessary for debugging specific issues
        // values: values,
        errorStack: dbError.stack
      });
    }
  } else if (topicParts.length === 3 && topicParts[0] === 'Invernadero') {
    // This case might indicate a logic path that should have set query/values/tableName but didn't.
    // Specific warnings within each logic block are preferred.
    logger.warn(`No query formed for valid Invernadero topic structure: ${topic}`);
  }
};

const disconnectMqtt = () => {
  if (client) {
    client.end(() => {
      logger.info('🔌 MQTT client disconnected');
    });
  }
};

module.exports = {
  connectMqtt,
  disconnectMqtt,
  // handleIncomingMessage will be called internally by the client.on('message')
};
