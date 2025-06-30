#!/usr/bin/env node
require('dotenv').config();
const { connectMqtt, disconnectMqtt } = require('../services/mqttService');
const logger = require('../config/logger');

/**
 * Script para probar la conexión MQTT
 * Uso: node scripts/testMqttConnection.js
 */

logger.info('🧪 Iniciando prueba de conexión MQTT...');

// Verificar variables de entorno
logger.info('📋 Verificando configuración MQTT:');
logger.info(`   MQTT_BROKER_URL: ${process.env.MQTT_BROKER_URL || 'No definido'}`);
logger.info(`   MQTT_USERNAME: ${process.env.MQTT_USERNAME || 'No definido'}`);
logger.info(`   MQTT_PASSWORD: ${process.env.MQTT_PASSWORD ? '[DEFINIDO]' : 'No definido'}`);
logger.info(`   SENSOR_HISTORY_MAX_LENGTH: ${process.env.SENSOR_HISTORY_MAX_LENGTH || 'No definido'}`);

// Conectar MQTT
connectMqtt();

// Timeout para cerrar la conexión después de 30 segundos
setTimeout(() => {
  logger.info('⏰ Tiempo de prueba agotado, cerrando conexión...');
  disconnectMqtt();
  process.exit(0);
}, 30000);

// Manejo de señales para cerrar limpiamente
process.on('SIGINT', () => {
  logger.info('🛑 Interrupción detectada, cerrando conexión MQTT...');
  disconnectMqtt();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Terminación detectada, cerrando conexión MQTT...');
  disconnectMqtt();
  process.exit(0);
});
