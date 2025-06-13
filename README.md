# Backend IoT para Invernadero

API para monitoreo de sensores en un invernadero inteligente, con almacenamiento en PostgreSQL y caché en Redis.

## Requisitos

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- npm 9+

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:
```bash
npm install
```
3. Configurar variables de entorno (ver sección `.env`)

## Configuración

Crear archivo `.env` con las siguientes variables:

```ini
# Servidor
PORT=4000

# PostgreSQL
PG_URI=postgres://user:password@host:port/database

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USER=

# CORS (separar múltiples orígenes con comas)
CORS_ORIGINS=http://localhost:3000
```

## Uso

- Iniciar servidor en producción:
```bash
npm start
```

- Iniciar en modo desarrollo:
```bash
npm run dev
```

- Ejecutar tests:
```bash
npm test
```

## Endpoints API

### Consultas Temporales

Todos los endpoints soportan parámetros de rango temporal:

- `?hours=N`: Últimas N horas (ej: ?hours=24)
- `?days=N`: Últimos N días (ej: ?days=7)  
- `?weeks=N`: Últimas N semanas (ej: ?weeks=4)
- `?start=YYYY-MM-DD&end=YYYY-MM-DD`: Rango personalizado

Ejemplos:
- `/api/history/temhum1?hours=24` (datos horarios)
- `/api/stats/temhum2?days=7` (promedios diarios)
- `/api/history/calidad_agua?weeks=4` (datos semanales)

### `GET /api/latest/:table`
Obtiene el último registro de una tabla de sensores.

### `GET /api/history/:table`
Obtiene los últimos 100 registros de una tabla, ordenados por fecha descendente.

### `GET /api/stats/:table`
Obtiene estadísticas diarias (promedio, mínimo, máximo) de los últimos 7 días.

**Tablas disponibles:**
- `temhum1` - Temperatura y humedad zona 1 (datos disponibles)
- `temhum2` - Temperatura y humedad zona 2 (datos disponibles)
- `calidad_agua` - Parámetros de calidad de agua (solo datos de pH)
- `luxometro` - Datos de luminosidad (tabla vacía)

**Ejemplo de respuesta para /api/latest:**
```json
{
  "id": 123,
  "temperatura": 22.5,
  "humedad": 65,
  "received_at": "2025-06-12T17:30:45.123Z",
  "timestamp": 1734567845,
  "dew_point": 15.8
}
```

**Ejemplo de respuesta para /api/history:**
```json
[
  {
    "id": 43044,
    "temperatura": 14.2,
    "humedad": 78.8,
    "dew_point": 10.6,
    "received_at": "2025-06-12T18:20:28.135Z"
  },
  {
    "id": 43043,
    "temperatura": 14.1,
    "humedad": 78.9,
    "dew_point": 10.5,
    "received_at": "2025-06-12T18:19:57.712Z"
  }
]
```

**Ejemplo de respuesta para /api/stats:**
```json
[
  {
    "fecha": "2025-06-12",
    "total": 150,
    "temperatura": {
      "promedio": 14.5,
      "minimo": 13.8,
      "maximo": 15.2
    },
    "humedad": {
      "promedio": 78.3,
      "minimo": 76.5,
      "maximo": 79.8
    }
  }
]
```

### `GET /api/health`
Verifica el estado del servicio y conexiones a bases de datos.

**Respuesta:**
```json
{
  "status": "OK",
  "timestamp": "2025-06-12T17:32:10.456Z",
  "services": {
    "postgres": "OK",
    "redis": "OK"
  }
}
```

## Diagrama de Arquitectura

```mermaid
graph TD
    A[Sensores IoT] -->|Datos| B(API Backend)
    B --> C[(PostgreSQL)]
    B --> D[(Redis)]
    C --> E[Visualización]
    D --> E
    E --> F[Usuario Final]
```

## Ejemplos de Visualización

### Escala Horaria (últimas 24 horas)
```mermaid
xychart-beta
    title "Temperatura Promedio Horaria (°C)"
    x-axis "Hora" [00:00, 06:00, 12:00, 18:00]
    y-axis "°C" 10-->25
    line [12.5, 14.2, 19.8, 16.5]
```

### Escala Diaria (últimos 7 días)
```mermaid
xychart-beta
    title "Humedad Promedio Diaria (%)"
    x-axis "Día" ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    y-axis "%" 60-->90
    line [78.5, 82.1, 80.3, 75.6, 79.2, 83.4, 81.7]
```

### Escala Semanal (últimas 4 semanas)
```mermaid
xychart-beta
    title "pH Promedio Semanal"
    x-axis "Semana" ["1", "2", "3", "4"]
    y-axis "pH" 6.5-->7.5
    line [7.12, 7.05, 6.98, 7.08]
```

### Comparativo Multiescala
```mermaid
xychart-beta
    title "Comparación de Escalas Temporales"
    x-axis "Período" ["Horaria", "Diaria", "Semanal"]
    y-axis "Valor" 0-->100
    bar [65, 78, 82]
    bar [72, 85, 79]
```

## Estructura Técnica

- **Express.js** - Framework web
- **PostgreSQL** - Almacenamiento persistente
- **Redis** - Caché de respuestas
- **Winston** - Logging estructurado
- **Express-validator** - Validación de inputs
- **CORS** - Manejo de políticas de origen cruzado

## Dependencias Principales

- `express`: Framework web
- `pg`: Cliente PostgreSQL
- `ioredis`: Cliente Redis
- `winston`: Sistema de logging
- `express-validator`: Validación de endpoints
- `cors`: Middleware para CORS

## Scripts de Prueba

- `npm test`: Ejecuta tests unitarios
- `npm run test:watch`: Ejecuta tests en modo watch
- `npm run coverage`: Genera reporte de cobertura

## Manejo de Errores

La API devuelve errores en formato JSON con:
- Código HTTP apropiado
- Mensaje descriptivo
- Timestamp
- Path del request

Ejemplo de error:
```json
{
  "error": "Table not found",
  "path": "/api/latest/invalid_table",
  "timestamp": "2025-06-12T17:32:15.789Z"
}
```

## Licencia

MIT
