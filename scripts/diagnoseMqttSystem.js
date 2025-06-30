#!/usr/bin/env node
require('dotenv').config();
const pool = require('../config/db');
const redisClient = require('../config/redis');
const logger = require('../config/logger');

/**
 * Script de diagnóstico completo para verificar el estado del sistema MQTT
 * Uso: node scripts/diagnoseMqttSystem.js
 */

async function diagnoseMqttSystem() {
  console.log('🔍 DIAGNÓSTICO DEL SISTEMA MQTT');
  console.log('================================\n');

  // 1. Verificar variables de entorno
  console.log('📋 1. VERIFICANDO VARIABLES DE ENTORNO:');
  console.log('---------------------------------------');
  console.log(`MQTT_BROKER_URL: ${process.env.MQTT_BROKER_URL || '❌ NO DEFINIDO'}`);
  console.log(`MQTT_USERNAME: ${process.env.MQTT_USERNAME || '❌ NO DEFINIDO'}`);
  console.log(`MQTT_PASSWORD: ${process.env.MQTT_PASSWORD ? '✅ DEFINIDO' : '❌ NO DEFINIDO'}`);
  console.log(`SENSOR_HISTORY_MAX_LENGTH: ${process.env.SENSOR_HISTORY_MAX_LENGTH || '❌ NO DEFINIDO'}`);
  console.log(`PG_URI: ${process.env.PG_URI ? '✅ DEFINIDO' : '❌ NO DEFINIDO'}`);
  console.log(`REDIS_HOST: ${process.env.REDIS_HOST || '❌ NO DEFINIDO'}\n`);

  // 2. Verificar conexión a PostgreSQL
  console.log('🐘 2. VERIFICANDO CONEXIÓN A POSTGRESQL:');
  console.log('----------------------------------------');
  try {
    const pgResult = await pool.query('SELECT NOW() as current_time, version()');
    console.log('✅ Conexión a PostgreSQL exitosa');
    console.log(`   Tiempo del servidor: ${pgResult.rows[0].current_time}`);
    console.log(`   Versión: ${pgResult.rows[0].version.split(',')[0]}\n`);
  } catch (error) {
    console.log('❌ Error conectando a PostgreSQL:', error.message);
    console.log('   Verifica PG_URI en el archivo .env\n');
  }

  // 3. Verificar existencia de tablas
  console.log('📊 3. VERIFICANDO TABLAS DE LA BASE DE DATOS:');
  console.log('---------------------------------------------');
  const tables = ['temhum1', 'temhum2', 'calidad_agua', 'power_monitor_logs'];
  
  for (const table of tables) {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count, 
               MAX(received_at) as last_record 
        FROM ${table}
      `);
      const count = result.rows[0].count;
      const lastRecord = result.rows[0].last_record;
      
      console.log(`   ${table}: ✅ Existe`);
      console.log(`     - Registros: ${count}`);
      console.log(`     - Último registro: ${lastRecord || 'Ninguno'}`);
    } catch (error) {
      console.log(`   ${table}: ❌ Error - ${error.message}`);
    }
  }
  console.log();

  // 4. Verificar conexión a Redis
  console.log('🔴 4. VERIFICANDO CONEXIÓN A REDIS:');
  console.log('----------------------------------');
  try {
    await redisClient.ping();
    console.log('✅ Conexión a Redis exitosa');
    
    // Verificar datos en caché
    const redisKeys = await redisClient.keys('sensor_latest:*');
    console.log(`   Sensores en caché: ${redisKeys.length}`);
    
    for (const key of redisKeys.slice(0, 3)) { // Mostrar solo los primeros 3
      const data = await redisClient.hgetall(key);
      console.log(`   ${key}:`);
      console.log(`     - last_updated: ${data.last_updated || 'No disponible'}`);
      if (data.temperatura) console.log(`     - temperatura: ${data.temperatura}°C`);
      if (data.humedad) console.log(`     - humedad: ${data.humedad}%`);
    }
    console.log();
  } catch (error) {
    console.log('❌ Error conectando a Redis:', error.message);
    console.log('   Verifica REDIS_HOST, REDIS_PORT y REDIS_PASSWORD\n');
  }

  // 5. Verificar datos recientes en BD
  console.log('⏰ 5. VERIFICANDO DATOS RECIENTES (ÚLTIMAS 24 HORAS):');
  console.log('----------------------------------------------------');
  
  for (const table of tables.slice(0, 3)) { // Solo tablas de sensores principales
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count,
               MIN(received_at) as oldest,
               MAX(received_at) as newest
        FROM ${table} 
        WHERE received_at > NOW() - INTERVAL '24 hours'
      `);
      
      const count = result.rows[0].count;
      const oldest = result.rows[0].oldest;
      const newest = result.rows[0].newest;
      
      console.log(`   ${table}:`);
      console.log(`     - Registros últimas 24h: ${count}`);
      if (count > 0) {
        console.log(`     - Más antiguo: ${oldest}`);
        console.log(`     - Más reciente: ${newest}`);
      }
    } catch (error) {
      console.log(`   ${table}: ❌ Error - ${error.message}`);
    }
  }
  console.log();

  // 6. Verificar sample de datos
  console.log('📋 6. MUESTRA DE DATOS MÁS RECIENTES:');
  console.log('------------------------------------');
  
  try {
    // TemHum1
    const temhum1 = await pool.query(`
      SELECT temperatura, humedad, received_at 
      FROM temhum1 
      ORDER BY received_at DESC 
      LIMIT 1
    `);
    
    if (temhum1.rows.length > 0) {
      const row = temhum1.rows[0];
      console.log(`   TemHum1: ${row.temperatura}°C, ${row.humedad}% (${row.received_at})`);
    } else {
      console.log('   TemHum1: ❌ Sin datos');
    }

    // Calidad agua
    const agua = await pool.query(`
      SELECT ph, ec, ppm, temperatura_agua, received_at 
      FROM calidad_agua 
      ORDER BY received_at DESC 
      LIMIT 1
    `);
    
    if (agua.rows.length > 0) {
      const row = agua.rows[0];
      console.log(`   Agua: pH ${row.ph}, EC ${row.ec}, PPM ${row.ppm}, Temp ${row.temperatura_agua}°C (${row.received_at})`);
    } else {
      console.log('   Agua: ❌ Sin datos');
    }
  } catch (error) {
    console.log('   ❌ Error obteniendo muestras:', error.message);
  }

  console.log();

  // 7. Recomendaciones
  console.log('💡 7. RECOMENDACIONES:');
  console.log('----------------------');
  
  if (!process.env.MQTT_BROKER_URL) {
    console.log('❌ Configura MQTT_BROKER_URL en .env');
  }
  
  if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    console.log('⚠️  Considera configurar MQTT_USERNAME y MQTT_PASSWORD si tu broker los requiere');
  }
  
  console.log('✅ Para probar conexión MQTT: npm run test:mqtt');
  console.log('✅ Para ver logs del servidor: npm start');
  console.log('✅ Para monitorear topics MQTT: usar MQTT Explorer o similar');
  console.log('✅ Verificar que los dispositivos publiquen en: Invernadero/#');

  // Cerrar conexiones
  await pool.end();
  await redisClient.disconnect();
}

// Ejecutar diagnóstico
diagnoseMqttSystem()
  .then(() => {
    console.log('\n🎯 DIAGNÓSTICO COMPLETADO');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error durante el diagnóstico:', error);
    process.exit(1);
  });
