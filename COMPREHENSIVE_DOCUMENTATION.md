# Backend IoT - Documentación Completa del Sistema

## Índice
1. [Resumen del Proyecto](#resumen-del-proyecto)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Tecnologías Utilizadas](#tecnologías-utilizadas)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Base de Datos](#base-de-datos)
6. [Servicios MQTT](#servicios-mqtt)
7. [API Endpoints](#api-endpoints)
8. [Servicios y Middleware](#servicios-y-middleware)
9. [Configuración y Despliegue](#configuración-y-despliegue)
10. [Monitoreo y Logging](#monitoreo-y-logging)
11. [Scripts y Utilidades](#scripts-y-utilidades)

## Resumen del Proyecto

Backend IoT es un sistema completo de gestión de invernaderos inteligentes que recopila, procesa y almacena datos de sensores IoT a través de MQTT. El sistema maneja múltiples tipos de sensores:

- **Sensores de Temperatura/Humedad** (TemHum1, TemHum2)
- **Sensores de Calidad del Agua** (pH, EC, PPM, Temperatura del agua)
- **Sensores de Potencia** (Voltaje, Corriente, Potencia)
- **Sistema de Notificaciones**
- **Motor de Reglas Automatizadas**
- **Programación de Operaciones**

### Características Principales

- **Comunicación MQTT** en tiempo real
- **Base de datos PostgreSQL** para persistencia
- **Redis** para caché y datos en tiempo real
- **API RESTful** con autenticación JWT
- **Sistema de roles** (admin, editor, operator, viewer)
- **Motor de reglas** para automatización
- **Sistema de notificaciones** configurable
- **Monitoreo de dispositivos** y consumo energético

## Arquitectura del Sistema

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Sensores IoT  │───▶│  Broker MQTT    │───▶│  Backend API    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Frontend     │◀───│     Redis       │◀───│   PostgreSQL    │
│  (Dashboard)    │    │   (Cache/RT)    │    │   (Persistencia)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Flujo de Datos

1. **Sensores IoT** publican datos via MQTT
2. **MqttService** procesa mensajes y los estructura
3. **Datos** se almacenan en PostgreSQL y Redis
4. **API REST** expone datos para el frontend
5. **Motor de Reglas** evalúa condiciones automáticamente
6. **Sistema de Notificaciones** alerta sobre eventos

## Tecnologías Utilizadas

### Backend Core
- **Node.js** v18+ - Runtime de JavaScript
- **Express.js** - Framework web
- **PostgreSQL** - Base de datos principal
- **Redis** - Caché y datos en tiempo real

### Comunicación y Datos
- **MQTT** v5+ - Protocolo de comunicación IoT
- **WebSockets** - Comunicación bidireccional
- **JSON** - Formato de intercambio de datos

### Autenticación y Seguridad
- **JWT** - Tokens de autenticación
- **bcrypt** - Hash de contraseñas
- **CORS** - Control de acceso entre dominios

### Monitoreo y Utilidades
- **Winston** - Sistema de logging
- **node-cron** - Programador de tareas
- **Moment.js** - Manipulación de fechas
- **Axios** - Cliente HTTP

## Estructura del Proyecto

```
Backend_Inv_IoT/
├── config/                     # Configuraciones
│   ├── db.js                   # PostgreSQL
│   ├── redis.js                # Redis
│   └── logger.js               # Winston
├── middleware/                 # Middleware de Express
│   ├── auth.js                 # Autenticación JWT
│   ├── cache.js                # Middleware de caché
│   ├── errorHandler.js         # Manejo de errores
│   ├── validate.js             # Validaciones
│   └── auditLogger.js          # Logging de auditoría
├── routes/                     # Rutas de API
│   ├── auth.js                 # Autenticación
│   ├── data.js                 # Datos de sensores
│   ├── devices.js              # Gestión de dispositivos
│   ├── health.js               # Health checks
│   ├── notifications.js        # Sistema de notificaciones
│   ├── operations.js           # Operaciones
│   ├── rules.js                # Motor de reglas
│   ├── scheduledOperations.js  # Operaciones programadas
│   └── systemAdmin.js          # Administración
├── services/                   # Lógica de negocio
│   ├── authService.js          # Autenticación
│   ├── deviceService.js        # Dispositivos
│   ├── mqttService.js          # MQTT Principal
│   ├── notificationService.js  # Notificaciones
│   ├── operationService.js     # Operaciones
│   ├── queueService.js         # Colas de trabajo
│   ├── rulesEngineService.js   # Motor de reglas
│   ├── rulesService.js         # Gestión de reglas
│   ├── scheduleService.js      # Programación
│   └── schedulerEngineService.js # Motor de programación
├── services/rulesEngine/       # Sistema de reglas avanzado
│   ├── config/
│   ├── evaluators/
│   └── utils/
├── sql/                        # Scripts SQL
├── scripts/                    # Scripts de utilidad
├── workers/                    # Procesos en background
├── utils/                      # Utilidades
├── server.js                   # Servidor principal
└── index.js                    # Punto de entrada
```

## Base de Datos

### Tablas Principales

#### Usuarios y Autenticación
```sql
-- users: Sistema de usuarios con roles
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Dispositivos
```sql
-- devices: Registro de dispositivos IoT
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    device_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    config JSONB,
    room_id INTEGER,
    owner_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Sensores de Temperatura/Humedad
```sql
-- temhum1, temhum2: Datos de sensores ambientales
CREATE TABLE temhum1 (
    id SERIAL PRIMARY KEY,
    temperatura NUMERIC(5,2),
    humedad NUMERIC(5,2),
    heatindex NUMERIC(5,2),
    dewpoint NUMERIC(5,2),
    rssi INTEGER,
    boot INTEGER,
    mem INTEGER,
    stats_tmin NUMERIC(5,2),
    stats_tmax NUMERIC(5,2),
    stats_tavg NUMERIC(5,2),
    stats_hmin NUMERIC(5,2),
    stats_hmax NUMERIC(5,2),
    stats_havg NUMERIC(5,2),
    stats_total INTEGER,
    stats_errors INTEGER,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Calidad del Agua
```sql
-- calidad_agua: Parámetros hidropónicos
CREATE TABLE calidad_agua (
    id SERIAL PRIMARY KEY,
    ph NUMERIC(4,2),
    ec NUMERIC(8,2),
    ppm NUMERIC(8,2),
    temperatura_agua NUMERIC(5,2),
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Monitoreo de Potencia
```sql
-- power_monitor_logs: Consumo energético
CREATE TABLE power_monitor_logs (
    id SERIAL PRIMARY KEY,
    monitored_device_id INTEGER,
    voltage NUMERIC(6,2),
    current NUMERIC(8,4),
    power NUMERIC(10,4),
    sensor_timestamp TIMESTAMP,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Sistema de Reglas
```sql
-- rules: Motor de automatización
CREATE TABLE rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    priority INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Operaciones Programadas
```sql
-- scheduled_operations: Tareas programadas
CREATE TABLE scheduled_operations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    operation_type VARCHAR(50) NOT NULL,
    schedule_pattern VARCHAR(100) NOT NULL,
    target_device_id INTEGER,
    operation_config JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Sistema de Notificaciones
```sql
-- notifications: Registro de alertas
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    source_type VARCHAR(50),
    source_id VARCHAR(100),
    metadata JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- notification_channels: Canales de comunicación
CREATE TABLE notification_channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Servicios MQTT

### Configuración MQTT

El sistema utiliza MQTT para la comunicación en tiempo real con sensores IoT:

```javascript
// Configuración en mqttService.js
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io';
const MQTT_TOPIC_TO_SUBSCRIBE = 'Invernadero/#';
```

### Estructura de Topics

Los sensores publican en topics estructurados:

```
Invernadero/
├── TemHum1/data          # Sensor temp/humedad 1
├── TemHum2/data          # Sensor temp/humedad 2
├── Agua/data             # Parámetros múltiples del agua
├── Agua/Temperatura      # Solo temperatura del agua
└── [DeviceID]/data       # Sensores de potencia
```

### Procesamiento de Mensajes

#### Sensores TemHum
```json
{
  "temperatura": 24.5,
  "humedad": 65.2,
  "heatindex": 26.1,
  "dewpoint": 18.3,
  "rssi": -45,
  "boot": 1,
  "mem": 45123,
  "stats": {
    "tmin": 22.1,
    "tmax": 26.8,
    "tavg": 24.5,
    "hmin": 60.0,
    "hmax": 70.0,
    "havg": 65.2,
    "total": 100,
    "errors": 0
  }
}
```

#### Calidad del Agua
```json
{
  "ph": 6.8,
  "ec": 1.2,
  "ppm": 840,
  "temp": 22.5
}
```

#### Sensores de Potencia
```json
{
  "voltage": 230.5,
  "current": 2.34,
  "power": 539.67,
  "sensor_timestamp": "2024-01-15T10:30:00Z"
}
```

### Flujo de Procesamiento

1. **Recepción**: `client.on('message')` captura datos MQTT
2. **Parsing**: Deserialización JSON y validación
3. **Almacenamiento**: Inserción en PostgreSQL
4. **Cache**: Actualización de Redis para datos en tiempo real
5. **Eventos**: Emisión de eventos para actualizaciones en vivo
6. **Historial**: Mantenimiento de listas históricas en Redis

## API Endpoints

### Autenticación (`/api/auth`)

| Método | Endpoint | Descripción | Autenticación |
|--------|----------|-------------|---------------|
| POST | `/register` | Registro de usuario | No |
| POST | `/login` | Inicio de sesión | No |
| POST | `/logout` | Cierre de sesión | Sí |
| GET | `/profile` | Perfil del usuario | Sí |
| PUT | `/profile` | Actualizar perfil | Sí |

### Datos de Sensores (`/api`)

| Método | Endpoint | Descripción | Cache TTL |
|--------|----------|-------------|-----------|
| GET | `/chart/:table` | Datos para gráficos | 300s |
| GET | `/history/:table` | Historial paginado | 600s |
| GET | `/stats/:table` | Estadísticas diarias | 3600s |
| GET | `/latest/:table` | Último registro | 30s |

**Tablas soportadas**: `temhum1`, `temhum2`, `calidad_agua`, `luxometro`

### Dispositivos (`/api/devices`)

| Método | Endpoint | Descripción | Roles Requeridos |
|--------|----------|-------------|------------------|
| GET | `/` | Listar dispositivos | Todos |
| GET | `/:id` | Obtener dispositivo | Todos |
| POST | `/` | Crear dispositivo | admin, editor |
| PUT | `/:id` | Actualizar dispositivo | admin, editor |
| PATCH | `/:id/status` | Cambiar estado | admin, editor, operator |
| DELETE | `/:id` | Eliminar dispositivo | admin |
| GET | `/:id/consumption-history` | Historial de consumo | Todos |

### Reglas (`/api/rules`)

| Método | Endpoint | Descripción | Roles Requeridos |
|--------|----------|-------------|------------------|
| GET | `/` | Listar reglas | Todos |
| GET | `/:id` | Obtener regla | Todos |
| POST | `/` | Crear regla | admin, editor |
| PUT | `/:id` | Actualizar regla | admin, editor |
| DELETE | `/:id` | Eliminar regla | admin |
| POST | `/:id/toggle` | Activar/desactivar | admin, editor |

### Notificaciones (`/api/notifications`)

| Método | Endpoint | Descripción | Roles Requeridos |
|--------|----------|-------------|------------------|
| GET | `/` | Listar notificaciones | Todos |
| POST | `/mark-read` | Marcar como leídas | Todos |
| GET | `/channels` | Listar canales | admin |
| POST | `/channels` | Crear canal | admin |
| PUT | `/channels/:id` | Actualizar canal | admin |

### Operaciones (`/api/operations`)

| Método | Endpoint | Descripción | Roles Requeridos |
|--------|----------|-------------|------------------|
| GET | `/` | Historial de operaciones | Todos |
| POST | `/manual` | Ejecutar operación manual | admin, editor, operator |

### Operaciones Programadas (`/api/scheduled-operations`)

| Método | Endpoint | Descripción | Roles Requeridos |
|--------|----------|-------------|------------------|
| GET | `/` | Listar programaciones | Todos |
| GET | `/:id` | Obtener programación | Todos |
| POST | `/` | Crear programación | admin, editor |
| PUT | `/:id` | Actualizar programación | admin, editor |
| DELETE | `/:id` | Eliminar programación | admin |
| POST | `/:id/toggle` | Activar/desactivar | admin, editor |

### Health Check (`/api/health`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Estado del sistema |
| GET | `/detailed` | Estado detallado |

## Servicios y Middleware

### Servicios Principales

#### AuthService (`services/authService.js`)
- Registro y autenticación de usuarios
- Generación y validación de JWT tokens
- Gestión de roles y permisos
- Hash de contraseñas con bcrypt

#### DeviceService (`services/deviceService.js`)
- CRUD de dispositivos IoT
- Gestión de configuraciones
- Monitoreo de estado
- Historial de consumo energético

#### MqttService (`services/mqttService.js`)
- Conexión al broker MQTT
- Procesamiento de mensajes en tiempo real
- Almacenamiento en PostgreSQL y Redis
- Emisión de eventos para WebSockets

#### NotificationService (`services/notificationService.js`)
- Creación y gestión de notificaciones
- Canales de comunicación (email, webhook, etc.)
- Filtrado por severidad y tipo
- Marcado de lectura

#### RulesEngineService (`services/rulesEngineService.js`)
- Evaluación de condiciones automáticas
- Ejecución de acciones programadas
- Sistema de prioridades
- Logging de evaluaciones

### Middleware

#### Autenticación (`middleware/auth.js`)
```javascript
// Protección de rutas
app.use('/api/protected', protect);

// Autorización por roles
app.use('/api/admin', authorize(['admin']));
```

#### Cache (`middleware/cache.js`)
```javascript
// Cache con TTL personalizable
app.get('/api/data', cacheMiddleware('data-key', 300), handler);
```

#### Validación (`middleware/validate.js`)
```javascript
// Validación de parámetros de tabla
app.get('/api/chart/:table', validateTableParam, handler);
```

#### Manejo de Errores (`middleware/errorHandler.js`)
- Captura de errores no manejados
- Logging detallado
- Respuestas consistentes
- Ocultación de stack traces en producción

## Configuración y Despliegue

### Variables de Entorno

```bash
# Base de datos
PG_URI=postgresql://user:password@localhost:5432/invernadero_iot

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# MQTT
MQTT_BROKER_URL=mqtt://your_broker.com:1883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Servidor
PORT=4000
NODE_ENV=production

# Caché
SENSOR_HISTORY_MAX_LENGTH=100
```

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/your-repo/Backend_Inv_IoT.git
cd Backend_Inv_IoT

# Instalar dependencias
npm install

# Configurar base de datos
createdb invernadero_iot
psql invernadero_iot < sql/create_users_table.sql
psql invernadero_iot < sql/create_devices_table.sql
# ... ejecutar todos los scripts SQL

# Iniciar servidor
npm start

# Desarrollo con hot reload
npm run dev
```

### Scripts NPM

```json
{
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest __tests__/server.test.js",
  "test:watch": "jest __tests__/server.test.js --watch",
  "coverage": "jest __tests__/server.test.js --coverage",
  "test:mqtt": "node scripts/testMqttConnection.js",
  "test:notification": "node scripts/testNotificationSystem.js",
  "diagnose:mqtt": "node scripts/diagnoseMqttSystem.js",
  "simulate:mqtt": "node scripts/simulateMqttData.js"
}
```

## Monitoreo y Logging

### Sistema de Logging (Winston)

Configurado en `config/logger.js`:

```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

### Niveles de Log

- **error**: Errores críticos del sistema
- **warn**: Advertencias y situaciones anómalas
- **info**: Información general de operaciones
- **debug**: Información detallada para debugging

### Health Checks

Endpoint `/api/health` proporciona:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected",
  "mqtt": "connected"
}
```

### Audit Logging

Middleware `auditLogger.js` registra:
- Operaciones de usuarios
- Cambios en dispositivos
- Ejecución de reglas
- Accesos a la API

## Scripts y Utilidades

### Scripts de Diagnóstico

#### `scripts/diagnoseMqttSystem.js`
Verifica la conectividad y configuración MQTT:
- Conexión al broker
- Suscripción a topics
- Validación de credenciales
- Pruebas de latencia

#### `scripts/testMqttConnection.js`
Prueba básica de conexión MQTT:
- Conexión simple
- Publicación de mensaje de prueba
- Verificación de suscripción

#### `scripts/simulateMqttData.js`
Genera datos de prueba para desarrollo:
- Simula sensores TemHum
- Genera datos de calidad del agua
- Crea eventos de potencia
- Intervalos configurables

### Scripts de Base de Datos

#### `scripts/createNotificationTables.js`
Inicializa el sistema de notificaciones:
- Crea tablas de notificaciones
- Configura canales por defecto
- Inserta datos de prueba

#### `scripts/testNotificationSystem.js`
Prueba el sistema de notificaciones:
- Envío de notificaciones de prueba
- Verificación de canales
- Test de filtros y severidad

### Scripts de Seguridad

#### `scripts/testSecurityFeatures.js`
Valida características de seguridad:
- Validación de JWT
- Pruebas de autorización
- Verificación de hash de contraseñas
- Test de CORS

### Utilidades

#### `utils/dewPoint.js`
Calcula el punto de rocío basado en temperatura y humedad:

```javascript
function calcDewPoint(temperature, humidity) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temperature) / (b + temperature)) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
}
```

### Workers en Background

#### `workers/criticalActionWorker.js`
Procesa acciones críticas en cola:
- Operaciones de emergencia
- Acciones de alta prioridad
- Manejo de fallos
- Reintentos automáticos

#### `workers/notificationWorker.js`
Procesa envío de notificaciones:
- Cola de notificaciones pendientes
- Envío por diferentes canales
- Manejo de errores de envío
- Estadísticas de entrega

## Seguridad y Buenas Prácticas

### Autenticación y Autorización

- **JWT** con expiración configurable
- **Hash bcrypt** para contraseñas
- **Roles granulares** (admin, editor, operator, viewer)
- **Middleware de autorización** por endpoint

### Validación de Datos

- **Sanitización** de inputs SQL
- **Validación** de parámetros de API
- **Escape** de datos JSON
- **Limitación** de payloads

### CORS y Seguridad Web

- **Origins permitidos** configurables
- **Headers** de seguridad
- **Rate limiting** (implementar)
- **HTTPS** recomendado en producción

### Monitoreo de Seguridad

- **Audit logs** de operaciones sensibles
- **Detección** de intentos de acceso no autorizado
- **Alertas** de seguridad via notificaciones
- **Health checks** de componentes críticos

---

*Este documento se actualiza regularmente. Para cambios específicos, consultar el historial de commits del repositorio.*