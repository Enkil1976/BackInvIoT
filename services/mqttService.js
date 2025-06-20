const mqtt = require('mqtt');
const pool = require('../config/db');
const logger = require('../config/logger');
const redisClient = require('../config/redis'); // Import Redis client
const EventEmitter = require('events');

const mqttEvents = new EventEmitter();
const SENSOR_HISTORY_MAX_LENGTH = parseInt(process.env.SENSOR_HISTORY_MAX_LENGTH, 10) || 100;

// Environment variables for MQTT connection (ensure these are set in your .env file)
// MQTT_BROKER_URL: Full URL to your MQTT broker (e.g., mqtt://your_broker.com:1883 or ws://your_broker.com:8083/mqtt for WebSocket)
// MQTT_USERNAME: Username for MQTT broker authentication (optional)
// MQTT_PASSWORD: Password for MQTT broker authentication (optional)
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io';
const MQTT_CLIENT_ID = `mqtt_client_${Math.random().toString(16).slice(3)}`;
const MQTT_TOPIC_TO_SUBSCRIBE = 'Invernadero/#';

let client;

const connectMqtt = () => {
  const options = {
    clientId: MQTT_CLIENT_ID, // Use global module-level const
    clean: true,
    connectTimeout: 4000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 1000,
  };

  // CRITICAL DIAGNOSTIC LOG (Re-added):
  // Read directly from process.env for logging to ensure we see what's truly in environment at connection time
  const usernameForLog = process.env.MQTT_USERNAME;
  const passwordFromEnvForLog = process.env.MQTT_PASSWORD;

  logger.debug(
    'MQTT Connect Attempt Details: ' +
    `URL='${MQTT_BROKER_URL}', ` +
    `ClientID='${options.clientId}', ` +
    `Username='${usernameForLog || "N/A"}', ` +
    `Password_Is_Set='${!!passwordFromEnvForLog}'`
  );

  if (passwordFromEnvForLog === undefined) {
    logger.debug("MQTT_PASSWORD from env for connection is undefined.");
  } else if (passwordFromEnvForLog === null) {
    logger.debug("MQTT_PASSWORD from env for connection is null.");
  } else if (passwordFromEnvForLog === "") {
    logger.debug("MQTT_PASSWORD from env for connection is an empty string.");
  } else if (typeof passwordFromEnvForLog === 'string') {
    logger.debug(`MQTT_PASSWORD from env for connection is a non-empty string of length ${passwordFromEnvForLog.length}.`);
  } else {
    logger.debug(`MQTT_PASSWORD from env for connection is of type: ${typeof passwordFromEnvForLog}`);
  }

  if (usernameForLog === undefined) {
    logger.debug("MQTT_USERNAME from env for connection is undefined.");
  } else if (usernameForLog === null) {
    logger.debug("MQTT_USERNAME from env for connection is null.");
  } else if (usernameForLog === "") {
    logger.debug("MQTT_USERNAME from env for connection is an empty string.");
  } else {
    logger.debug(`MQTT_USERNAME from env for connection is: '${usernameForLog}'`);
  }

  if (!MQTT_BROKER_URL || typeof MQTT_BROKER_URL !== 'string' || MQTT_BROKER_URL.trim() === '') {
    logger.error("MQTT Connection Error: Global MQTT_BROKER_URL is invalid or not set. Please check .env file or its definition.", { brokerUrlAttempted: MQTT_BROKER_URL });
    return; // Prevent connection attempt
  }

  // Note: The options object already uses process.env.MQTT_USERNAME and process.env.MQTT_PASSWORD,
  // so the actual connection attempt will use the values from process.env at this point.
  // The logging above is to confirm what those values are right before the attempt.

  // Use global module-level const for URL
  client = mqtt.connect(MQTT_BROKER_URL, options);

  client.on('connect', () => {
    logger.info('✅ MQTT Client: Successfully connected to broker.');
    subscribeToTopics(); // Call to separate subscribe function
    logger.info('MQTT Client: Processed connect event and initiated subscriptions.');
  });

  client.on('reconnect', () => {
    logger.warn('MQTT Client: Attempting to reconnect...');
  });

  client.on('error', (error) => {
    logger.error('MQTT Client: Connection Error:', error);
  });

  client.on('close', () => {
    logger.warn('MQTT Client: Connection closed.');
  });

  client.on('offline', () => {
    logger.warn('MQTT Client: Currently offline.');
  });

  client.on('message', (topic, message) => {
    logger.info(`MQTT Client: --- 'message' event fired --- Topic: ${topic}`);
    // Note: Raw payload is logged at the start of handleIncomingMessage itself.
    handleIncomingMessage(topic, message);
  });
};

const subscribeToTopics = () => {
  if (!client) {
    logger.error('MQTT Client: Cannot subscribe, client not initialized.');
    return;
  }
  client.subscribe(MQTT_TOPIC_TO_SUBSCRIBE, (err, granted) => {
    if (!err) {
      if (granted && granted.length > 0 && granted[0].topic === MQTT_TOPIC_TO_SUBSCRIBE) {
        logger.info(`MQTT Client: ✅ Successfully subscribed to topic: ${granted[0].topic} with QoS ${granted[0].qos}`);
      } else if (granted && granted.length > 0) {
        logger.warn(`MQTT Client: Subscribed to ${MQTT_TOPIC_TO_SUBSCRIBE}, but grant info is unexpected:`, granted);
      } else {
         logger.warn(`MQTT Client: Subscribed to ${MQTT_TOPIC_TO_SUBSCRIBE}, but no grant information returned (or subscription silently failed).`);
      }
    } else {
      logger.error(`MQTT Client: ❌ Subscription error for topic ${MQTT_TOPIC_TO_SUBSCRIBE}:`, err);
    }
  });
};

const handleIncomingMessage = async (topic, message) => {
  const rawPayload = message.toString();
  logger.info(`MQTT Message Received - Topic: ${topic}, Raw Payload: ${rawPayload}`);

  const topicParts = topic.split('/');
  const receivedAt = new Date();
  let query;
  let values;
  let tableName;
  let idOrGroup;
  let data;

  if (topicParts.length === 3 && topicParts[0] === 'Invernadero') {
    idOrGroup = topicParts[1];
    const dataType = topicParts[2];
    logger.debug(`MQTT Handler: Identified idOrGroup='${idOrGroup}', dataType='${dataType}'`);

    if ((idOrGroup === 'TemHum1' || idOrGroup === 'TemHum2') && dataType === 'data') {
      tableName = idOrGroup.toLowerCase();
      logger.debug(`MQTT Handler: Processing TemHum data for table '${tableName}'`);
      try {
        data = JSON.parse(rawPayload);
        logger.debug(`MQTT Handler: Parsed TemHum JSON data for ${tableName}: %j`, data);
      } catch (error) {
        logger.error(`MQTT Handler: Failed to parse JSON for ${topic}: ${error.message}`, { rawPayload });
        return;
      }

      if (data.temperatura === undefined || data.humedad === undefined || !data.stats) {
        logger.warn(`MQTT Handler: Missing core fields in TemHum data for ${tableName}. Data: %j`, data);
        return;
      }

      query = `
        INSERT INTO ${tableName} (temperatura, humedad, heatindex, dewpoint, rssi, boot, mem, stats_tmin, stats_tmax, stats_tavg, stats_hmin, stats_hmax, stats_havg, stats_total, stats_errors, received_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);`;
      values = [
        data.temperatura, data.humedad, data.heatindex, data.dewpoint, data.rssi, data.boot, data.mem,
        data.stats.tmin, data.stats.tmax, data.stats.tavg, data.stats.hmin, data.stats.hmax, data.stats.havg,
        data.stats.total, data.stats.errors, receivedAt
      ];

      const sensorKeyLatestTemHum = `sensor_latest:${tableName}`;
      logger.debug(`MQTT Handler: Attempting Redis update for TemHum sensor ${tableName} using key ${sensorKeyLatestTemHum}`);
      try {
        const latestValuesForEvent = {
            temperatura: data.temperatura, humedad: data.humedad,
            heatindex: data.heatindex, dewpoint: data.dewpoint,
            rssi: data.rssi, last_updated: receivedAt.toISOString()
        };
        await redisClient.hmset(sensorKeyLatestTemHum, latestValuesForEvent);
        logger.info(`MQTT Handler: ✅ Redis HMSET Success for ${sensorKeyLatestTemHum}`);

        mqttEvents.emit('sensor_latest_update', {
            sensorId: tableName, // e.g., "temhum1", "temhum2"
            data: latestValuesForEvent
        });

        const metricsToCacheHistory = ['temperatura', 'humedad', 'heatindex', 'dewpoint', 'rssi'];
        for (const metric of metricsToCacheHistory) {
            if (data[metric] !== undefined) {
                const listKey = `sensor_history:${tableName}:${metric}`;
                const dataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data[metric] });
                logger.debug(`MQTT Handler: Attempting Redis list update for ${listKey}`);
                try {
                    await redisClient.multi().lpush(listKey, dataPoint).ltrim(listKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec();
                    logger.info(`MQTT Handler: ✅ Redis List Update Success for ${listKey}`);
                } catch (listErr) {
                    logger.error(`MQTT Handler: ❌ Redis List Update FAILED for ${listKey}:`, listErr);
                }
            }
        }
      } catch (redisError) {
        logger.error(`MQTT Handler: ❌ Redis HMSET FAILED for ${sensorKeyLatestTemHum}:`, redisError);
      }

    } else if (idOrGroup === 'Agua') {
      tableName = 'calidad_agua';
      logger.debug(`MQTT Handler: Processing Agua data for table '${tableName}'`);
      if (dataType === 'data') {
        try {
          data = JSON.parse(rawPayload);
          logger.debug(`MQTT Handler: Parsed Agua/data JSON: %j`, data);
        } catch (error) {
          logger.error(`MQTT Handler: Failed to parse JSON for ${topic}: ${error.message}`, { rawPayload });
          return;
        }
        if (data.ph === undefined || data.ec === undefined || data.ppm === undefined) {
          logger.warn(`MQTT Handler: Missing ph, ec, or ppm in Agua data. Data: %j`, data);
          return;
        }
        query = `INSERT INTO ${tableName} (ph, ec, ppm, temperatura_agua, received_at) VALUES ($1, $2, $3, $4, $5);`;
        values = [data.ph, data.ec, data.ppm, data.temp || null, receivedAt]; // Use data.temp here

        const sensorKeyAguaData = `sensor_latest:calidad_agua`;
        logger.debug(`MQTT Handler: Attempting Redis update for Agua/data using key ${sensorKeyAguaData}`);
        try {
          const redisPayload = {
            'ph': data.ph, 'ec': data.ec, 'ppm': data.ppm,
            'last_updated_multiparam': receivedAt.toISOString()
          };
          if (data.temp !== undefined) { // Check for data.temp
            redisPayload['temperatura_agua'] = data.temp; // Store as 'temperatura_agua'
          }
          await redisClient.hmset(sensorKeyAguaData, redisPayload);
          logger.info(`MQTT Handler: ✅ Redis HMSET Success for ${sensorKeyAguaData} (multi-param)`);

          mqttEvents.emit('sensor_latest_update', {
              sensorId: 'calidad_agua', // Fixed identifier for this group
              data: redisPayload // The object that was just set in Redis
          });

          const paramsToLogHistory = ['ph', 'ec', 'ppm'];
          if (data.temp !== undefined) { // Check for data.temp for history logging decision
            paramsToLogHistory.push('temperatura_agua'); // Logged under metric 'temperatura_agua'
          }

          for (const param of paramsToLogHistory) {
              let valueToLog;
              if (param === 'temperatura_agua') {
                valueToLog = data.temp; // Get value from data.temp for this specific metric
              } else {
                valueToLog = data[param]; // Get value from data.ph, data.ec, etc.
              }

              if (valueToLog !== undefined) {
                  const listKey = `sensor_history:calidad_agua:${param}`;
                  const dataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: valueToLog });
                  logger.debug(`MQTT Handler: Attempting Redis list update for ${listKey}`);
                  try {
                      await redisClient.multi().lpush(listKey, dataPoint).ltrim(listKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec();
                      logger.info(`MQTT Handler: ✅ Redis List Update Success for ${listKey}`);
                  } catch (listErr) {
                      logger.error(`MQTT Handler: ❌ Redis List Update FAILED for ${listKey}:`, listErr);
                  }
              }
          }
        } catch (redisError) {
          logger.error(`MQTT Handler: ❌ Redis HMSET FAILED for ${sensorKeyAguaData} (multi-param):`, redisError);
        }

      } else if (dataType === 'Temperatura') {
        const waterTemp = parseFloat(rawPayload);
        logger.debug(`MQTT Handler: Parsed Agua/Temperatura plain text: ${waterTemp}`);
        if (isNaN(waterTemp)) {
          logger.error(`MQTT Handler: Failed to parse water temperature as a number from topic ${topic}. Payload: ${rawPayload}`);
          return;
        }
        query = `INSERT INTO ${tableName} (temperatura_agua, received_at) VALUES ($1, $2);`;
        values = [waterTemp, receivedAt];

        const sensorKeyAguaTemp = `sensor_latest:calidad_agua`;
        logger.debug(`MQTT Handler: Attempting Redis update for Agua/Temperatura using key ${sensorKeyAguaTemp}`);
        try {
          const redisUpdatePayload = {
            'temperatura_agua': waterTemp,
            'last_updated_temp_agua': receivedAt.toISOString()
          };
          await redisClient.hmset(sensorKeyAguaTemp, redisUpdatePayload);
          logger.info(`MQTT Handler: ✅ Redis HMSET Success for ${sensorKeyAguaTemp} (temp_agua)`);

          mqttEvents.emit('sensor_latest_update', {
              sensorId: 'calidad_agua', // Still affects the 'calidad_agua' sensor data object
              data: redisUpdatePayload // Event data shows what changed
          });

          const tempListKey = `sensor_history:calidad_agua:temperatura_agua`;
          const tempDataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: waterTemp });
          logger.debug(`MQTT Handler: Attempting Redis list update for ${tempListKey}`);
          try {
            await redisClient.multi().lpush(tempListKey, tempDataPoint).ltrim(tempListKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec();
            logger.info(`MQTT Handler: ✅ Redis List Update Success for ${tempListKey}`);
          } catch (listErr) {
            logger.error(`MQTT Handler: ❌ Redis List Update FAILED for ${tempListKey}:`, listErr);
          }
        } catch (redisError) {
          logger.error(`MQTT Handler: ❌ Redis HMSET FAILED for ${sensorKeyAguaTemp} (temp_agua):`, redisError);
        }

      } else {
        logger.warn(`MQTT Handler: Unknown dataType '${dataType}' for group 'Agua' on topic: ${topic}`);
        return;
      }
    } else if (dataType === 'data') {
      const powerSensorHardwareId = idOrGroup;
      tableName = 'power_monitor_logs';
      logger.debug(`MQTT Handler: Processing PowerSensor data for HW_ID '${powerSensorHardwareId}'`);
      try {
          data = JSON.parse(rawPayload);
          logger.debug(`MQTT Handler: Parsed PowerSensor JSON data for ${powerSensorHardwareId}: %j`, data);
      } catch (error) {
          logger.error(`MQTT Handler: Failed to parse JSON for power sensor topic ${topic}: ${error.message}`, { rawPayload });
          return;
      }

      if (data.voltage === undefined || data.current === undefined || data.power === undefined) {
          logger.warn(`MQTT Handler: Missing voltage, current, or power in payload for power sensor ${powerSensorHardwareId}. Data: %j`, data);
          return;
      }

      try {
          const sensorDeviceResult = await pool.query( "SELECT id, config FROM devices WHERE device_id = $1 AND type = 'power_sensor'", [powerSensorHardwareId]);
          if (sensorDeviceResult.rows.length === 0) {
              logger.warn(`MQTT Handler: Power sensor with device_id '${powerSensorHardwareId}' not found or not 'power_sensor' type.`);
              return;
          }
          const monitoredDeviceId = sensorDeviceResult.rows[0].config?.monitors_device_id;
          if (!monitoredDeviceId) {
              logger.warn(`MQTT Handler: Power sensor ${powerSensorHardwareId} (DB ID: ${sensorDeviceResult.rows[0].id}) not configured with 'monitors_device_id'.`);
              return;
          }

          query = `INSERT INTO power_monitor_logs (monitored_device_id, voltage, current, power, sensor_timestamp, received_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`;
          values = [monitoredDeviceId, data.voltage, data.current, data.power, data.sensor_timestamp || null, receivedAt];

          const sensorKeyPower = `sensor_latest:power:${powerSensorHardwareId}`;
          logger.debug(`MQTT Handler: Attempting Redis update for power sensor ${powerSensorHardwareId} using key ${sensorKeyPower}`);
          try {
            const redisPayload = {
              'voltage': data.voltage, 'current': data.current, 'power': data.power,
              'last_updated': receivedAt.toISOString()
            };
            if (data.sensor_timestamp) { redisPayload['sensor_timestamp'] = data.sensor_timestamp; }
            await redisClient.hmset(sensorKeyPower, redisPayload);
            logger.info(`MQTT Handler: ✅ Redis HMSET Success for ${sensorKeyPower}`);

            mqttEvents.emit('sensor_latest_update', {
                sensorId: `power:${powerSensorHardwareId}`, // Matches Redis key part
                data: redisPayload
            });

            const metricsToLogHistory = ['voltage', 'current', 'power'];
            for (const metric of metricsToLogHistory) {
                if (data[metric] !== undefined) {
                    const listKey = `sensor_history:power:${powerSensorHardwareId}:${metric}`;
                    const dataPoint = JSON.stringify({ ts: receivedAt.toISOString(), val: data[metric] });
                    logger.debug(`MQTT Handler: Attempting Redis list update for ${listKey}`);
                    try {
                        await redisClient.multi().lpush(listKey, dataPoint).ltrim(listKey, 0, SENSOR_HISTORY_MAX_LENGTH - 1).exec();
                        logger.info(`MQTT Handler: ✅ Redis List Update Success for ${listKey}`);
                    } catch (listErr) {
                        logger.error(`MQTT Handler: ❌ Redis List Update FAILED for ${listKey}:`, listErr);
                    }
                }
            }
          } catch (redisError) {
            logger.error(`MQTT Handler: ❌ Redis HMSET FAILED for power sensor ${powerSensorHardwareId} (key: ${sensorKeyPower}):`, redisError);
          }
      } catch (dbSubQueryError) {
          logger.error(`MQTT Handler: Error processing power sensor data for ${powerSensorHardwareId}: ${dbSubQueryError.message}`, { errorStack: dbSubQueryError.stack });
          return;
      }
    } else {
      logger.warn(`MQTT Handler: Unhandled topic structure or dataType: ${topic} (idOrGroup: ${idOrGroup}, dataType: ${dataType})`);
      return;
    }
  } else {
    logger.warn(`MQTT Handler: Received message on unexpected topic structure (not Invernadero/X/Y): ${topic}`);
    return;
  }

  // Common DB Insert Logic
  if (query && values && tableName) {
    logger.debug(`MQTT Handler: Attempting DB Insert - Table: ${tableName}, Query: ${query.substring(0,100)}..., Values (sample): ${JSON.stringify(values.slice(0,3))}...`);
    try {
      await pool.query(query, values);
      logger.info(`MQTT Handler: ✅ DB Insert Success - Table: ${tableName}, Topic: ${topic}`);
    } catch (dbError) {
      logger.error(`MQTT Handler: ❌ DB Insert FAILED - Table: ${tableName}, Topic: ${topic}. Error: ${dbError.message}`, { sql: query, valuesPreview: values.slice(0,3), errorStack: dbError.stack });
    }
  } else if (topicParts.length === 3 && topicParts[0] === 'Invernadero') {
    logger.warn(`MQTT Handler: No DB query formed for valid Invernadero topic structure: ${topic}. This might indicate an unhandled dataType or logic path.`);
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
  mqttEvents, // Export the event emitter
  // handleIncomingMessage will be called internally by the client.on('message')
};
