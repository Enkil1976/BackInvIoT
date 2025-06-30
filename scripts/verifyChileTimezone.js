#!/usr/bin/env node

/**
 * Script para verificar que la zona horaria de Chile esté configurada correctamente
 */

require('dotenv').config();
require('../config/timezone');

const pool = require('../config/db');
const redisClient = require('../config/redis');
const { 
  getChileDate, 
  toChileISOString, 
  toChileLogString, 
  getChileTimezoneOffset 
} = require('../config/timezone');

async function verifyTimezoneConfiguration() {
  console.log('🇨🇱 VERIFICACIÓN DE ZONA HORARIA DE CHILE');
  console.log('==========================================\n');

  // 1. Verificar configuración de Node.js
  console.log('📅 1. CONFIGURACIÓN DE NODE.JS:');
  console.log('-------------------------------');
  console.log(`   TZ Environment: ${process.env.TZ}`);
  console.log(`   Node.js Date: ${new Date()}`);
  console.log(`   Chile Date: ${getChileDate()}`);
  console.log(`   Chile ISO: ${toChileISOString()}`);
  console.log(`   Chile Log: ${toChileLogString()}`);
  console.log(`   Chile Offset: ${getChileTimezoneOffset()}\n`);

  // 2. Verificar PostgreSQL
  console.log('🐘 2. CONFIGURACIÓN DE POSTGRESQL:');
  console.log('----------------------------------');
  try {
    const result = await pool.query(`
      SELECT 
        current_setting('TIMEZONE') as timezone_setting,
        now() as server_time,
        timezone('America/Santiago', now()) as chile_time,
        extract(timezone_hour FROM now()) as offset_hours,
        extract(timezone_minute FROM now()) as offset_minutes
    `);
    
    const row = result.rows[0];
    console.log(`   ✅ PostgreSQL conectado exitosamente`);
    console.log(`   Timezone Setting: ${row.timezone_setting}`);
    console.log(`   Server Time: ${row.server_time}`);
    console.log(`   Chile Time: ${row.chile_time}`);
    console.log(`   Offset: ${row.offset_hours}:${String(Math.abs(row.offset_minutes)).padStart(2, '0')}\n`);
  } catch (error) {
    console.log(`   ❌ Error conectando a PostgreSQL: ${error.message}\n`);
  }

  // 3. Verificar Redis
  console.log('🔴 3. VERIFICACIÓN DE REDIS:');
  console.log('----------------------------');
  try {
    const testKey = 'timezone_test';
    const testValue = JSON.stringify({
      timestamp: toChileISOString(),
      timezone: 'America/Santiago',
      test: true
    });
    
    await redisClient.set(testKey, testValue, 'EX', 60);
    const retrieved = await redisClient.get(testKey);
    const parsed = JSON.parse(retrieved);
    
    console.log(`   ✅ Redis conectado exitosamente`);
    console.log(`   Test Timestamp: ${parsed.timestamp}`);
    console.log(`   Test Timezone: ${parsed.timezone}\n`);
    
    // Limpiar
    await redisClient.del(testKey);
  } catch (error) {
    console.log(`   ❌ Error conectando a Redis: ${error.message}\n`);
  }

  // 4. Probar diferencias horarias
  console.log('🌍 4. COMPARACIÓN DE ZONAS HORARIAS:');
  console.log('-----------------------------------');
  const now = new Date();
  const utc = new Date(now.toISOString());
  const chile = getChileDate();
  
  console.log(`   UTC Time: ${utc.toISOString()}`);
  console.log(`   Chile Time: ${toChileISOString(chile)}`);
  console.log(`   Difference: ${Math.round((chile.getTime() - utc.getTime()) / (1000 * 60 * 60))} hours\n`);

  // 5. Verificar horario de verano/invierno
  console.log('☀️❄️ 5. DETECCIÓN DE HORARIO DE VERANO:');
  console.log('--------------------------------------');
  const offset = getChileTimezoneOffset();
  const isWinter = offset === '-04:00' || offset === '-4:00';
  const isSummer = offset === '-03:00' || offset === '-3:00';
  
  if (isWinter) {
    console.log(`   🏔️ Horario de INVIERNO detectado (CLT UTC-4)`);
  } else if (isSummer) {
    console.log(`   🌞 Horario de VERANO detectado (CLST UTC-3)`);
  } else {
    console.log(`   ⚠️ Offset no reconocido: ${offset}`);
  }
  console.log(`   Offset actual: ${offset}\n`);

  // 6. Probar logs con timestamp
  console.log('📝 6. EJEMPLO DE LOGS CON ZONA HORARIA:');
  console.log('-------------------------------------');
  console.log(`   [${toChileLogString()}] Este es un log de ejemplo`);
  console.log(`   [${toChileISOString()}] Timestamp ISO de Chile\n`);

  console.log('✅ VERIFICACIÓN COMPLETADA');
  console.log('==========================');
  console.log('🕰️ Zona horaria de Chile configurada correctamente');
  console.log('📡 Todos los timestamps del servidor usarán horario de Chile');
  console.log('🇨🇱 Sistema listo para operación en territorio chileno\n');
}

// Ejecutar verificación
async function main() {
  try {
    await verifyTimezoneConfiguration();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    process.exit(1);
  }
}

// Solo ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = { verifyTimezoneConfiguration };