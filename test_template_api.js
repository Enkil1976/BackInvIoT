// Script para probar el API de plantillas de notificaciones
const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testTemplateAPI() {
  try {
    console.log('🔧 Probando endpoints de plantillas de notificaciones...');
    
    // Usar token hardcodeado para la prueba rápida (obtenido de test anterior)
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzM1ODYwNTQ5LCJleHAiOjE3MzU5NDY5NDl9.5k5k78I7Vh6IKZVxpWD4BH8W8AJDQJ5PHr3mD3_n5Is';
    console.log('✅ Token obtenido exitosamente');

    // Headers con autenticación
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('\n📋 Probando endpoint de variables disponibles...');
    
    // Probar endpoint de variables
    const variablesResponse = await axios.get(`${BASE_URL}/api/notification-templates/variables`, {
      headers
    });

    console.log('✅ Variables disponibles obtenidas:');
    Object.entries(variablesResponse.data.data).forEach(([sensor, info]) => {
      console.log(`  📊 ${sensor} (${info.label}):`);
      Object.entries(info.fields).forEach(([field, fieldInfo]) => {
        console.log(`     - {${sensor}.${field}} -> ${fieldInfo.label} ${fieldInfo.unit ? `(${fieldInfo.unit})` : ''}`);
      });
    });

    console.log('\n🧪 Probando endpoint de procesamiento de plantillas...');
    
    // Probar procesamiento de plantilla
    const testTemplate = 'La temperatura actual es {temhum1.temperatura}°C y la humedad es {temhum1.humedad}%';
    const testResponse = await axios.post(`${BASE_URL}/api/notification-templates/test`, {
      template: testTemplate
    }, { headers });

    console.log('✅ Plantilla procesada:');
    console.log('  Plantilla original:', testResponse.data.data.originalTemplate);
    console.log('  Mensaje procesado:', testResponse.data.data.processedMessage);
    console.log('  Variables encontradas:', testResponse.data.data.variables);

    console.log('\n🎉 Todos los endpoints funcionan correctamente!');
    console.log('\n💡 Ejemplos de uso en notificaciones:');
    console.log('  • "Alerta: Temperatura {temhum1.temperatura}°C"');
    console.log('  • "pH crítico: {calidad_agua.ph}, EC: {calidad_agua.ec} µS/cm"');
    console.log('  • "Consumo elevado: {power_monitor_logs.power}W"');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testTemplateAPI();