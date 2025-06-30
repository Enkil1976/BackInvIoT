#!/usr/bin/env node
require('dotenv').config();
const mqtt = require('mqtt');
const logger = require('../config/logger');

/**
 * Script para simular dispositivos IoT enviando datos MQTT de prueba
 * Uso: node scripts/simulateMqttData.js
 */

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883';
const TEST_CLIENT_ID = `mqtt_test_simulator_${Math.random().toString(16).slice(3)}`;

// Datos de simulación
const generateTemHumData = () => ({
  temperatura: (20 + Math.random() * 15).toFixed(1), // 20-35°C
  humedad: (50 + Math.random() * 30).toFixed(1),    // 50-80%
  heatindex: (22 + Math.random() * 18).toFixed(1),
  dewpoint: (15 + Math.random() * 10).toFixed(1),
  rssi: Math.floor(-30 - Math.random() * 40),        // -30 a -70
  boot: Math.floor(Math.random() * 10),
  mem: Math.floor(40000 + Math.random() * 20000),
  stats: {
    tmin: (18 + Math.random() * 5).toFixed(1),
    tmax: (30 + Math.random() * 8).toFixed(1),
    tavg: (24 + Math.random() * 6).toFixed(1),
    hmin: (45 + Math.random() * 10).toFixed(1),
    hmax: (75 + Math.random() * 15).toFixed(1),
    havg: (60 + Math.random() * 10).toFixed(1),
    total: Math.floor(100 + Math.random() * 50),
    errors: Math.floor(Math.random() * 3)
  }
});

const generateAguaData = () => ({
  ph: (6.5 + Math.random() * 2).toFixed(1),          // 6.5-8.5
  ec: Math.floor(800 + Math.random() * 800),         // 800-1600
  ppm: Math.floor(500 + Math.random() * 600),        // 500-1100
  temp: (20 + Math.random() * 8).toFixed(1)          // 20-28°C
});

const generatePowerData = () => ({
  voltage: (220 + Math.random() * 20).toFixed(1),    // 220-240V
  current: (1 + Math.random() * 4).toFixed(2),       // 1-5A
  power: (200 + Math.random() * 800).toFixed(1),     // 200-1000W
  sensor_timestamp: new Date().toISOString()
});

async function simulateMqttData() {
  console.log('🎭 SIMULADOR DE DATOS MQTT PARA PRUEBAS');
  console.log('======================================\n');
  
  console.log(`🔗 Conectando a broker: ${MQTT_BROKER_URL}`);
  console.log(`🆔 Client ID: ${TEST_CLIENT_ID}\n`);

  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: TEST_CLIENT_ID,
    clean: true,
    connectTimeout: 4000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 1000,
  });

  client.on('connect', () => {
    console.log('✅ Conectado al broker MQTT\n');
    console.log('📡 Enviando datos de prueba...\n');
    
    let messageCount = 0;
    
    // Función para enviar datos
    const sendTestData = () => {
      messageCount++;
      
      // 1. TemHum1 data
      const temhum1Data = generateTemHumData();
      client.publish('Invernadero/TemHum1/data', JSON.stringify(temhum1Data));
      console.log(`📊 [${messageCount}] TemHum1: T=${temhum1Data.temperatura}°C, H=${temhum1Data.humedad}%`);
      
      // 2. TemHum2 data  
      const temhum2Data = generateTemHumData();
      client.publish('Invernadero/TemHum2/data', JSON.stringify(temhum2Data));
      console.log(`📊 [${messageCount}] TemHum2: T=${temhum2Data.temperatura}°C, H=${temhum2Data.humedad}%`);
      
      // 3. Agua data (JSON completo)
      const aguaData = generateAguaData();
      client.publish('Invernadero/Agua/data', JSON.stringify(aguaData));
      console.log(`💧 [${messageCount}] Agua: pH=${aguaData.ph}, EC=${aguaData.ec}, PPM=${aguaData.ppm}, T=${aguaData.temp}°C`);
      
      // 4. Agua temperatura (solo texto)
      const waterTemp = (22 + Math.random() * 6).toFixed(1);
      client.publish('Invernadero/Agua/Temperatura', waterTemp);
      console.log(`🌡️ [${messageCount}] Agua Temp: ${waterTemp}°C`);
      
      // 5. Power sensor (necesita device configurado en BD)
      const powerData = generatePowerData();
      client.publish('Invernadero/PWR001/data', JSON.stringify(powerData));
      console.log(`⚡ [${messageCount}] Power: V=${powerData.voltage}V, I=${powerData.current}A, P=${powerData.power}W`);
      
      console.log(''); // Línea en blanco
    };
    
    // Enviar datos inmediatamente
    sendTestData();
    
    // Enviar datos cada 5 segundos
    const interval = setInterval(sendTestData, 5000);
    
    // Detener después de 30 segundos
    setTimeout(() => {
      clearInterval(interval);
      console.log(`\n🏁 Simulación completada. Enviados ${messageCount} conjuntos de datos.`);
      console.log('🔍 Verifica los logs del servidor para confirmar que se procesaron correctamente.');
      console.log('📊 Ejecuta el diagnóstico: npm run diagnose:mqtt');
      
      client.end(() => {
        console.log('🔌 Desconectado del broker MQTT');
        process.exit(0);
      });
    }, 30000);
  });

  client.on('error', (error) => {
    console.error('❌ Error de conexión MQTT:', error.message);
    process.exit(1);
  });

  client.on('offline', () => {
    console.log('⚠️ Cliente MQTT offline');
  });

  client.on('reconnect', () => {
    console.log('🔄 Reintentando conexión MQTT...');
  });
}

// Manejo de señales para cerrar limpiamente
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupción detectada. Cerrando simulador...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminación detectada. Cerrando simulador...');
  process.exit(0);
});

// Ejecutar simulador
simulateMqttData().catch(error => {
  console.error('❌ Error ejecutando simulador:', error);
  process.exit(1);
});
