const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

/**
 * Script de prueba completo para el sistema de notificaciones
 * 
 * Ejecutar con: node scripts/testNotificationSystem.js
 * 
 * Asegúrate de que:
 * 1. Las tablas de notificaciones estén creadas: node scripts/createNotificationTables.js
 * 2. El servidor esté ejecutándose con el notification worker activo
 */

async function testNotificationSystem() {
  logger.info('🧪 Iniciando pruebas del sistema de notificaciones...');

  try {
    // Inicializar el servicio (normalmente se hace en server.js)
    notificationService.initNotificationService({
      broadcastWebSocket: (message) => console.log('WebSocket broadcast:', message),
      sendToRoom: (room, message) => console.log(`Room ${room}:`, message),
      sendToUser: (userId, message) => console.log(`User ${userId}:`, message),
      sendToRole: (role, message) => console.log(`Role ${role}:`, message)
    });

    logger.info('✅ NotificationService inicializado');

    // Test 1: Verificar plantillas disponibles
    await testTemplates();

    // Test 2: Verificar canales disponibles
    await testChannels();

    // Test 3: Envío simple inmediato
    await testSimpleNotification();

    // Test 4: Envío con plantilla
    await testTemplateNotification();

    // Test 5: Notificación programada
    await testScheduledNotification();

    // Test 6: Múltiples canales
    await testMultiChannelNotification();

    // Test 7: Rate limiting
    await testRateLimiting();

    // Test 8: Manejo de errores
    await testErrorHandling();

    // Test 9: Sistema de prioridades
    await testPrioritySystem();

    // Test 10: Estadísticas
    await testStatistics();

    logger.info('🎉 Todas las pruebas del sistema de notificaciones completadas exitosamente!');

  } catch (error) {
    logger.error('❌ Error en las pruebas:', error);
    process.exit(1);
  }
}

async function testTemplates() {
  logger.info('📝 Test 1: Verificando plantillas disponibles...');
  
  try {
    const dlqTemplate = await notificationService.getTemplate('dlq_alert');
    const sensorTemplate = await notificationService.getTemplate('sensor_alert');
    const ruleTemplate = await notificationService.getTemplate('rule_triggered');
    const systemTemplate = await notificationService.getTemplate('system_info');
    const scheduledTemplate = await notificationService.getTemplate('scheduled_reminder');

    if (dlqTemplate) {
      logger.info('✅ Plantilla dlq_alert encontrada');
      logger.info(`   Canales: ${dlqTemplate.channels.join(', ')}`);
      logger.info(`   Prioridad: ${dlqTemplate.priority}`);
    }

    if (sensorTemplate) {
      logger.info('✅ Plantilla sensor_alert encontrada');
      logger.info(`   Canales: ${sensorTemplate.channels.join(', ')}`);
    }

    if (ruleTemplate) {
      logger.info('✅ Plantilla rule_triggered encontrada');
    }

    if (systemTemplate) {
      logger.info('✅ Plantilla system_info encontrada');
    }

    if (scheduledTemplate) {
      logger.info('✅ Plantilla scheduled_reminder encontrada');
    }

    logger.info('✅ Test de plantillas completado\n');
  } catch (error) {
    logger.error('❌ Error en test de plantillas:', error);
  }
}

async function testChannels() {
  logger.info('📡 Test 2: Verificando canales disponibles...');
  
  try {
    const emailChannel = await notificationService.getChannelConfig('email');
    const telegramChannel = await notificationService.getChannelConfig('telegram');
    const whatsappChannel = await notificationService.getChannelConfig('whatsapp');
    const websocketChannel = await notificationService.getChannelConfig('websocket');
    const systemLogChannel = await notificationService.getChannelConfig('system_log');

    const channels = [
      { name: 'email', config: emailChannel },
      { name: 'telegram', config: telegramChannel },
      { name: 'whatsapp', config: whatsappChannel },
      { name: 'websocket', config: websocketChannel },
      { name: 'system_log', config: systemLogChannel }
    ];

    channels.forEach(({ name, config }) => {
      if (config) {
        logger.info(`✅ Canal ${name} configurado`);
        logger.info(`   Rate limits: ${config.rate_limit_per_minute}/min, ${config.rate_limit_per_hour}/hora`);
        logger.info(`   Estado: ${config.is_active ? 'Activo' : 'Inactivo'}`);
      } else {
        logger.warn(`⚠️ Canal ${name} no encontrado`);
      }
    });

    logger.info('✅ Test de canales completado\n');
  } catch (error) {
    logger.error('❌ Error en test de canales:', error);
  }
}

async function testSimpleNotification() {
  logger.info('📨 Test 3: Envío simple inmediato...');
  
  try {
    const result = await notificationService.sendNotification({
      subject: 'Prueba de Notificación Simple',
      body: 'Esta es una prueba del sistema de notificaciones con envío inmediato.',
      recipient_type: 'test_user',
      recipient_target: 'test@example.com',
      channel: 'system_log',
      type: 'info',
      priority: 3,
      immediate: true,
      originDetails: {
        service: 'TestScript',
        testType: 'simple_notification'
      }
    });

    if (result.success) {
      logger.info('✅ Notificación simple enviada exitosamente');
      logger.info(`   ID de notificación: ${result.notificationId}`);
      if (result.processResult) {
        logger.info(`   Procesamiento: ${result.processResult.success ? 'Exitoso' : 'Fallido'}`);
      }
    } else {
      logger.error('❌ Error enviando notificación simple:', result.message);
    }

    logger.info('✅ Test de notificación simple completado\n');
  } catch (error) {
    logger.error('❌ Error en test de notificación simple:', error);
  }
}

async function testTemplateNotification() {
  logger.info('🎯 Test 4: Envío con plantilla...');
  
  try {
    // Test con plantilla de sensor alert
    const result = await notificationService.sendNotificationWithTemplate(
      'sensor_alert',
      {
        sensorName: 'DHT22-TEST-001',
        currentValue: '35.5°C',
        minValue: '15°C',
        maxValue: '30°C',
        location: 'Invernadero de Pruebas',
        timestamp: new Date().toISOString()
      },
      {
        recipient_type: 'test_user',
        recipient_target: 'admin@test-invernadero.com',
        originDetails: {
          service: 'TestScript',
          testType: 'template_notification',
          sensorId: 'DHT22-TEST-001'
        }
      }
    );

    if (result.success) {
      logger.info('✅ Notificación con plantilla enviada exitosamente');
      logger.info(`   Plantilla utilizada: ${result.template}`);
      logger.info(`   Canales procesados: ${result.results.length}`);
      
      result.results.forEach((channelResult, index) => {
        logger.info(`   Canal ${index + 1}: ${channelResult.channel} - ${channelResult.result.success ? 'Exitoso' : 'Fallido'}`);
      });
    } else {
      logger.error('❌ Error enviando notificación con plantilla:', result.error);
    }

    logger.info('✅ Test de notificación con plantilla completado\n');
  } catch (error) {
    logger.error('❌ Error en test de notificación con plantilla:', error);
  }
}

async function testScheduledNotification() {
  logger.info('⏰ Test 5: Notificación programada...');
  
  try {
    // Programar notificación para 2 minutos en el futuro
    const scheduledTime = new Date();
    scheduledTime.setMinutes(scheduledTime.getMinutes() + 2);

    const result = await notificationService.sendNotification({
      subject: 'Notificación Programada de Prueba',
      body: `Esta notificación fue programada para las ${scheduledTime.toLocaleTimeString()}`,
      recipient_type: 'test_user',
      recipient_target: 'scheduler@test-invernadero.com',
      channel: 'system_log',
      priority: 4,
      scheduledAt: scheduledTime,
      immediate: false,
      originDetails: {
        service: 'TestScript',
        testType: 'scheduled_notification'
      }
    });

    if (result.success) {
      logger.info('✅ Notificación programada creada exitosamente');
      logger.info(`   ID de notificación: ${result.notificationId}`);
      logger.info(`   Programada para: ${scheduledTime.toLocaleString()}`);
      logger.info(`   En cola: ${result.queued ? 'Sí' : 'No'}`);
      logger.info(`   ID de mensaje en cola: ${result.messageId}`);
    } else {
      logger.error('❌ Error programando notificación:', result.message);
    }

    logger.info('✅ Test de notificación programada completado\n');
  } catch (error) {
    logger.error('❌ Error en test de notificación programada:', error);
  }
}

async function testMultiChannelNotification() {
  logger.info('🌐 Test 6: Notificación multi-canal...');
  
  try {
    // Test enviando la misma notificación a múltiples canales
    const channels = ['system_log', 'websocket'];
    const results = [];

    for (const channel of channels) {
      const result = await notificationService.sendNotification({
        subject: 'Alerta Multi-Canal',
        body: `Esta es una alerta de prueba enviada al canal ${channel}`,
        recipient_type: 'test_user',
        recipient_target: channel === 'websocket' ? 'room:test_notifications' : 'multi@test-invernadero.com',
        channel: channel,
        priority: 2,
        immediate: true,
        originDetails: {
          service: 'TestScript',
          testType: 'multi_channel_notification',
          targetChannel: channel
        }
      });

      results.push({ channel, result });
    }

    logger.info('✅ Notificaciones multi-canal enviadas:');
    results.forEach(({ channel, result }) => {
      logger.info(`   ${channel}: ${result.success ? 'Exitoso' : 'Fallido'} ${result.notificationId ? `(ID: ${result.notificationId})` : ''}`);
    });

    logger.info('✅ Test de notificación multi-canal completado\n');
  } catch (error) {
    logger.error('❌ Error en test de notificación multi-canal:', error);
  }
}

async function testRateLimiting() {
  logger.info('🚦 Test 7: Rate limiting...');
  
  try {
    // Verificar rate limits para diferentes canales
    const emailRateLimit = await notificationService.checkRateLimit('email', 'rate-test@example.com');
    const telegramRateLimit = await notificationService.checkRateLimit('telegram', 'rate_test_user');
    const whatsappRateLimit = await notificationService.checkRateLimit('whatsapp', '+1234567890');

    logger.info('Rate limits verificados:');
    logger.info(`   Email: ${emailRateLimit.allowed ? 'Permitido' : 'Bloqueado'} - ${emailRateLimit.reason || 'OK'}`);
    if (emailRateLimit.limits) {
      logger.info(`     Límites: ${emailRateLimit.limits.per_minute}/min, ${emailRateLimit.limits.per_hour}/hora`);
      logger.info(`     Uso actual: ${emailRateLimit.counts.minute_count}/min, ${emailRateLimit.counts.hour_count}/hora`);
    }

    logger.info(`   Telegram: ${telegramRateLimit.allowed ? 'Permitido' : 'Bloqueado'} - ${telegramRateLimit.reason || 'OK'}`);
    logger.info(`   WhatsApp: ${whatsappRateLimit.allowed ? 'Permitido' : 'Bloqueado'} - ${whatsappRateLimit.reason || 'OK'}`);

    logger.info('✅ Test de rate limiting completado\n');
  } catch (error) {
    logger.error('❌ Error en test de rate limiting:', error);
  }
}

async function testErrorHandling() {
  logger.info('🔥 Test 8: Manejo de errores...');
  
  try {
    // Test 1: Datos inválidos
    const invalidResult = await notificationService.sendNotification({
      subject: '',  // Subject vacío (inválido)
      body: 'Test de error',
      recipient_type: '',  // Tipo vacío (inválido)
      recipient_target: '',  // Target vacío (inválido)
      channel: 'invalid_channel',  // Canal inválido
      immediate: true
    });

    logger.info(`❌ Datos inválidos: ${invalidResult.success ? 'Inesperadamente exitoso' : 'Correctamente rechazado'}`);
    if (!invalidResult.success) {
      logger.info(`   Mensaje de error: ${invalidResult.message}`);
    }

    // Test 2: Plantilla inexistente
    const templateResult = await notificationService.sendNotificationWithTemplate(
      'plantilla_inexistente',
      { variable: 'valor' },
      {
        recipient_type: 'test',
        recipient_target: 'test@example.com'
      }
    );

    logger.info(`❌ Plantilla inexistente: ${templateResult.success ? 'Inesperadamente exitoso' : 'Correctamente rechazado'}`);
    if (!templateResult.success) {
      logger.info(`   Mensaje de error: ${templateResult.error}`);
    }

    // Test 3: Canal inexistente
    const channelResult = await notificationService.sendNotification({
      subject: 'Test canal inexistente',
      body: 'Este canal no existe',
      recipient_type: 'test',
      recipient_target: 'test@example.com',
      channel: 'canal_que_no_existe',
      immediate: true
    });

    logger.info(`❌ Canal inexistente: ${channelResult.success ? 'Inesperadamente exitoso' : 'Correctamente rechazado'}`);

    logger.info('✅ Test de manejo de errores completado\n');
  } catch (error) {
    logger.error('❌ Error en test de manejo de errores:', error);
  }
}

async function testPrioritySystem() {
  logger.info('⭐ Test 9: Sistema de prioridades...');
  
  try {
    const priorities = [
      { level: 1, name: 'Crítica', description: 'Alerta crítica del sistema' },
      { level: 2, name: 'Alta', description: 'Problema importante' },
      { level: 3, name: 'Media', description: 'Notificación estándar' },
      { level: 4, name: 'Baja', description: 'Información general' },
      { level: 5, name: 'Background', description: 'Proceso en segundo plano' }
    ];

    logger.info('Enviando notificaciones con diferentes prioridades:');

    for (const priority of priorities) {
      const result = await notificationService.sendNotification({
        subject: `Test Prioridad ${priority.name}`,
        body: priority.description,
        recipient_type: 'test_user',
        recipient_target: 'priority@test-invernadero.com',
        channel: 'system_log',
        priority: priority.level,
        immediate: false, // Enviar a cola para ver el manejo de prioridades
        originDetails: {
          service: 'TestScript',
          testType: 'priority_test',
          priorityLevel: priority.level,
          priorityName: priority.name
        }
      });

      if (result.success) {
        logger.info(`   ✅ Prioridad ${priority.level} (${priority.name}): Encolada correctamente`);
        logger.info(`      ID: ${result.notificationId}, Cola: ${result.messageId}`);
      } else {
        logger.error(`   ❌ Prioridad ${priority.level} (${priority.name}): Error - ${result.message}`);
      }
    }

    logger.info('✅ Test de sistema de prioridades completado\n');
  } catch (error) {
    logger.error('❌ Error en test de sistema de prioridades:', error);
  }
}

async function testStatistics() {
  logger.info('📊 Test 10: Estadísticas del sistema...');
  
  try {
    // Esperar un poco para que se procesen las notificaciones anteriores
    await new Promise(resolve => setTimeout(resolve, 2000));

    const stats1Hour = await notificationService.getNotificationStats('1 hour');
    const stats24Hours = await notificationService.getNotificationStats('24 hours');

    if (stats1Hour.success) {
      logger.info('📈 Estadísticas última hora:');
      if (stats1Hour.stats.length > 0) {
        stats1Hour.stats.forEach(stat => {
          logger.info(`   ${stat.channel} - ${stat.status}: ${stat.count} notificaciones (${stat.avg_attempts} intentos promedio)`);
        });
      } else {
        logger.info('   No hay estadísticas para la última hora');
      }
    }

    if (stats24Hours.success) {
      logger.info('📈 Estadísticas últimas 24 horas:');
      if (stats24Hours.stats.length > 0) {
        stats24Hours.stats.forEach(stat => {
          logger.info(`   ${stat.channel} - ${stat.status}: ${stat.count} notificaciones (${stat.avg_attempts} intentos promedio)`);
        });
      } else {
        logger.info('   No hay estadísticas para las últimas 24 horas');
      }
    }

    logger.info('✅ Test de estadísticas completado\n');
  } catch (error) {
    logger.error('❌ Error en test de estadísticas:', error);
  }
}

// Función auxiliar para formatear tiempo
function formatTime(date) {
  return date.toLocaleString('es-ES', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Ejecutar las pruebas si el script se ejecuta directamente
if (require.main === module) {
  console.log(`\n🚀 Iniciando pruebas del sistema de notificaciones - ${formatTime(new Date())}\n`);
  
  testNotificationSystem()
    .then(() => {
      console.log(`\n✅ Pruebas completadas exitosamente - ${formatTime(new Date())}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ Error en las pruebas - ${formatTime(new Date())}\n`);
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  testNotificationSystem,
  testTemplates,
  testChannels,
  testSimpleNotification,
  testTemplateNotification,
  testScheduledNotification,
  testMultiChannelNotification,
  testRateLimiting,
  testErrorHandling,
  testPrioritySystem,
  testStatistics
};
