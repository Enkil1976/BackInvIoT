// Test simple del sistema de plantillas sin autenticación
const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testSimple() {
  try {
    console.log('🧪 Probando procesamiento de plantilla sin autenticación...');
    
    // Endpoint público para prueba
    const response = await axios.get(`${BASE_URL}/api/health`);
    
    if (response.status === 200) {
      console.log('✅ Servidor funcionando correctamente');
      
      // Probar el servicio directamente
      const notificationTemplateService = require('./services/notificationTemplateService');
      
      console.log('\n📋 Probando variables disponibles...');
      const variables = await notificationTemplateService.getAvailableVariables();
      console.log('Variables disponibles:');
      Object.entries(variables).forEach(([sensor, info]) => {
        console.log(`  📊 ${sensor}: ${info.label}`);
        Object.entries(info.fields).forEach(([field, fieldInfo]) => {
          console.log(`     - {${sensor}.${field}} = ${fieldInfo.label} ${fieldInfo.unit ? `(${fieldInfo.unit})` : ''}`);
        });
      });

      console.log('\n🔧 Probando procesamiento de plantillas...');
      
      // Plantilla de ejemplo con datos simulados
      const template = 'La temperatura del invernadero es {temhum1.temperatura}°C y la humedad es {temhum1.humedad}%';
      const contextData = {
        'temhum1.temperatura': 25.3,
        'temhum1.humedad': 68
      };
      
      const processedMessage = await notificationTemplateService.processTemplate(template, contextData);
      
      console.log('📝 Plantilla original:', template);
      console.log('🎯 Mensaje procesado:', processedMessage);
      
      console.log('\n🎉 Sistema de plantillas funcionando correctamente!');
      console.log('\n💡 Ejemplos de uso:');
      console.log('  • {temhum1.temperatura} → Temperatura sensor 1');
      console.log('  • {temhum2.humedad} → Humedad sensor 2'); 
      console.log('  • {calidad_agua.ph} → pH del agua');
      console.log('  • {power_monitor_logs.power} → Consumo eléctrico');
      
    } else {
      console.log('❌ Servidor no responde correctamente');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimple();