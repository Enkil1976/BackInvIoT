#!/bin/bash

echo "🔍 VERIFICACIÓN RÁPIDA DEL ESTADO MQTT LOCAL"
echo "==========================================="
echo ""

echo "1. ¿Está el servicio MQTT en server.js?"
grep -n "connectMqtt" server.js && echo "✅ SÍ" || echo "❌ NO"

echo ""
echo "2. ¿Están las variables MQTT en .env?"
grep -n "MQTT_BROKER_URL" .env && echo "✅ SÍ" || echo "❌ NO"

echo ""
echo "3. ¿Existe el script de test?"
[ -f "scripts/testMqttConnection.js" ] && echo "✅ Script de test existe" || echo "❌ Script no existe"

echo ""
echo "4. ¿Existe el simulador?"
[ -f "scripts/simulateMqttData.js" ] && echo "✅ Simulador existe" || echo "❌ Simulador no existe"

echo ""
echo "5. ¿Está actualizado package.json?"
grep -n "test:mqtt" package.json && echo "✅ Scripts agregados" || echo "❌ Scripts faltantes"

echo ""
echo "📡 PRÓXIMOS PASOS:"
echo "=================="
echo "1. Probar localmente: npm start"
echo "2. En otra terminal: npm run simulate:mqtt"
echo "3. Verificar logs en la primera terminal"
echo "4. Si funciona localmente, hacer deploy a producción"
echo "5. Configurar variables MQTT en Render"

echo ""
echo "🚀 PARA DEPLOY EN RENDER:"
echo "========================"
echo "1. Hacer commits de los cambios"
echo "2. Push al repositorio"
echo "3. Configurar variables de entorno en Render:"
echo "   - MQTT_BROKER_URL=mqtt://broker.emqx.io:1883"
echo "   - MQTT_USERNAME=(opcional)"
echo "   - MQTT_PASSWORD=(opcional)"
echo "   - SENSOR_HISTORY_MAX_LENGTH=100"
