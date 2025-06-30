const notificationService = require('./services/notificationService');
const logger = require('./config/logger');

async function testN8nWebhookSimple() {
  console.log('🚀 Iniciando prueba simple de webhook n8n...');
  
  try {
    // Inicializar el servicio
    notificationService.initNotificationService({
      broadcastWebSocket: (message) => console.log('WebSocket broadcast:', message),
      sendToRoom: (room, message) => console.log(`Room ${room}:`, message),
      sendToUser: (userId, message) => console.log(`User ${userId}:`, message),
      sendToRole: (role, message) => console.log(`Role ${role}:`, message)
    });

    console.log('✅ NotificationService inicializado');

    // Enviar notificación simple al webhook de n8n
    const result = await notificationService.sendNotification({
      subject: 'Alerta de Sensor IoT',
      body: 'Temperatura del invernadero: 28.5°C - Fuera del rango normal (15-25°C)',
      recipient_type: 'webhook',
      recipient_target: 'https://n8n.marcelosalcedo.cl/webhook/test-iot-notifications',
      channel: 'email', // Usamos el canal email configurado para webhooks
      type: 'alert',
      priority: 2,
      immediate: true,
      originDetails: {
        service: 'TestN8nWebhook',
        testType: 'simple_webhook_test',
        sensorId: 'DHT22-001',
        location: 'Invernadero Principal'
      }
    });

    if (result.success) {
      console.log('✅ Notificación enviada exitosamente al webhook de n8n');
      console.log(`   ID de notificación: ${result.notificationId}`);
      if (result.processResult) {
        console.log(`   Procesamiento: ${result.processResult.success ? 'Exitoso' : 'Fallido'}`);
        if (result.processResult.result) {
          console.log(`   Respuesta del webhook:`, result.processResult.result);
        }
        if (result.processResult.error) {
          console.log(`   Error: ${result.processResult.error}`);
        }
      }
    } else {
      console.error('❌ Error enviando notificación al webhook:', result.message);
    }

    console.log('\n🎉 Prueba de webhook n8n completada!');

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    process.exit(1);
  }
}

// Ejecutar la prueba
if (require.main === module) {
  testN8nWebhookSimple()
    .then(() => {
      console.log('\n✅ Prueba completada exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error en la prueba:', error);
      process.exit(1);
    });
}

module.exports = { testN8nWebhookSimple };
