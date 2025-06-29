# Sistema de Notificaciones Avanzado - Backend IoT

## Resumen

Este documento describe el sistema de notificaciones completamente implementado para el backend del sistema IoT de invernadero, incluyendo integración con webhook de n8n para envío real de notificaciones via email, Telegram, WhatsApp y otros canales.

## Arquitectura del Sistema

### Componentes Principales

1. **NotificationService** (`services/notificationService.js`)
   - Lógica principal del sistema de notificaciones
   - Manejo de plantillas dinámicas
   - Rate limiting inteligente
   - Integración con webhook n8n
   - Sistema de reintentos con backoff exponencial

2. **NotificationWorker** (`workers/notificationWorker.js`)
   - Procesador asíncrono de colas de notificaciones
   - Manejo de prioridades (1=crítica, 5=background)
   - Procesamiento de notificaciones programadas
   - Fallback para notificaciones perdidas

3. **Base de Datos** (4 nuevas tablas)
   - `notifications`: Tracking de todas las notificaciones
   - `notification_templates`: Plantillas reutilizables
   - `notification_channels`: Configuración de canales
   - `notification_rate_limits`: Control de frecuencia

4. **API REST** (`routes/notifications.js`)
   - Endpoints completos para gestión de notificaciones
   - Autenticación y autorización
   - Validación robusta con express-validator

## Configuración del Webhook n8n

### URL del Webhook
```
https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f
```

### Autenticación JWT
```
API Key: IoT_InvernaderoSystem_2025_SuperSecureKey_32chars_minimum
Authorization: Bearer {API_KEY}
```

### Formato de Payload
```json
{
  "channel": "email|telegram|whatsapp",
  "to": "destinatario",
  "subject": "Asunto de la notificación", 
  "message": "Cuerpo del mensaje",
  "priority": 1-5
}
```

## Canales Soportados

### 1. Email
- **Rate Limit**: 30/minuto, 500/hora
- **Formato**: Correo electrónico HTML/texto
- **Uso**: Alertas importantes, reportes

### 2. Telegram
- **Rate Limit**: 60/minuto, 1000/hora
- **Formato**: Mensaje de texto con markdown
- **Uso**: Notificaciones en tiempo real

### 3. WhatsApp
- **Rate Limit**: 20/minuto, 300/hora
- **Formato**: Mensaje de texto
- **Uso**: Alertas críticas

### 4. WebSocket
- **Rate Limit**: Sin límite
- **Formato**: JSON en tiempo real
- **Uso**: Notificaciones en aplicación web

### 5. System Log
- **Rate Limit**: Sin límite
- **Formato**: Log estructurado
- **Uso**: Auditoría y debugging

## Plantillas Predefinidas

### 1. DLQ Alert (`dlq_alert`)
```
Prioridad: 1 (Crítica)
Canales: email, telegram
Variables: streamName, currentSize, threshold, timestamp
```

### 2. Sensor Alert (`sensor_alert`)
```
Prioridad: 2 (Alta)
Canales: whatsapp, email
Variables: sensorName, currentValue, minValue, maxValue, location, timestamp
```

### 3. Rule Triggered (`rule_triggered`)
```
Prioridad: 3 (Media)
Canales: telegram, websocket
Variables: ruleName, condition, value, deviceName, timestamp, actionTaken
```

### 4. System Info (`system_info`)
```
Prioridad: 5 (Background)
Canales: system_log
Variables: title, message, timestamp
```

### 5. Scheduled Reminder (`scheduled_reminder`)
```
Prioridad: 4 (Baja)
Canales: email, telegram
Variables: title, message, scheduledTime, relatedEntity
```

## API Endpoints

### Autenticación
Todos los endpoints requieren autenticación JWT:
```
Authorization: Bearer {JWT_TOKEN}
```

### Endpoints Principales

#### POST `/api/notifications/send`
Enviar notificación inmediata
```json
{
  "subject": "Asunto",
  "body": "Mensaje",
  "recipient_type": "email|user_id|system",
  "recipient_target": "destinatario",
  "channel": "email|telegram|whatsapp|websocket|system_log",
  "priority": 1-5,
  "immediate": true|false
}
```

#### POST `/api/notifications/send-template`
Enviar usando plantilla
```json
{
  "templateName": "sensor_alert",
  "variables": {
    "sensorName": "Sensor DHT22",
    "currentValue": "35°C",
    "minValue": "15°C",
    "maxValue": "30°C",
    "location": "Invernadero 1",
    "timestamp": "2025-06-28T10:30:00Z"
  },
  "recipient_type": "email",
  "recipient_target": "admin@invernadero.com"
}
```

#### POST `/api/notifications/schedule`
Programar notificación
```json
{
  "subject": "Recordatorio de riego",
  "body": "Es hora de revisar el sistema de riego",
  "recipient_type": "email",
  "recipient_target": "operador@invernadero.com",
  "scheduledAt": "2025-06-29T08:00:00Z",
  "channel": "email",
  "priority": 4
}
```

#### GET `/api/notifications`
Listar notificaciones (con paginación y filtros)
```
Query params: page, limit, status, channel, priority, timeframe
```

#### GET `/api/notifications/:id`
Obtener notificación específica

#### GET `/api/notifications/stats/summary`
Estadísticas de notificaciones
```
Query params: timeframe (1 hour, 24 hours, 7 days, 30 days)
```

#### GET `/api/notifications/templates/list`
Listar plantillas disponibles

#### GET `/api/notifications/templates/:name`
Obtener plantilla específica

#### GET `/api/notifications/channels/list`
Listar canales configurados

#### PUT `/api/notifications/channels/:name` (Admin only)
Actualizar configuración de canal

## Uso Programático

### Envío Simple
```javascript
const notificationService = require('./services/notificationService');

// Envío inmediato
await notificationService.sendNotification({
  subject: 'Alerta de temperatura',
  body: 'La temperatura ha excedido 30°C',
  recipient_type: 'email',
  recipient_target: 'admin@invernadero.com',
  channel: 'email',
  priority: 2,
  immediate: true
});
```

### Envío con Plantilla
```javascript
// Usando plantilla predefinida
await notificationService.sendNotificationWithTemplate(
  'sensor_alert',
  {
    sensorName: 'DHT22-001',
    currentValue: '35°C',
    minValue: '15°C',
    maxValue: '30°C',
    location: 'Invernadero Principal',
    timestamp: new Date().toISOString()
  },
  {
    recipient_type: 'email',
    recipient_target: 'admin@invernadero.com',
    originDetails: {
      service: 'TemperatureMonitor',
      sensorId: 'DHT22-001'
    }
  }
);
```

### Notificación Programada
```javascript
// Programar para mañana a las 8 AM
const tomorrow8AM = new Date();
tomorrow8AM.setDate(tomorrow8AM.getDate() + 1);
tomorrow8AM.setHours(8, 0, 0, 0);

await notificationService.sendNotification({
  subject: 'Recordatorio: Revisar sensores',
  body: 'Es hora de hacer la revisión diaria de sensores',
  recipient_type: 'email',
  recipient_target: 'tecnico@invernadero.com',
  channel: 'email',
  priority: 4,
  scheduledAt: tomorrow8AM
});
```

## Rate Limiting

### Límites por Canal
- **Email**: 30/min, 500/hora, 10,000/día
- **Telegram**: 60/min, 1,000/hora, 20,000/día
- **WhatsApp**: 20/min, 300/hora, 5,000/día
- **WebSocket**: Sin límite
- **System Log**: Sin límite

### Comportamiento
- Cuando se excede un límite, la notificación se programa para reintento
- Backoff automático basado en el tipo de límite excedido
- Alertas administrativas cuando se exceden límites frecuentemente

## Sistema de Colas

### Colas por Prioridad
```
notification_critical (prioridad 1)    - Procesamiento inmediato
notification_high (prioridad 2)        - < 30 segundos
notification_medium (prioridad 3)      - < 2 minutos
notification_low (prioridad 4)         - < 5 minutos
notification_background (prioridad 5)  - Cuando hay capacidad
```

### Dead Letter Queue
- Notificaciones que fallan después de 3 reintentos
- Monitoreo automático del tamaño de DLQ
- Alertas cuando DLQ excede 10 mensajes

## Reintentos y Manejo de Errores

### Estrategia de Reintentos
- **Intento 1**: Inmediato
- **Intento 2**: 1 minuto después
- **Intento 3**: 2 minutos después
- **Intento 4**: 4 minutos después

### Tipos de Error
- **Rate Limit**: Reintento automático respetando límites
- **Network Error**: Reintento con backoff exponencial
- **Invalid Data**: No reintento, va a DLQ inmediatamente
- **Auth Error**: No reintento, alerta al administrador

## Monitoreo y Métricas

### Métricas Disponibles
- Notificaciones enviadas por canal y período
- Tasa de éxito/fallo por canal
- Tiempo promedio de procesamiento
- Estado de colas y DLQ
- Rate limiting activo

### Logs Estructurados
Todos los eventos incluyen:
- Timestamp
- Usuario origen
- Canal utilizado
- Estado de envío
- Tiempo de procesamiento
- Errores detallados

## Integración con Otros Sistemas

### Rules Engine
```javascript
// En una regla, enviar notificación
if (temperature > threshold) {
  await notificationService.sendNotificationWithTemplate('sensor_alert', {
    sensorName: deviceName,
    currentValue: `${temperature}°C`,
    threshold: `${threshold}°C`,
    location: deviceLocation,
    timestamp: new Date().toISOString()
  }, {
    recipient_type: 'email',
    recipient_target: 'alert@invernadero.com'
  });
}
```

### Scheduler Engine
```javascript
// Notificación programada desde scheduler
await queueService.addCriticalAction({
  targetService: 'notificationService',
  targetMethod: 'sendNotification',
  payload: notificationData,
  origin: { service: 'SchedulerEngine', scheduleId: schedule.id }
});
```

### WebSocket Integration
Las notificaciones de canal WebSocket se envían automáticamente a:
- `room:notifications` para usuarios suscritos
- `user:{userId}` para usuarios específicos
- `role:{role}` para usuarios con roles específicos

## Seguridad

### Autenticación
- JWT obligatorio para todos los endpoints
- Validación de roles para operaciones administrativas
- Rate limiting a nivel de usuario

### Autorización
- Usuarios normales: solo ven sus propias notificaciones
- Editores: pueden enviar notificaciones
- Administradores: acceso completo y configuración

### Validación
- Sanitización de inputs
- Validación de plantillas
- Verificación de canales válidos
- Protección contra inyección

## Backup y Recuperación

### Base de Datos
- Todas las notificaciones se persisten
- Histórico completo con metadatos
- Índices optimizados para consultas

### Colas Redis
- Persistencia en Redis
- DLQ para mensajes fallidos
- Recuperación automática en reinicio

## Configuración de Producción

### Variables de Entorno
```bash
# Rate Limiting
NOTIFICATION_RATE_LIMIT_EMAIL_MIN=30
NOTIFICATION_RATE_LIMIT_EMAIL_HOUR=500
NOTIFICATION_RATE_LIMIT_TELEGRAM_MIN=60
NOTIFICATION_RATE_LIMIT_WHATSAPP_MIN=20

# Worker Configuration
NOTIFICATION_WORKER_CONCURRENCY=5
NOTIFICATION_WORKER_RETRY_DELAY=1000
NOTIFICATION_WORKER_MAX_RETRIES=3

# DLQ Monitoring
NOTIFICATION_DLQ_THRESHOLD=10
NOTIFICATION_DLQ_CHECK_INTERVAL=300000
```

### Monitoreo de Salud
```bash
# Health check endpoint
GET /api/health

# Incluye estado de:
# - PostgreSQL
# - Redis
# - Colas de notificación
# - Workers activos
```

## Ejemplos de Uso

Ver archivo `scripts/testNotificationSystem.js` para ejemplos completos de uso del sistema.

## Soporte y Mantenimiento

### Logs de Debug
```javascript
// Habilitar logs detallados
process.env.LOG_LEVEL = 'debug';
```

### Herramientas de Administración
- Endpoint para limpiar DLQ
- Reenvío manual de notificaciones fallidas
- Estadísticas detalladas de rendimiento
- Configuración dinámica de rate limits

## Roadmap Futuro

### Características Planeadas
1. **Push Notifications**: Integración con FCM/APNS
2. **SMS**: Integración con Twilio
3. **Slack/Discord**: Integraciones adicionales
4. **Templates Avanzados**: Editor visual de plantillas
5. **Analytics**: Dashboard de métricas en tiempo real
6. **A/B Testing**: Pruebas de diferentes formatos de mensaje
