// Script para probar el sistema de plantillas de notificaciones
const notificationTemplateService = require('./services/notificationTemplateService');
const logger = require('./config/logger');
require('./config/timezone'); // Configurar zona horaria

console.log('🔧 Probando el sistema de plantillas de notificaciones...\n');

async function testTemplateSystem() {
  try {
    // 1. Probar extracción de variables
    console.log('1️⃣ Probando extracción de variables...');
    const template1 = 'Alerta: La temperatura es {temhum1.temperatura}°C y la humedad es {temhum1.humedad}%';
    const variables = notificationTemplateService.extractVariables(template1);
    console.log('Variables encontradas:', variables);
    console.log('✅ Extracción de variables exitosa\n');

    // 2. Probar obtención de variables disponibles
    console.log('2️⃣ Probando obtención de variables disponibles...');
    const availableVars = await notificationTemplateService.getAvailableVariables();
    console.log('Variables disponibles:');
    Object.entries(availableVars).forEach(([sensor, info]) => {
      console.log(`  - ${sensor} (${info.label}):`);
      Object.entries(info.fields).forEach(([field, fieldInfo]) => {
        console.log(`    * ${field}: ${fieldInfo.label} ${fieldInfo.unit ? `(${fieldInfo.unit})` : ''}`);
      });
    });
    console.log('✅ Variables disponibles obtenidas\n');

    // 3. Probar procesamiento de plantilla con datos reales
    console.log('3️⃣ Probando procesamiento con datos de sensores...');
    const template2 = 'ALERTA: Temperatura actual: {temhum1.temperatura}°C, Humedad: {temhum1.humedad}%, pH del agua: {calidad_agua.ph}';
    
    try {
      const processedMessage = await notificationTemplateService.processTemplate(template2);
      console.log('Plantilla original:', template2);
      console.log('Mensaje procesado:', processedMessage);
      console.log('✅ Procesamiento con datos reales exitoso\n');
    } catch (error) {
      console.log('⚠️ No hay datos reales disponibles, usando datos de contexto:', error.message);
      
      // Probar con datos de contexto
      const contextData = {
        'temhum1.temperatura': 24.5,
        'temhum1.humedad': 65,
        'calidad_agua.ph': 7.2
      };
      
      const processedWithContext = await notificationTemplateService.processTemplate(template2, contextData);
      console.log('Plantilla original:', template2);
      console.log('Mensaje con contexto:', processedWithContext);
      console.log('✅ Procesamiento con contexto exitoso\n');
    }

    // 4. Probar plantilla compleja
    console.log('4️⃣ Probando plantilla compleja...');
    const complexTemplate = `🚨 ALERTA CRÍTICA:
- Sensor TemHum1: {temhum1.temperatura}°C, {temhum1.humedad}% humedad
- Sensor TemHum2: {temhum2.temperatura}°C, {temhum2.humedad}% humedad  
- Calidad Agua: pH {calidad_agua.ph}, EC {calidad_agua.ec} µS/cm
- Energía: {power_monitor_logs.power}W, {power_monitor_logs.voltage}V

Revisión requerida inmediatamente.`;

    const contextData2 = {
      'temhum1.temperatura': 28.7,
      'temhum1.humedad': 85,
      'temhum2.temperatura': 26.3,
      'temhum2.humedad': 78,
      'calidad_agua.ph': 6.1,
      'calidad_agua.ec': 1850,
      'power_monitor_logs.power': 2450,
      'power_monitor_logs.voltage': 220
    };

    const complexProcessed = await notificationTemplateService.processTemplate(complexTemplate, contextData2);
    console.log('Plantilla compleja procesada:');
    console.log(complexProcessed);
    console.log('✅ Plantilla compleja procesada exitosamente\n');

    // 5. Probar variables inexistentes
    console.log('5️⃣ Probando manejo de variables inexistentes...');
    const templateWithInvalid = 'Temperatura: {sensor_inexistente.campo_inexistente}°C, Válida: {temhum1.temperatura}°C';
    const processedInvalid = await notificationTemplateService.processTemplate(templateWithInvalid, {
      'temhum1.temperatura': 22.5
    });
    console.log('Plantilla con variables inválidas:', templateWithInvalid);
    console.log('Resultado (variables inválidas se mantienen):', processedInvalid);
    console.log('✅ Manejo de variables inexistentes exitoso\n');

    // 6. Probar formateo de valores
    console.log('6️⃣ Probando formateo de valores...');
    const testValues = {
      'test.numero_entero': 25,
      'test.numero_decimal': 24.567,
      'test.texto': 'OK',
      'test.booleano': true,
      'test.nulo': null
    };

    const templateFormatos = 'Entero: {test.numero_entero}, Decimal: {test.numero_decimal}, Texto: {test.texto}, Bool: {test.booleano}, Nulo: {test.nulo}';
    const processedFormatos = await notificationTemplateService.processTemplate(templateFormatos, testValues);
    console.log('Formateo de valores:', processedFormatos);
    console.log('✅ Formateo de valores exitoso\n');

    console.log('🎉 Todas las pruebas del sistema de plantillas completadas exitosamente!');

  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar pruebas
testTemplateSystem().then(() => {
  console.log('\n✅ Sistema de plantillas listo para usar en notificaciones');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error fatal en las pruebas:', error);
  process.exit(1);
});