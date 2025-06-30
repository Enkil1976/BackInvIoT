# Guía de Solución de Problemas MQTT

## Problemas Identificados y Solucionados

### 1. **Servicio MQTT no se inicializaba automáticamente**
- **Problema**: El `mqttService.js` tenía toda la lógica pero nunca se llamaba `connectMqtt()`
- **Solución**: Agregado al `server.js` la inicialización automática del servicio MQTT

### 2. **Variables de entorno faltantes**
- **Problema**: No estaban definidas las variables MQTT en `.env`
- **Solución**: Agregadas las siguientes variables:
  ```env
  MQTT_BROKER_URL=mqtt://broker.emqx.io:1883
  MQTT_USERNAME=
  MQTT_PASSWORD=
  SENSOR_HISTORY_MAX_LENGTH=100
  ```

## Configuración del Broker MQTT

### Para usar un broker privado:
1. Cambia `MQTT_BROKER_URL` a tu broker personalizado
2. Configura `MQTT_USERNAME` y `MQTT_PASSWORD` si tu broker requiere autenticación

### Para brokers populares:
- **HiveMQ Cloud**: `mqtt://your-cluster.hivemq.cloud:1883`
- **AWS IoT Core**: `mqtts://your-endpoint.amazonaws.com:8883`
- **Azure IoT Hub**: `mqtts://your-hub.azure-devices.net:8883`
- **Mosquitto local**: `mqtt://localhost:1883`

## Scripts de Prueba

### Probar conexión MQTT:
```bash
npm run test:mqtt
```

### Monitorear logs en tiempo real:
```bash
# Si usas PM2
pm2 logs

# Si usas el servidor directamente
npm start
```

## Estructura de Topics MQTT

El sistema escucha en el topic: `Invernadero/#`

### Topics soportados:
- `Invernadero/TemHum1/data` - Datos de temperatura y humedad sensor 1
- `Invernadero/TemHum2/data` - Datos de temperatura y humedad sensor 2
- `Invernadero/Agua/data` - Datos de calidad del agua (pH, EC, PPM)
- `Invernadero/Agua/Temperatura` - Temperatura del agua solamente
- `Invernadero/{DEVICE_ID}/data` - Datos de sensores de potencia

### Formato de datos esperado:

**TemHum (JSON):**
```json
{
  "temperatura": 25.5,
  "humedad": 60.2,
  "heatindex": 26.1,
  "dewpoint": 17.8,
  "rssi": -45,
  "boot": 1,
  "mem": 45320,
  "stats": {
    "tmin": 20.1,
    "tmax": 28.5,
    "tavg": 24.3,
    "hmin": 55.0,
    "hmax": 65.0,
    "havg": 60.0,
    "total": 100,
    "errors": 0
  }
}
```

**Agua/data (JSON):**
```json
{
  "ph": 7.2,
  "ec": 1200,
  "ppm": 850,
  "temp": 22.5
}
```

**Agua/Temperatura (texto plano):**
```
22.5
```

**Power Sensor (JSON):**
```json
{
  "voltage": 220.5,
  "current": 2.3,
  "power": 507.15,
  "sensor_timestamp": "2024-01-01T12:00:00Z"
}
```

## Verificación de Funcionamiento

### 1. Logs de conexión exitosa:
```
✅ MQTT Client: Successfully connected to broker.
✅ MQTT Client: Successfully subscribed to topic: Invernadero/# with QoS 0
```

### 2. Logs de recepción de datos:
```
MQTT Message Received - Topic: Invernadero/TemHum1/data, Raw Payload: {...}
✅ DB Insert Success - Table: temhum1, Topic: Invernadero/TemHum1/data
✅ Redis HMSET Success for sensor_latest:temhum1
```

### 3. Verificación en base de datos:
```sql
-- Verificar últimos datos recibidos
SELECT * FROM temhum1 ORDER BY received_at DESC LIMIT 5;
SELECT * FROM temhum2 ORDER BY received_at DESC LIMIT 5;
SELECT * FROM calidad_agua ORDER BY received_at DESC LIMIT 5;
```

### 4. Verificación en Redis:
```bash
# Conectar a Redis y verificar datos en caché
redis-cli -h 2h4eh9.easypanel.host -p 7963 -a 11211121
> HGETALL sensor_latest:temhum1
> LRANGE sensor_history:temhum1:temperatura 0 10
```

## Solución de Problemas Comunes

### Error: "Connection Error"
- Verificar que `MQTT_BROKER_URL` sea correcta
- Verificar conectividad de red al broker
- Revisar firewall o proxy

### Error: "Authentication failed"
- Verificar `MQTT_USERNAME` y `MQTT_PASSWORD`
- Confirmar permisos en el broker MQTT

### No se reciben mensajes:
- Verificar que los dispositivos publiquen en los topics correctos
- Usar herramientas como MQTT Explorer para monitorear
- Revisar logs del servidor para errores de parsing

### Datos no se guardan en BD:
- Verificar conexión a PostgreSQL
- Revisar logs de errores SQL
- Confirmar estructura de tablas

### Problemas con Redis:
- Verificar conexión a Redis
- Confirmar credenciales Redis
- Revisar espacio disponible en Redis
