#!/bin/bash
# Script simple para hacer commits de los cambios MQTT

echo "🚀 Guardando cambios MQTT en Git..."

# Agregar archivos
git add server.js .env.example package.json scripts/testMqttConnection.js MQTT_SETUP.md MQTT_TROUBLESHOOTING.md

# Commit único con todos los cambios
git commit -m "fix: Complete MQTT service integration and setup

- Initialize MQTT service automatically on server startup
- Add environment variables template (.env.example)
- Create MQTT connection testing script
- Add comprehensive setup and troubleshooting documentation
- Include npm scripts for testing

Resolves: MQTT service not receiving/processing data
- Server was missing MQTT service initialization
- Missing environment variables configuration
- No testing tools or documentation available

Files changed:
- server.js: Added MQTT initialization and cleanup
- .env.example: MQTT configuration template
- package.json: Added test scripts
- scripts/testMqttConnection.js: Connection testing tool
- MQTT_SETUP.md: Quick start guide
- MQTT_TROUBLESHOOTING.md: Complete troubleshooting guide"

echo "✅ Cambios guardados en Git!"
echo ""
echo "📊 Último commit:"
git log --oneline -1
echo ""
echo "🌿 Para subir al repositorio remoto:"
echo "   git push origin \$(git branch --show-current)"
