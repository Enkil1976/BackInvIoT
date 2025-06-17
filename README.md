## Autenticación de usuarios

This section details user registration and login.

### Registro

`POST /api/auth/register`

Body (JSON):
```json
{
  "username": "usuario1",
  "email": "correo@ejemplo.com",
  "password": "tu_contraseña_segura"
}
```

Respuesta exitosa:
```json
{
  "user": {
    "id": 1,
    "username": "usuario1",
    "email": "correo@ejemplo.com",
    "created_at": "2025-06-13T21:00:00.000Z"
  }
}
```

### Login

`POST /api/auth/login`

Body (JSON):
```json
{
  "username": "usuario1",
  "password": "tu_contraseña_segura"
}
```

Respuesta exitosa:
```json
{
  "token": "JWT_AQUI",
  "user": {
    "id": 1,
    "username": "usuario1",
    "email": "correo@ejemplo.com",
    "created_at": "2025-06-13T21:00:00.000Z"
  }
}
```

### Acceso a rutas protegidas

Agrega el header `Authorization: Bearer JWT_AQUI` a tus peticiones.

Ejemplo para obtener el último registro de una tabla protegida:

```bash
curl -H "Authorization: Bearer JWT_AQUI" http://localhost:4000/api/latest/temhum1
```

### Crear un usuario administrador

Por seguridad, los usuarios administradores deben crearse manualmente en la base de datos.  
Ejemplo (usando psql):

1. Hashea la contraseña con bcrypt (puedes usar Node.js):

```js
// En consola Node.js
require('bcrypt').hashSync('tu_contraseña_segura', 12)
```

2. Inserta el usuario admin:

```sql
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@ejemplo.com', '<HASH_AQUI>', 'admin');
```

### Notas de seguridad

- Las contraseñas se almacenan hasheadas con bcrypt y sal.
- Los tokens JWT tienen expiración configurable (`JWT_EXPIRES_IN` en `.env`).
- Los tokens activos se almacenan en Redis para control de sesión.
- No compartas tu token ni tu contraseña.

## API Endpoints

This section details other API endpoints available in the application.

### Device Service API Endpoints

#### Get Device Consumption History

- **Endpoint:** `GET /api/devices/:id/consumption-history`
- **Description:** Retrieves the power consumption history (voltage, current, power readings over time) for a specified device. The `:id` in the path refers to the ID of the device being monitored (from the `devices` table), not the ID of the power sensor itself.
- **Auth:** Requires authentication (Bearer Token).
- **Path Parameters:**
  - `id` (integer, required): The ID of the device for which to retrieve consumption history.
- **Query Parameters:**
  - `startDate` (string, optional): ISO8601 date (e.g., `2023-01-01T00:00:00Z`). Filters records received on or after this date.
  - `endDate` (string, optional): ISO8601 date. Filters records received on or before this date.
  - `lastHours` (integer, optional): Number of past hours to retrieve data for (e.g., `24`). Ignored if `startDate` or `endDate` are present.
  - `limit` (integer, optional): Number of records per page. Default: 100.
  - `page` (integer, optional): Page number for pagination. Default: 1.
- **Example Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": 1,
        "monitored_device_id": 123,
        "voltage": 220.5,
        "current": 1.2,
        "power": 264.6,
        "sensor_timestamp": "2023-10-27T10:30:00Z",
        "received_at": "2023-10-27T10:30:05Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 100,
      "totalRecords": 500,
      "totalPages": 5
    }
  }
  ```
- **Example Error Responses:**
  - `401 Unauthorized`: If token is missing or invalid.
  - `400 Bad Request`: If `id` is invalid or other parameters are malformed.
  - `404 Not Found`: If device with `id` does not exist.

## Device Management

### Device Types and Configuration

#### Power Sensor (`power_sensor`)
- Devices of type `power_sensor` are used to monitor the energy consumption of other devices.
- **Configuration (`config` JSONB field):**
  - `monitors_device_id` (integer, required): The `id` (primary key from the `devices` table) of the device whose power consumption this sensor is monitoring.
  - Example `config`: `{"monitors_device_id": 123}` where `123` is the ID of another device (e.g., a relay controlling a pump).

## Database Schema Overview

This section provides a brief overview of key database tables.

### `devices` Table
- Stores information about all manageable devices in the system (sensors, actuators, etc.).
- Key columns: `id`, `name`, `device_id` (hardware ID), `type`, `status`, `config` (JSONB for specific settings), `room_id`, `last_seen_at`.

### `power_monitor_logs` Table
- **Purpose:** Stores historical voltage, current, and power readings from power monitoring sensors.
- **Key Columns:**
  - `id`: Primary key for the log entry.
  - `monitored_device_id`: Foreign key referencing `devices.id` (the device whose power is being measured).
  - `voltage`: Measured voltage (Real).
  - `current`: Measured current (Real).
  - `power`: Pre-calculated power (Real), typically `voltage * current`.
  - `sensor_timestamp`: Optional timestamp from the sensor itself (TIMESTAMPTZ).
  - `received_at`: Server-side timestamp when the log was recorded (TIMESTAMPTZ).

## Environment Variables

This application requires certain environment variables to be set in a `.env` file in the project root.

### MQTT Configuration

-   `MQTT_BROKER_URL`: The full URL of your EMQX MQTT broker.
    (e.g., `mqtt://broker.emqx.io:1883` for non-TLS, `mqtts://broker.emqx.io:8883` for TLS,
    `ws://broker.emqx.io:8083/mqtt` for WebSocket, `wss://broker.emqx.io:8084/mqtt` for Secure WebSocket)
-   `MQTT_USERNAME`: (Optional) Username for MQTT broker authentication.
-   `MQTT_PASSWORD`: (Optional) Password for MQTT broker authentication.

The application is configured to subscribe to topics under the root `Invernadero/#`. Specific sub-topics and their expected payloads are:

-   **Temperature & Humidity Sensors (e.g., TemHum1, TemHum2):**
    -   Topic: `Invernadero/<DeviceGroupID>/data` (e.g., `Invernadero/TemHum1/data`)
    -   Payload (JSON): Contains fields like `temperatura`, `humedad`, and a nested `stats` object. (Refer to `services/mqttService.js` for full structure).
-   **Water Quality Sensors (Agua):**
    -   Topic: `Invernadero/Agua/data`
    -   Payload (JSON): `{"ph": <number>, "ec": <number>, "ppm": <number>, "temperatura_agua": <number_optional>}`
    -   Topic: `Invernadero/Agua/Temperatura`
    -   Payload (Text): Plain text number representing water temperature.
-   **Power Monitoring Sensors:**
    -   Topic: `Invernadero/<PowerSensorDeviceID>/data` (where `<PowerSensorDeviceID>` is the `device_id` of a device of type `power_sensor`).
    -   Payload (JSON): `{"voltage": <number>, "current": <number>, "power": <number>, "sensor_timestamp": "<ISO8601_string_optional>"}`.
        The `power` field is expected to be pre-calculated by the device. `sensor_timestamp` is an optional timestamp from the sensor itself.

Example `.env` entries:

```
MQTT_BROKER_URL=mqtt://broker.emqx.io:1883
# MQTT_USERNAME=your_username
# MQTT_PASSWORD=your_password
```
Refer to the EMQX documentation for connection details: [https://docs.emqx.com/en/cloud/latest/connect_to_deployments/nodejs_sdk.html](https://docs.emqx.com/en/cloud/latest/connect_to_deployments/nodejs_sdk.html)

### JWT Authentication Configuration

-   `JWT_SECRET`: A strong, secret key used to sign and verify JSON Web Tokens. Keep this private.
    (e.g., `your-very-strong-jwt-secret-key`)
-   `JWT_EXPIRES_IN`: The duration for which JWTs will be valid.
    (e.g., `1h` for one hour, `7d` for seven days, `30m` for thirty minutes)

### PostgreSQL Configuration

-   `PG_URI`: The connection string for your PostgreSQL database.
    (e.g., `postgresql://user:password@host:port/database`)

### Redis Configuration

-   `REDIS_HOST`: Hostname for your Redis server.
-   `REDIS_PORT`: Port for your Redis server.
-   `REDIS_PASSWORD`: (Optional) Password for Redis authentication.
-   `REDIS_USER`: (Optional) Username for Redis authentication (if using Redis ACLs).
```
