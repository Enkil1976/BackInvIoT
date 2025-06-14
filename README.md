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
