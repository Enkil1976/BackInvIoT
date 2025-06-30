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
    "created_at": "2025-06-13T21:00:00.000Z",
    "role": "viewer"
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

Por seguridad, los usuarios administradores deben crearse manually en la base de datos.
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
(Details for Device, Operation, Schedule, and Rule CRUD endpoints would typically be listed here or in separate API documentation files.)

### Device Service API Endpoints

(Content including owner_user_id in request/response and GET filter as previously verified)
...

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

### Schedule Service API Endpoints

The Schedule Service API allows for creating, managing, and retrieving scheduled operations for devices.

**Note on Conflict Detection:** When creating or updating schedules, the system performs a basic conflict check. It verifies if the proposed schedule's next execution time (or the next few for cron jobs) would exactly match another existing enabled schedule for the same device. If a conflict is detected, a `409 Conflict` error is returned. This check helps prevent duplicate executions but does not account for the duration of actions.

#### `POST /api/scheduled-operations`
Creates a new scheduled operation.
-   **Authentication:** Required (e.g., admin, editor roles).
-   **Request Body:**
    ```json
    {
      "device_id": 123, // Required: Database ID of the target device
      "action_name": "set_status", // Required: Name of the action to perform
      "action_params": {"status": "on"}, // Required: Parameters for the action
      "cron_expression": "0 * * * *", // Optional: For recurring tasks
      "execute_at": "2024-12-31T23:59:00Z", // Optional: For one-time tasks (either this or cron_expression is required)
      "is_enabled": true, // Optional: Defaults to true
      "description": "Turn on device every hour" // Optional
    }
    ```
-   **Success Response (201 Created):** The created scheduled operation object.
-   **Error Responses:**
    -   `400 Bad Request`: Invalid input data (e.g., missing required fields, invalid cron expression, invalid `execute_at` date).
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have permission.
    -   `409 Conflict`: Returned if the proposed schedule's execution time(s) directly clash with another existing enabled schedule for the same device. The system checks for exact time matches, considering the next execution for one-time tasks and the next few occurrences (e.g., next 5 or within a 48-hour window) for cron-based schedules. (This does not yet account for action durations).
    -   `500 Internal Server Error`: Server-side error.

-   **Supported `action_name` values and their `action_params`:**
    -   `set_status`:
        -   Purpose: Changes the status of the target device.
        -   `action_params`: `{ "status": "on" }` or `{ "status": "off" }` (or any other valid status string for the device type).
    -   `apply_device_config`:
        -   Purpose: Updates the `config` JSONB field of the target device.
        -   `action_params`: `{ "config": { "key1": "value1", "brightness": 80 } }` (The content of `config` is specific to the device type).
    -   `log_generic_event`:
        -   Purpose: Records a generic event/log message via the `operationService`. This is useful for creating scheduled reminders or markers in the system logs.
        -   `action_params`:
            -   `log_message` (string, required): The primary message for the log.
            -   `log_level` (string, optional, defaults to 'INFO'): Severity/type of log (e.g., 'INFO', 'WARN', 'ERROR').
            -   `details` (object, optional): Additional structured data for the log.
        -   Example: `{ "log_message": "Nightly backup process initiated.", "log_level": "INFO", "details": { "target_db": "main_cluster" } }`
    -   `send_notification`:
        -   Purpose: Schedules a notification to be processed by the `NotificationService`. Initially, this means the notification details will be logged, and an operation recorded. Future enhancements could involve sending actual emails, SMS, etc.
        -   `action_params`:
            -   `subject` (string, required): Subject line for the notification.
            -   `body` (string, required): Main content/body of the notification.
            -   `recipient_type` (string, required): Category or type of recipient (e.g., "system_log", "admin_dashboard", "email_user_group_X", "specific_user_id"). This guides how the notification might be processed or routed.
            -   `recipient_target` (string, required): Specific target within the `recipient_type` (e.g., for "system_log", this could be "maintenance_alerts"; for "email_user_group_X", it could be "marketing_subscribers"; for "specific_user_id", it could be the user's actual ID).
            -   `type` (string, optional, defaults to 'info'): Type/severity of the notification (e.g., 'info', 'warning', 'error', 'alert').
        -   Example:
            ```json
            {
              "subject": "Low Stock Alert: Product XYZ",
              "body": "Product XYZ stock is below the threshold. Current stock: 5 units.",
              "recipient_type": "inventory_alert_channel",
              "recipient_target": "warehouse_managers_group",
              "type": "warning"
            }
            ```

#### `PUT /api/scheduled-operations/:id`
Updates an existing scheduled operation.
-   **Authentication:** Required (e.g., admin, editor roles).
-   **Path Parameters:**
    -   `id` (integer, required): The ID of the scheduled operation to update.
-   **Request Body:** An object containing fields to update (e.g., `action_params`, `cron_expression`, `execute_at`, `is_enabled`, `description`).
-   **Success Response (200 OK):** The updated scheduled operation object.
-   **Error Responses:**
    -   `400 Bad Request`: Invalid input data.
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have permission.
    -   `404 Not Found`: Scheduled operation with the given `id` not found.
    -   `409 Conflict`: Returned if the updated schedule's execution time(s) directly clash with another existing enabled schedule for the same device (excluding itself). The system checks for exact time matches, considering the next execution for one-time tasks and the next few occurrences (e.g., next 5 or within a 48-hour window) for cron-based schedules. (This does not yet account for action durations).
    -   `500 Internal Server Error`: Server-side error.

#### Manual Testing Guidelines for Schedule Conflict Validation
(Content as previously verified)
...

#### Testing Scheduled Notifications
(Content as previously verified)
...

### System Administration API Endpoints
(Content as previously verified, including GET DLQ and DLQ management POST/DELETE routes)
...

#### Testing DLQ Message Viewing and Management (`/api/system/dlq/critical-actions/*`)
(Content as previously verified, including Test Case 5 for DLQ Growth Alerting)
...

## WebSocket Real-time Notifications

This application provides real-time updates and notifications via WebSockets.

### Connecting and Authentication

-   **Endpoint:** The WebSocket server runs on the same port as the HTTP server (e.g., `ws://localhost:4000` or `wss://yourdomain.com` if using HTTPS/WSS).
-   **Authentication:** To connect to the WebSocket server, clients **must** provide a valid JSON Web Token (JWT) obtained from the `/api/auth/login` endpoint. The token should be appended as a query parameter named `token` to the WebSocket connection URL.
    -   Example: `ws://localhost:4000?token=YOUR_JWT_HERE`
-   **Connection Handling:**
    -   If the token is missing, invalid, or expired, the server will send an error message (JSON with `type: 'error', event: 'authentication_failed'`) and then terminate the WebSocket connection.
    -   Upon successful authentication, the server will send a confirmation message (e.g., `{"type":"info","event":"connection_success","message":"WebSocket connection established and authenticated."}`).
    -   The authenticated user's details (ID, username, role) are associated with their WebSocket connection on the server-side, enabling targeted messaging.

### Subscribing to Specific Event Streams (Rooms)

Clients can send `subscribe` messages to the WebSocket server to receive targeted updates for specific event streams or "rooms."

-   **Message Format (Client-to-Server):**
    ```json
    {
      "type": "subscribe",
      "room": "room_name_here"
    }
    ```
    ```json
    {
      "type": "unsubscribe",
      "room": "room_name_here"
    }
    ```
-   **Server Response:**
    -   On successful subscription: `{"type": "subscribed", "room": "room_name_here", "message": "..."}`
    -   On successful unsubscription: `{"type": "unsubscribed", "room": "room_name_here", "message": "..."}`
    -   On error (e.g., invalid room name): `{"type": "subscription_error", "room": "room_name_here", "message": "..."}`

-   **Basic Keep-Alive:** Clients can send `{"type": "ping"}` and the server will respond with `{"type": "pong", "timestamp": <Date.now()>}`.

#### Available Room Naming Conventions / Patterns

-   **`device_events:<device_db_id>`**:
    -   **Description:** Subscribe to events specific to a single device instance, using its database ID (e.g., `device_events:123`). This includes creation, detailed updates, status changes, configuration changes, and deletion events for that particular device.
    -   **Event Types Published:** `device_created`, `device_details_updated`, `device_status_updated`, `device_config_updated`, `device_deleted`. (Payloads are similar to general broadcast events but are only sent to subscribers of this specific device's room).
-   **`sensor_latest:<sensor_id>`**:
    -   **Description:** Subscribe to this room to receive real-time updates whenever the latest cached value for a specific sensor is updated. `<sensor_id>` corresponds to the identifiers used in MQTT topics and Redis keys.
    -   **Examples:** `sensor_latest:temhum1`, `sensor_latest:calidad_agua`, `sensor_latest:power:PS001` (for a power sensor with hardware ID `PS001`).
    -   **Event Type Published:** `sensor_reading_updated`
-   **`operations_log:new`**:
    -   **Description:** Subscribe to receive a notification whenever any new operation is recorded in the `operations_log` table.
    -   **Event Type Published:** `new_operation_log` (Payload is the full operation log entry).

*(More room patterns may be added as the system evolves.)*

### Server-to-Client Event Types

Clients can expect to receive messages with different `type` fields, indicating the nature of the event. These can be general broadcasts or targeted to specific rooms they are subscribed to.

#### General Broadcast Events
These events are typically broadcast to all authenticated and connected WebSocket clients.

-   **`device_created`**:
    -   Description: Sent when a new device is successfully registered in the system.
    -   Payload: The full device object of the newly created device.
-   **`device_updated`**:
    -   Description: Sent when a device's general information (name, type, description, config, etc., excluding just status) is updated.
    -   Payload: The full updated device object.
-   **`device_status_updated`**:
    -   Description: Sent when a device's status is specifically updated (e.g., 'online' to 'offline', 'on' to 'off'). This is a general broadcast.
    -   Payload: The full device object with the new status.
-   **`device_deleted`**:
    -   Description: Sent when a device is deleted from the system.
    -   Payload: An object containing the `id` and `name` of the deleted device.
-   **`rule_triggered`**:
    -   Description: Sent when a rule's conditions are met and its actions are about to be executed.
    -   Payload: `{ rule_id: <id>, rule_name: "<name>", timestamp: "<ISO_date>", actions_attempted: [...] }`
-   **`schedule_action_outcome`**:
    -   Description: Sent by the Scheduler Engine after a scheduled task has been processed (i.e., its action has been queued or failed to queue).
    -   Payload: `{ schedule_id: <id>, device_id: <id>, action_name: "<name>", outcome_status: "SUCCESS" | "FAILURE", outcome_details: {...}, processed_at: "<ISO_date>" }`
-   **`queued_action_executed`**:
    -   Description: Sent by the Critical Action Worker when an action from the queue has been successfully executed.
    -   Payload: `{ messageId: "<stream_msg_id>", action: {...}, origin: {...}, attempts: <num>, executedAt: "<ISO_date>", actor: "<actor>" }`
-   **`queued_action_dlq_moved`**:
    -   Description: Sent by the Critical Action Worker when an action fails all retries and is moved to the Dead-Letter Queue (DLQ).
    -   Payload: `{ originalMessageId: "<stream_msg_id>", action: {...}, ..., dlqMessageId: "<dlq_msg_id>" }`
-   **`queued_action_dlq_error`**:
    -   Description: Sent by the Critical Action Worker if it fails to move a message to the DLQ.
    -   Payload: `{ originalMessageId: "<stream_msg_id>", ..., dlqPublishError: "<error_message>" }`

#### Targeted Admin Events

-   **Event Type:** `admin_device_status_alert`
    -   **Description:** Sent *only* to authenticated clients with the 'admin' role when any device's status is updated by any means (e.g., direct API call, rule action, scheduled task). This provides real-time, admin-specific notification of device status changes for administrative monitoring and immediate awareness.
    -   **Payload Example:**
        ```json
        {
          "type": "admin_device_status_alert",
          "message": "Device 'Living Room Lamp' (ID: 123) status updated to 'on'.",
          "data": {
            "id": 123,
            "name": "Living Room Lamp",
            "device_id": "HW_ID_LAMP_LR",
            "status": "on",
            "updated_at": "2023-10-27T12:35:00.123Z"
          }
        }
        ```

#### Targeted User Events (Device Owners)

-   **Event Type:** `owned_device_update`
    -   **Description:** Sent *only* to the authenticated WebSocket client whose user ID matches the `owner_user_id` of a device when that specific device undergoes significant changes. This keeps device owners informed about their registered devices.
    -   **Payload Fields:**
        -   `type: "owned_device_update"`
        -   `sub_type: "<change_type>"` (string, e.g., "status_change", "config_change", "details_change", "device_deleted") - Indicates what kind of update occurred.
        -   `message: "<descriptive_message_string>"` (string) - A human-readable message about the update.
        -   `data: Object` - The updated device object (or details of the deleted device).
    -   **Payload Example (`sub_type: 'status_change'`):**
        ```json
        {
          "type": "owned_device_update",
          "sub_type": "status_change",
          "message": "Status of your device 'Living Room Lamp' (ID: 123) changed to 'on'.",
          "data": {
            "id": 123,
            "name": "Living Room Lamp",
            "device_id": "HW_ID_LAMP_LR",
            "status": "on",
            "updated_at": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```
    -   **Payload Example (`sub_type: 'config_change'`):**
        ```json
        {
          "type": "owned_device_update",
          "sub_type": "config_change",
          "message": "Configuration of your device 'Smart Thermostat' (ID: 124) has been updated.",
          "data": {
            "id": 124,
            "name": "Smart Thermostat",
            "device_id": "HW_ID_THERM_01",
            "config": {"target_temp": 22, "mode": "auto"},
            "updated_at": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```
    -   **Payload Example (`sub_type: 'details_change'`):**
        ```json
        {
          "type": "owned_device_update",
          "sub_type": "details_change",
          "message": "Details of your device 'Garden Sprinkler' (ID: 125) have been updated (e.g., name, description, room, or ownership).",
          "data": { /* Full updated device object */ }
        }
        ```
    -   **Payload Example (`sub_type: 'device_deleted'`):**
        ```json
        {
          "type": "owned_device_update",
          "sub_type": "device_deleted",
          "message": "Your device 'Old Porch Light' (ID: 456) has been deleted.",
          "data": {
            "id": 456,
            "name": "Old Porch Light"
          }
        }
        ```

#### Room-Specific Events

These events are sent to clients who have subscribed to specific rooms.

-   **Event Type:** `new_operation_log`
    -   **Room:** `operations_log:new`
    -   **Description:** Sent when a new entry is added to the `operations_log` table.
    -   **Payload:** The full operation log object as stored in the database.

-   **Event Type:** `sensor_reading_updated`
    -   **Room Pattern:** `sensor_latest:<sensor_id>` (e.g., `sensor_latest:temhum1`)
    -   **Description:** Published to a specific `sensor_latest:<sensor_id>` room when new data for that sensor is processed and its latest values are updated in the cache.
    -   **Payload Fields:**
        -   `type: "sensor_reading_updated"`
        -   `sensor_id: "<sensor_id>"` (The ID of the sensor that was updated, e.g., "temhum1", "calidad_agua", "power:PS001")
        -   `data: Object` (The complete hash of latest values for that sensor, as stored in Redis. Timestamps like `last_updated` are typically ISO8601 strings).
    -   **Payload Example (for `sensor_latest:temhum1`):**
        ```json
        {
          "type": "sensor_reading_updated",
          "sensor_id": "temhum1",
          "data": {
            "temperatura": 25.5,
            "humedad": 60.1,
            "heatindex": 26.0,
            "dewpoint": 18.2,
            "rssi": -65,
            "last_updated": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```
    -   **Payload Example (for `sensor_latest:calidad_agua`):**
        ```json
        {
          "type": "sensor_reading_updated",
          "sensor_id": "calidad_agua",
          "data": {
            "ph": 7.1,
            "ec": 1500,
            "ppm": 750,
            "temperatura_agua": 22.5,
            "last_updated_multiparam": "YYYY-MM-DDTHH:MM:SS.mmmZ",
            "last_updated_temp_agua": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```
    -   **Payload Example (for `sensor_latest:power:PS001`):**
        ```json
        {
          "type": "sensor_reading_updated",
          "sensor_id": "power:PS001",
          "data": {
            "voltage": 220.1,
            "current": 0.5,
            "power": 110.05,
            "sensor_timestamp": "YYYY-MM-DDTHH:MM:SS.mmmZ", // Optional, from sensor
            "last_updated": "YYYY-MM-DDTHH:MM:SS.mmmZ"    // Timestamp of server receipt/processing
          }
        }
        ```

*(More event types and room patterns may be added as the system evolves.)*

### Manual Testing Guidelines for WebSockets

#### Testing Targeted Admin Notifications for Device Status Updates
(Content as previously verified)
...

#### Testing Targeted Notifications to Device Owners (`owned_device_update`)

This test verifies that the `owned_device_update` WebSocket event is sent specifically to the owner of a device when that device's status, configuration, or details change, or when it's deleted.

**Prerequisites:**
-   At least two registered users:
    -   User Owner (e.g., `owner_user`, with ID `user_id_owner`)
    -   User NonOwner (e.g., `non_owner_user`, with ID `user_id_non_owner`)
    -   (Optional) User Admin (e.g., `admin_user`, with ID `user_id_admin`, having 'admin' role).
-   Valid JWTs for all test users.
-   A WebSocket client tool.

**Test Steps:**

1.  **Create/Assign Device Ownership:**
    -   As an admin or editor, create a new device or update an existing one (e.g., `device_X_db_id`) using `POST /api/devices` or `PUT /api/devices/<device_X_db_id>`.
    -   In the request body, set `owner_user_id: <user_id_owner>`.
    -   Verify the device is created/updated with the correct `owner_user_id`. Let's assume `device_X_db_id` is 123 for this test.

2.  **Connect WebSocket Clients:**
    -   **Client 1 (Owner):** Connect to `ws://localhost:4000?token=OWNER_USER_JWT`. Verify successful authentication.
    -   **Client 2 (Non-Owner):** Connect to `ws://localhost:4000?token=NON_OWNER_USER_JWT`. Verify successful authentication.
    -   **Client 3 (Admin, Optional):** Connect to `ws://localhost:4000?token=ADMIN_USER_JWT`. Verify successful authentication.

3.  **Test Case A: Device Status Update**
    -   **Trigger Action:** As an admin/editor, update the status of `device_X_db_id` (e.g., 123) using `PATCH /api/devices/123/status` to `{"status": "active"}`.
    -   **Observe WebSockets:**
        -   **Client 1 (Owner):** Should receive:
            1.  The general `device_status_updated` event.
            2.  The targeted `owned_device_update` event with `sub_type: 'status_change'`, a relevant message, and device data.
        -   **Client 2 (Non-Owner):** Should receive *only* the general `device_status_updated` event.
        -   **Client 3 (Admin):** Should receive general `device_status_updated` AND `admin_device_status_alert`.

4.  **Test Case B: Device Configuration Update**
    -   **Trigger Action:** As an admin/editor, update the configuration of `device_X_db_id` using `PUT /api/devices/123` with a body like `{"config": {"new_setting": "value"}}`.
    -   **Observe WebSockets:**
        -   **Client 1 (Owner):** Should receive general `device_updated` AND targeted `owned_device_update` with `sub_type: 'config_change'`.
        -   **Client 2 (Non-Owner):** Should receive *only* general `device_updated`.
        -   **Client 3 (Admin):** Should receive general `device_updated`.

5.  **Test Case C: Device Detail Update (e.g., Name Change)**
    -   **Trigger Action:** As an admin/editor, update the name of `device_X_db_id` using `PUT /api/devices/123` with a body like `{"name": "Device New Name"}`.
    -   **Observe WebSockets:**
        -   **Client 1 (Owner):** Should receive general `device_updated` AND targeted `owned_device_update` with `sub_type: 'details_change'`.
        -   **Client 2 (Non-Owner):** Should receive *only* general `device_updated`.
        -   **Client 3 (Admin):** Should receive general `device_updated`.

6.  **Test Case D: Change of Ownership**
    -   **Trigger Action:** As an admin/editor, update `device_X_db_id` to set `owner_user_id: <user_id_non_owner>`.
    -   **Observe WebSockets:**
        -   **Client 1 (Previous Owner):** Should receive general `device_updated` AND targeted `owned_device_update` with `sub_type: 'details_change'` (as their ownership status changed).
        -   **Client 2 (New Owner):** Should receive general `device_updated` AND targeted `owned_device_update` with `sub_type: 'details_change'`.
    -   **Follow-up Test:** Perform another status update on `device_X_db_id`. Now Client 2 (New Owner) should get the `owned_device_update` for status, and Client 1 (Previous Owner) should not.

7.  **Test Case E: Remove Ownership (`owner_user_id: null`)**
    -   **Trigger Action:** As an admin/editor, update `device_X_db_id` to set `owner_user_id: null`. (Assume Client 2 was the owner).
    -   **Observe WebSockets:**
        -   **Client 2 (Previous Owner):** Should receive general `device_updated` AND targeted `owned_device_update` with `sub_type: 'details_change'`.
    -   **Follow-up Test:** Perform another status update. No user (other than admins for their `admin_device_status_alert`) should receive an `owned_device_update` for this device.

8.  **Test Case F: Device Deletion**
    -   First, re-assign ownership to `user_id_owner` for `device_X_db_id` for a clean test.
    -   **Trigger Action:** As an admin, delete `device_X_db_id` using `DELETE /api/devices/123`.
    -   **Observe WebSockets:**
        -   **Client 1 (Owner):** Should receive general `device_deleted` AND targeted `owned_device_update` with `sub_type: 'device_deleted'`.
        -   **Client 2 (Non-Owner):** Should receive *only* general `device_deleted`.
        -   **Client 3 (Admin):** Should receive general `device_deleted`.

9.  **Disconnect Clients:** Close all WebSocket connections.

#### Testing Subscriptions to Latest Sensor Data Rooms (`sensor_latest:<sensor_id>`)

This test verifies that clients can subscribe to rooms for specific sensor updates and receive `sensor_reading_updated` events when new data for those sensors is processed by `mqttService.js` and cached in Redis.

**Prerequisites:**
-   The backend server is running, including the WebSocket server and MQTT client.
-   You have a WebSocket client tool capable of sending JSON messages (for subscribe/unsubscribe) and receiving messages.
-   You have an MQTT client tool to publish test messages for sensors.
-   Ensure JWT authentication is set up for WebSocket connections.

**Test Steps:**

1.  **Connect WebSocket Client:**
    -   Establish an authenticated WebSocket connection (e.g., `ws://localhost:4000?token=YOUR_JWT`).
    -   Verify successful connection and authentication.

2.  **Subscribe to a Specific Sensor Room (e.g., `temhum1`):**
    -   Send a WebSocket message from the client:
        ```json
        {
          "type": "subscribe",
          "room": "sensor_latest:temhum1"
        }
        ```
    -   **Verify Client Receives Confirmation:** The client should receive:
        ```json
        {
          "type": "subscribed",
          "room": "sensor_latest:temhum1",
          "message": "Successfully subscribed to room 'sensor_latest:temhum1'."
        }
        ```
    -   **Verify Server Log (Optional):** Check backend logs for `WebSocket: User <username> subscribed to room 'sensor_latest:temhum1'. Room size: ...`

3.  **Subscribe to Another Sensor Room (e.g., `calidad_agua`):**
    -   Send another WebSocket message from the same client:
        ```json
        {
          "type": "subscribe",
          "room": "sensor_latest:calidad_agua"
        }
        ```
    -   Verify client receives confirmation for this new subscription.

4.  **Publish MQTT Data for `temhum1`:**
    -   Using an MQTT client, publish to topic `Invernadero/TemHum1/data`:
        ```json
        {"temperatura": 25.5, "humedad": 60, "heatindex": 26, "dewpoint": 18, "rssi": -55, "stats": {"tmin": 0, "tmax":0, "tavg":0, "hmin":0, "hmax":0, "havg":0, "total":0, "errors":0}, "boot":0, "mem":0}
        ```
    -   **Verify WebSocket Client (for `temhum1`):** The connected WebSocket client should receive a message like:
        ```json
        {
          "type": "sensor_reading_updated",
          "sensor_id": "temhum1",
          "data": {
            "temperatura": "25.5",
            "humedad": "60",
            "heatindex": "26",
            "dewpoint": "18",
            "rssi": "-55",
            "last_updated": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```
    -   (The client should NOT receive this message if it wasn't subscribed to `sensor_latest:temhum1`).

5.  **Publish MQTT Data for `calidad_agua`:**
    -   Publish to topic `Invernadero/Agua/data`:
        ```json
        {"ph": 7.2, "ec": 1550, "ppm": 775, "temp": 22.3}
        ```
    -   **Verify WebSocket Client (for `calidad_agua`):** The client (if subscribed to `sensor_latest:calidad_agua`) should receive:
        ```json
        {
          "type": "sensor_reading_updated",
          "sensor_id": "calidad_agua",
          "data": {
            "ph": "7.2",
            "ec": "1550",
            "ppm": "775",
            "temperatura_agua": "22.3",
            "last_updated_multiparam": "YYYY-MM-DDTHH:MM:SS.mmmZ"
          }
        }
        ```

6.  **Publish MQTT Data for an Unsubscribed Sensor (e.g., `power:PS001`):**
    -   Publish to topic `Invernadero/PS001/data` (assuming client is not subscribed to `sensor_latest:power:PS001` and a device with hardware ID `PS001` and type `power_sensor` exists and is configured to monitor another device):
        ```json
        {"voltage": 220.0, "current": 1.5, "power": 330.0, "sensor_timestamp": "YYYY-MM-DDTHH:MM:SS.mmmZ"}
        ```
    -   **Verify WebSocket Client:** The client should NOT receive any `sensor_reading_updated` message for `power:PS001`.

7.  **Unsubscribe from a Room (e.g., `sensor_latest:temhum1`):**
    -   Send a WebSocket message from the client:
        ```json
        {
          "type": "unsubscribe",
          "room": "sensor_latest:temhum1"
        }
        ```
    -   **Verify Client Receives Confirmation:**
        ```json
        {
          "type": "unsubscribed",
          "room": "sensor_latest:temhum1",
          "message": "Successfully unsubscribed from room 'sensor_latest:temhum1'."
        }
        ```
8.  **Publish MQTT Data for `temhum1` Again:**
    -   Publish new data to `Invernadero/TemHum1/data`.
    -   **Verify WebSocket Client:** The client should NO LONGER receive `sensor_reading_updated` messages for `temhum1`. It should still receive them for `calidad_agua` if still subscribed.

9.  **Test Disconnection:**
    -   Disconnect the WebSocket client.
    -   Publish more MQTT data for a previously subscribed room (e.g., `calidad_agua`).
    -   Reconnect the client (re-authenticate, re-subscribe). It should not receive the messages sent while it was disconnected (unless a "catch-up" mechanism is built, which is not part of this feature).
    -   Verify server logs show client removal from rooms on disconnect.

## Device Management
(Content as previously verified)
...

## Rules Engine
(Content as previously verified)
...

### Manual Testing Guidelines for Rules
(Content as previously verified)
...

## Database Schema Overview
(Content as previously verified)
...

## Background Services and Workers
(Content as previously verified)
...

## Environment Variables
(Content as previously verified)
...
```
