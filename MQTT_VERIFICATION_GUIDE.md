# 🔍 Verificación Rápida del Estado MQTT

## ⚡ Comandos de Diagnóstico

### 1. **Diagnóstico completo del sistema**
```bash
npm run diagnose:mqtt
```
**Qué verifica:**
- ✅ Variables de entorno
- ✅ Conexión PostgreSQL y Redis  
- ✅ Existencia de tablas
- ✅ Datos recientes (últimas 24h)
- ✅ Muestras de datos actuales

### 2. **Probar conexión MQTT**
```bash
npm run test:mqtt
```
**Qué hace:**
- Intenta conectar al broker MQTT
- Verifica suscripción a topics
- Se ejecuta por 30 segundos

### 3. **Simular datos de prueba**
```bash
npm run simulate:mqtt
```
**Qué hace:**
- Envía datos simulados a todos los topics
- Ejecuta por 30 segundos
- Datos: TemHum1, TemHum2, Agua, Power

### 4. **Verificar en tiempo real**
```bash
npm start
```
**Qué buscar en los logs:**
```
🔌 Initializing MQTT service...
✅ MQTT Client: Successfully connected to broker.
✅ MQTT Client: Successfully subscribed to topic: Invernadero/# with QoS 0
```

## 🔎 **Verificación paso a paso**

### Paso 1: Diagnóstico inicial
```bash
cd "/Users/marcelosalcedo/Proyectos IoT/Backend_Inv_IoT"
npm run diagnose:mqtt
```

**✅ Deberías ver:**
- Todas las conexiones exitosas
- Tablas existentes
- Variables MQTT configuradas

### Paso 2: Iniciar servidor con MQTT
```bash
npm start
```

**✅ Busca estos logs:**
- `🚀 Server running on port 4000`
- `🔌 Initializing MQTT service...`  
- `✅ MQTT Client: Successfully connected to broker.`

### Paso 3: Simular datos (nueva terminal)
```bash
npm run simulate:mqtt
```

**✅ Deberías ver:**
- Datos enviando cada 5 segundos
- En los logs del servidor: `MQTT Message Received`

### Paso 4: Verificar datos guardados
```bash
npm run diagnose:mqtt
```

**✅ Deberías ver:**
- Nuevos registros en las tablas
- Datos recientes en la muestra

## 🚨 **Problemas Comunes**

### ❌ **"MQTT_BROKER_URL is invalid"**
**Solución:**
```bash
# Editar .env
MQTT_BROKER_URL=mqtt://broker.emqx.io:1883
```

### ❌ **"Connection Error" / "ENOTFOUND"**
**Posibles causas:**
- Firewall bloqueando puerto 1883
- Red sin acceso a internet
- Broker MQTT inaccesible

**Solución:**
```bash
# Probar broker alternativo
MQTT_BROKER_URL=mqtt://test.mosquitto.org:1883
```

### ❌ **"DB Insert FAILED"**
**Posibles causas:**
- Tablas no creadas
- Error en PostgreSQL

**Solución:**
```sql
-- Conectar a PostgreSQL y ejecutar
\i sql/create_temhum1_table.sql
\i sql/create_temhum2_table.sql  
\i sql/create_calidad_agua_table.sql
```

### ❌ **"Redis HMSET FAILED"**
**Posibles causas:**
- Redis desconectado
- Credenciales incorrectas

**Solución:**
```bash
# Verificar conexión Redis
redis-cli -h 2h4eh9.easypanel.host -p 7963 -a 11211121 ping
```

## 🎯 **Estado Ideal**

Cuando todo funciona correctamente, verás:

### En el diagnóstico:
```
✅ Conexión a PostgreSQL exitosa
✅ Conexión a Redis exitosa  
✅ Todas las tablas existen con datos recientes
✅ Sensores en caché con timestamps actuales
```

### En los logs del servidor:
```
MQTT Message Received - Topic: Invernadero/TemHum1/data
✅ DB Insert Success - Table: temhum1
✅ Redis HMSET Success for sensor_latest:temhum1
```

### En la simulación:
```
📊 TemHum1: T=24.5°C, H=62.3%
💧 Agua: pH=7.2, EC=1200, PPM=850
⚡ Power: V=225.3V, I=2.45A, P=552.1W
```

---

**💡 Tip:** Ejecuta el diagnóstico antes y después de cambios para comparar resultados.
