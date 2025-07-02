# Sistema de Prioridades de Notificaciones

## Descripción General

El sistema de notificaciones IoT ahora implementa un sistema de prioridades que controla la frecuencia de envío de notificaciones para evitar spam y gestionar alertas de manera eficiente según su criticidad.

## Niveles de Prioridad

| Prioridad | Nivel | Frecuencia de Notificación | Color en UI | Casos de Uso |
|-----------|-------|----------------------------|-------------|--------------|
| 5 | **Crítica** | Cada **5 minutos** | 🔴 Rojo | Fallos críticos, emergencias |
| 4 | **Alta** | Cada **10 minutos** | 🟠 Naranja | Problemas importantes que requieren atención |
| 3 | **Media** | Cada **15 minutos** | 🟡 Amarillo | Alertas estándar, umbrales superados |
| 2 | **Baja** | Cada **30 minutos** | 🔵 Azul | Notificaciones informativas |
| 1 | **Muy Baja** | Cada **1 hora** | 🟢 Verde | Reportes periódicos, logs |

## Cómo Funciona

### Mecanismo de Cooldown

1. **Evaluación de Condiciones**: El motor de reglas evalúa todas las reglas activas cada 30 segundos
2. **Verificación de Cooldown**: Antes de evaluar condiciones, verifica si ha pasado suficiente tiempo desde la última notificación según la prioridad
3. **Envío de Notificaciones**: Solo envía notificaciones si:
   - Las condiciones de la regla se cumplen, Y
   - Ha transcurrido el tiempo de cooldown requerido

### Ejemplo de Comportamiento

```
Regla: "Temperatura Crítica" (Prioridad 5)
- 12:00 - Condiciones cumplidas → Notificación enviada
- 12:02 - Condiciones cumplidas → Bloqueada (cooldown 5m)
- 12:05 - Condiciones cumplidas → Notificación enviada
- 12:07 - Condiciones cumplidas → Bloqueada (cooldown 5m)
```

## Configuración en Frontend

### Selección de Prioridad
En el panel de notificaciones, al crear o editar una regla:

```typescript
<select>
  <option value={5}>Crítica (5) - Notificaciones cada 5 minutos</option>
  <option value={4}>Alta (4) - Notificaciones cada 10 minutos</option>
  <option value={3}>Media (3) - Notificaciones cada 15 minutos</option>
  <option value={2}>Baja (2) - Notificaciones cada 30 minutos</option>
  <option value={1}>Muy Baja (1) - Notificaciones cada 1 hora</option>
</select>
```

### Visualización de Estado
- **Badge de Prioridad**: Muestra nivel y frecuencia con código de colores
- **Estado de Cooldown**: Indica si la regla está en período de espera

## Implementación Técnica

### Backend (rulesEngineService.js)

```javascript
// Configuración de cooldowns por prioridad
const PRIORITY_COOLDOWNS = {
  1: 60,   // 1 hora
  2: 30,   // 30 minutos
  3: 15,   // 15 minutos
  4: 10,   // 10 minutos
  5: 5     // 5 minutos
};

// Función de verificación de cooldown
function canTriggerRule(rule) {
  if (!rule.last_triggered_at) return true;
  
  const priority = Math.max(1, Math.min(5, rule.priority || 3));
  const cooldownMinutes = PRIORITY_COOLDOWNS[priority];
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  const timeSinceLastTrigger = Date.now() - new Date(rule.last_triggered_at).getTime();
  return timeSinceLastTrigger >= cooldownMs;
}
```

### Base de Datos

La tabla `rules` almacena:
- `priority`: Nivel de prioridad (1-5)
- `last_triggered_at`: Timestamp de última activación
- Índices optimizados para consultas por prioridad

## Logs y Monitoreo

### Logs del Motor de Reglas

```
RulesEngine: Rule 6 ('Alerta de Humedad') is in cooldown period. 
Priority 2 requires 30m between notifications. Skipping evaluation.
```

### Métricas de Cooldown

```
Rule 1: "Temperatura Alta" (P2/30m) - Ready to trigger (127.2m since last)
Rule 6: "Alerta de Humedad" (P2/30m) - In cooldown: 29.8m remaining
```

## Scripts de Prueba

### test_priority_system.js
Script para demostrar y probar el sistema de prioridades:

```bash
cd Backend_Inv_IoT
node test_priority_system.js
```

Crea una regla de prueba con prioridad crítica y muestra el estado de todas las reglas activas.

## Mejores Prácticas

### Asignación de Prioridades

1. **Prioridad 5 (Crítica)**: Solo para emergencias reales
   - Fallos de sistema críticos
   - Condiciones peligrosas para equipos o personas

2. **Prioridad 4 (Alta)**: Problemas que requieren atención pronta
   - Sensores desconectados
   - Valores muy fuera de rango

3. **Prioridad 3 (Media)**: Alertas estándar
   - Umbrales de temperatura/humedad superados
   - Alertas de mantenimiento preventivo

4. **Prioridad 2 (Baja)**: Información relevante
   - Cambios de estado de dispositivos
   - Reportes de tendencias

5. **Prioridad 1 (Muy Baja)**: Información de contexto
   - Reportes diarios/semanales
   - Logs de actividad rutinaria

### Configuración de Canales

- **Crítica/Alta**: Múltiples canales (email + telegram + whatsapp)
- **Media**: Email + un canal adicional
- **Baja/Muy Baja**: Solo email o logs

## Ventajas del Sistema

1. **Prevención de Spam**: Evita bombardeo de notificaciones repetitivas
2. **Gestión Inteligente**: Prioriza alertas críticas sobre informativas
3. **Flexibilidad**: Administradores pueden ajustar prioridades según necesidades
4. **Eficiencia**: Reduce carga en servicios de notificación externa (n8n)
5. **Claridad**: Usuarios entienden frecuencia esperada de cada tipo de alerta

## Migración de Reglas Existentes

Las reglas existentes mantienen su prioridad actual. Se recomienda revisar y ajustar prioridades según los nuevos criterios:

- Reglas con `priority <= 2`: Considerar como alta/crítica
- Reglas con `priority = 3`: Mantener como media
- Reglas con `priority >= 4`: Considerar como baja/muy baja

El sistema es compatible con versiones anteriores y funciona sin modificaciones en reglas existentes.