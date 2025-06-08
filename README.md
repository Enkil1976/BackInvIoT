# Backend para Sistema de Monitoreo IoT de Invernadero

Este proyecto es un backend desarrollado en Node.js con Express que permite monitorear y analizar datos de sensores de un invernadero inteligente. El sistema se conecta a una base de datos PostgreSQL para almacenar los datos y utiliza Redis para el almacenamiento en caché, mejorando el rendimiento de las consultas frecuentes.

## 🚀 Características Principales

- **Monitoreo en Tiempo Real**: Obtén los últimos registros de los sensores del invernadero.
- **Histórico de Datos**: Consulta datos históricos con paginación y filtros por fecha.
- **Estadísticas Diarias**: Visualiza promedios, mínimos y máximos de las mediciones.
- **Gráficos**: Endpoints optimizados para la generación de gráficos de tendencias.
- **Caché Inteligente**: Implementa caché con Redis para mejorar el rendimiento.
- **CORS Configurado**: Listo para integración con frontend en diferentes dominios.

## 🛠️ Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución de JavaScript
- **Express**: Framework web para Node.js
- **PostgreSQL**: Base de datos relacional para almacenamiento persistente
- **Redis**: Almacenamiento en caché
- **ioredis**: Cliente Redis para Node.js
- **Moment.js**: Manejo de fechas y horas
- **CORS**: Middleware para habilitar CORS

## 📦 Estructura del Proyecto

```
.
├── server.js           # Punto de entrada de la aplicación
├── package.json        # Dependencias y scripts
├── package-lock.json   # Versiones exactas de dependencias
└── node_modules/       # Dependencias instaladas
```

## 🔌 Configuración

1. **Variables de Entorno**: Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
PG_URI=postgres://usuario:contraseña@host:puerto/base_de_datos?sslmode=disable
REDIS_HOST=host_redis
REDIS_PORT=puerto_redis
REDIS_PASSWORD=contraseña_redis
```

2. **Instalación de Dependencias**:

```bash
npm install
```

3. **Ejecución**:

```bash
# Modo desarrollo
npm run dev

# Modo producción
npm start
```

## 📚 API Endpoints

### 1. Obtener último registro
```
GET /api/latest/:table
```
**Parámetros:**
- `table`: Nombre de la tabla (ej: 'temhum1', 'luxometro', 'calidad_agua')

### 2. Obtener histórico
```
GET /api/history/:table
```
**Parámetros de consulta:**
- `page`: Número de página (por defecto: 1)
- `limit`: Registros por página (máx. 500, por defecto: 100)
- `from`: Fecha de inicio (formato ISO)
- `to`: Fecha de fin (formato ISO)

### 3. Estadísticas diarias
```
GET /api/stats/:table
```
**Parámetros de consulta:**
- `days`: Número de días hacia atrás (por defecto: 7)

### 4. Datos para gráficos
```
GET /api/chart/:table
```
**Parámetros de consulta:**
- `hours`: Horas hacia atrás (por defecto: 24)

## 🔐 Seguridad

- CORS configurado solo para dominios autorizados
- Manejo de errores centralizado
- Timeouts para conexiones a base de datos

## 🧪 Pruebas

El proyecto incluye pruebas unitarias con Jest. Para ejecutarlas:

```bash
# Ejecutar pruebas
npm test

# Ejecutar pruebas en modo watch
npm run test:watch

# Generar reporte de cobertura
npm run coverage
```

## 📊 Estructura de la Base de Datos

El sistema espera las siguientes tablas:

1. **temhum1** y **temhum2**: Datos de temperatura y humedad
2. **luxometro**: Datos de iluminación
3. **calidad_agua**: Parámetros de calidad del agua

Cada tabla debe incluir al menos los siguientes campos:
- `id`: Identificador único
- `temperatura`: Temperatura en grados Celsius
- `humedad`: Humedad relativa en porcentaje
- `received_at`: Marca de tiempo de la medición

## 🤝 Contribución

1. Haz un fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Haz commit de tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Haz push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## ✉️ Contacto

Para consultas o soporte, contacta al equipo de desarrollo.
