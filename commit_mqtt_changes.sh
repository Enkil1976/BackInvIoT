#!/bin/bash

# Script para guardar los cambios de MQTT en git
# Ejecutar desde la raíz del proyecto

echo "🔍 Verificando estado de git..."
git status

echo ""
echo "📋 Archivos modificados para MQTT:"
echo "  - server.js (inicialización MQTT)"
echo "  - .env.example (plantilla de variables MQTT)" 
echo "  - package.json (scripts de prueba)"
echo "  - scripts/testMqttConnection.js (nuevo)"
echo "  - MQTT_TROUBLESHOOTING.md (guía completa)"
echo "  - MQTT_SETUP.md (configuración rápida)"
echo "  - commit_mqtt_changes.sh (este script)"

echo ""
echo "📦 Agregando archivos al staging area..."

# Agregar archivos modificados
git add server.js
git add .env.example
git add package.json

# Agregar archivos nuevos
git add scripts/testMqttConnection.js
git add MQTT_TROUBLESHOOTING.md
git add MQTT_SETUP.md
git add commit_mqtt_changes.sh

echo ""
echo "💾 Creando commits organizados..."

# Commit 1: Configuración principal MQTT
git commit -m "feat: Initialize MQTT service on server startup

- Add MQTT service initialization in server.js
- Import connectMqtt and disconnectMqtt functions
- Add MQTT connection on server start
- Add graceful MQTT disconnection on server shutdown
- Handle SIGINT and SIGTERM signals for clean shutdown"

# Commit 2: Variables de entorno
git commit -m "config: Add MQTT environment variables template

- Add .env.example with MQTT configuration template
- Include MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD placeholders  
- Add SENSOR_HISTORY_MAX_LENGTH setting
- Document all required environment variables
- Exclude sensitive .env file from repository"

# Commit 3: Scripts y herramientas
git commit -m "feat: Add MQTT testing and monitoring tools

- Add testMqttConnection.js script for MQTT testing
- Add npm scripts for MQTT and notification testing
- Include connection diagnostics and timeout handling
- Add signal handling for clean script termination"

# Commit 4: Documentación
git commit -m "docs: Add comprehensive MQTT setup and troubleshooting guides

- Add MQTT_SETUP.md with quick start instructions
- Add MQTT_TROUBLESHOOTING.md with complete setup guide
- Document identified issues and solutions
- Include broker configuration examples
- Add data format specifications and verification steps
- Provide common problem resolution steps
- Add git commit script for organized changes"

echo ""
echo "✅ Commits creados exitosamente!"
echo ""
echo "📊 Log de commits recientes:"
git log --oneline -5

echo ""
echo "🌿 Branch actual:"
git branch --show-current

echo ""
echo "🚀 Para subir los cambios al repositorio remoto:"
echo "   git push origin \$(git branch --show-current)"
