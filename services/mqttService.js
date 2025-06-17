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

  const topicParts = topic.split('/'); // Example: Invernadero/TemHum1/data -> ["Invernadero", "TemHum1", "data"]
                                      // Example: Invernadero/Agua/Temperatura -> ["Invernadero", "Agua", "Temperatura"]

  if (topicParts.length < 3 || topicParts[0] !== 'Invernadero') {
    logger.warn(`Received message on unexpected topic structure: ${topic}`);
    return;
  }

  const deviceGroup = topicParts[1]; // TemHum1, TemHum2, Agua
  const dataType = topicParts[2];    // data, Temperatura

  const receivedAt = new Date();
  let query;
  let values;
  let tableName;

  try {
    if (deviceGroup === 'TemHum1' || deviceGroup === 'TemHum2') {
      tableName = deviceGroup.toLowerCase(); // temhum1 or temhum2
      if (dataType === 'data') {
        let data;
        try {
          data = JSON.parse(message.toString());
        } catch (error) {
          logger.error(`Failed to parse JSON for ${topic}: ${error.message}`);
          return;
        }

        // Validate required fields (basic check)
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
      } else {
        logger.warn(`Unknown dataType '${dataType}' for deviceGroup '${deviceGroup}' on topic: ${topic}`);
        return;
      }
    } else if (deviceGroup === 'Agua') {
      tableName = 'calidad_agua';
      if (dataType === 'data') { // Handles Invernadero/Agua/data
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
        query = `INSERT INTO ${tableName} (ph, ec, ppm, received_at) VALUES ($1, $2, $3, $4)`;
        values = [data.ph, data.ec, data.ppm, receivedAt];

      } else if (dataType === 'Temperatura') { // Handles Invernadero/Agua/Temperatura
        const waterTemp = parseFloat(message.toString());
        if (isNaN(waterTemp)) {
          logger.error(`Failed to parse water temperature as a number from topic ${topic}: ${message.toString()}`);
          return;
        }
        // Inserts a new row with only water temperature. Other fields will be null.
        // Consider if this should update an existing record or if pH/EC/PPM come separately.
        query = `INSERT INTO ${tableName} (temperatura_agua, received_at) VALUES ($1, $2)`;
        values = [waterTemp, receivedAt];
      } else {
        logger.warn(`Unknown dataType '${dataType}' for deviceGroup 'Agua' on topic: ${topic}`);
        return;
      }
    } else {
      logger.warn(`Unknown deviceGroup '${deviceGroup}' on topic: ${topic}`);
      return;
    }

    if (query && values) {
      await pool.query(query, values);
      logger.info(`✅ Data inserted into ${tableName} from topic ${topic}`);
    }

  } catch (dbError) {
    logger.error(`Error processing message for topic ${topic}: ${dbError.message}`, {
      sql: query,
      values: values,
      errorStack: dbError.stack
    });
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
