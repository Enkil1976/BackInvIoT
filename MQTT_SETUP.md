# 🚀 Configuración Rápida de MQTT

## ⚡ Inicio Rápido

### 1. Configurar variables de entorno:
```bash
# Copiar plantilla de configuración
cp .env.example .env

# Editar .env con tus credenciales
nano .env
```

### 2. Configurar broker MQTT en `.env`:
```env
MQTT_BROKER_URL=mqtt://tu-broker-mqtt.com:1883
MQTT_USERNAME=tu-usuario
MQTT_PASSWORD=tu-contraseña
```

### 3. Probar conexión MQTT:
```bash
npm run test:mqtt
```

### 4. Iniciar servidor:
```bash
npm start
```

## 📡 Topics MQTT Soportados

- `Invernadero/TemHum1/data` - Sensor temperatura/humedad 1
- `Invernadero/TemHum2/data` - Sensor temperatura/humedad 2
- `Invernadero/Agua/data` - Calidad del agua
- `Invernadero/Agua/Temperatura` - Temperatura del agua
- `Invernadero/{DEVICE_ID}/data` - Sensores de potencia

## 🔧 Solución de Problemas

Ver archivo completo: [`MQTT_TROUBLESHOOTING.md`](./MQTT_TROUBLESHOOTING.md)

### Verificación rápida:
```bash
# 1. Probar conexión
npm run test:mqtt

# 2. Verificar logs del servidor
npm start

# 3. Verificar datos en BD
psql $PG_URI -c "SELECT * FROM temhum1 ORDER BY received_at DESC LIMIT 5;"
```

## 📊 Monitoreo

Los datos se almacenan en:
- **PostgreSQL**: Datos históricos completos
- **Redis**: Cache de últimos valores y historial limitado

### Verificar Redis:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD
> HGETALL sensor_latest:temhum1
```

---

**¿Problemas?** Consulta la [guía completa de troubleshooting](./MQTT_TROUBLESHOOTING.md)
