## Autenticación de usuarios

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

## MQTT Configuration

To connect to an MQTT broker, you need to set the following environment variables in your `.env` file:

-   `MQTT_BROKER_URL`: The full URL of your EMQX MQTT broker.
    (e.g., `mqtt://broker.emqx.io:1883` for non-TLS, `mqtts://broker.emqx.io:8883` for TLS,
    `ws://broker.emqx.io:8083/mqtt` for WebSocket, `wss://broker.emqx.io:8084/mqtt` for Secure WebSocket)
-   `MQTT_USERNAME`: (Optional) Username for MQTT broker authentication.
-   `MQTT_PASSWORD`: (Optional) Password for MQTT broker authentication.

The application is configured to subscribe to topics under the root `Invernadero/#`. Specific sub-topics like `Invernadero/TemHum1/data` or `Invernadero/Agua/data` are processed internally.

Example `.env` entries:

```
MQTT_BROKER_URL=mqtt://broker.emqx.io:1883
# MQTT_USERNAME=your_username
# MQTT_PASSWORD=your_password
```
Refer to the EMQX documentation for connection details: [https://docs.emqx.com/en/cloud/latest/connect_to_deployments/nodejs_sdk.html](https://docs.emqx.com/en/cloud/latest/connect_to_deployments/nodejs_sdk.html)
