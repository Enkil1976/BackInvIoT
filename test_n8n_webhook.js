const notificationService = require('./services/notificationService');
const logger = require('./config/logger');

async function testN8nWebhook() {
  console.log('🚀 Iniciando prueba de webhook n8n...');
  
  try {
    // Inicializar el servicio
    notificationService.initNotificationService({
      broadcastWebSocket: (message) => console.log('WebSocket broadcast:', message),
      sendToRoom: (room, message) => console.log(`Room ${room}:`, message),
      sendToUser: (userId, message) => console.log(`User ${userId}:`, message),
      sendToRole: (role, message) => console.log(`Role ${role}:`, message)
    });

    console.log('✅ NotificationService inicializado');

    // Enviar notificación de prueba al webhook
    const webhookData = {
      message: 'Esta es una prueba del sistema de notificaciones del invernadero IoT',
      timestamp: new Date().toISOString(),
      sensor_data: {
        temperatura: 25.5,
        humedad: 65.2,
        ph: 6.8
      },
      alert_type: 'test',
      source: 'Backend_Inv_IoT'
    };

    const result = await notificationService.sendNotification({
      subject: 'Prueba de Webhook n8n desde Backend IoT',
      body: 'Datos del sensor: temperatura 25.5°C, humedad 65.2%, pH 6.8',
      recipient_type: 'webhook',
      recipient_target: 'https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f',
      channel: 'email', // Usaremos el canal email que está configurado para webhooks
      type: 'info',
      priority: 2,
      immediate: true,
      originDetails: {
        service: 'TestN8nWebhook',
        testType: 'webhook_notification',
        target: 'n8n',
        webhookData: webhookData
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
      }
    } else {
      console.error('❌ Error enviando notificación al webhook:', result.message);
    }

    // También probar con una plantilla
    console.log('\n🎯 Probando con plantilla sensor_alert...');
    
    const templateResult = await notificationService.sendNotificationWithTemplate(
      'sensor_alert',
      {
        sensorName: 'DHT22-Invernadero-001',
        currentValue: '28.5°C',
        minValue: '15°C',
        maxValue: '25°C',
        location: 'Invernadero Principal',
        timestamp: new Date().toISOString()
      },
      {
        recipient_type: 'webhook',
        recipient_target: 'https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f',
        originDetails: {
          service: 'TestN8nWebhook',
          testType: 'template_webhook_notification',
          sensorId: 'DHT22-Invernadero-001'
        }
      }
    );

    if (templateResult.success) {
      console.log('✅ Notificación con plantilla enviada exitosamente');
      console.log(`   Plantilla utilizada: ${templateResult.template}`);
      console.log(`   Canales procesados: ${templateResult.results.length}`);
      
      templateResult.results.forEach((channelResult, index) => {
        console.log(`   Canal ${index + 1}: ${channelResult.channel} - ${channelResult.result.success ? 'Exitoso' : 'Fallido'}`);
        if (channelResult.result.response) {
          console.log(`     Respuesta: ${JSON.stringify(channelResult.result.response)}`);
        }
      });
    } else {
      console.error('❌ Error enviando notificación con plantilla:', templateResult.error);
    }

    console.log('\n🎉 Prueba de webhook n8n completada!');

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    process.exit(1);
  }
}

// Ejecutar la prueba
if (require.main === module) {
  testN8nWebhook()
    .then(() => {
      console.log('\n✅ Prueba completada exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error en la prueba:', error);
      process.exit(1);
    });
}

module.exports = { testN8nWebhook };
