const mqtt = require('mqtt');
const pool = require('../config/db'); // Assuming db config is in ../config/db.js
const logger = require('../config/logger'); // Assuming logger config is in ../config/logger.js

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
        // Assuming 'temperatura_agua' might also come in this payload, or be null
        values = [data.ph, data.ec, data.ppm, data.temperatura_agua || null, receivedAt];
      } else if (dataType === 'Temperatura') {
        const waterTemp = parseFloat(message.toString());
        if (isNaN(waterTemp)) {
          logger.error(`Failed to parse water temperature as a number from topic ${topic}: ${message.toString()}`);
          return;
        }
        query = `INSERT INTO ${tableName} (temperatura_agua, received_at) VALUES ($1, $2)`;
        values = [waterTemp, receivedAt];
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
