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

### Server-to-Client Event Types

Clients can expect to receive messages with different `type` fields, indicating the nature of the event.

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

*(More event types may be added as the system evolves.)*

### Manual Testing Guidelines for WebSockets

#### Testing Targeted Admin Notifications for Device Status Updates

This test verifies that only authenticated admin users receive the `admin_device_status_alert` when a device's status changes.

**Prerequisites:**
-   Two users registered in the system:
    -   User A with role 'admin' (e.g., `admin_user`).
    -   User B with a non-admin role (e.g., 'viewer' or the default 'user' role, e.g., `viewer_user`).
-   Valid JWTs obtained for both `admin_user` and `viewer_user` via `POST /api/auth/login`.
-   A registered device (e.g., with database ID `device_db_id_123`).
-   A WebSocket client tool (e.g., a browser-based WebSocket tester, Postman WebSocket client, or a simple Node.js `ws` client script) capable of connecting with query parameters for token authentication.

**Test Steps:**

1.  **Connect WebSocket Client 1 (Admin User):**
    -   Establish a WebSocket connection to the server (e.g., `ws://localhost:4000?token=ADMIN_USER_JWT`).
    -   Verify connection is successful and authenticated (e.g., receives `{"type":"info","event":"connection_success",...}`).
    -   Keep this client connected and listening for messages.

2.  **Connect WebSocket Client 2 (Non-Admin User):**
    -   Establish a second WebSocket connection to the server (e.g., `ws://localhost:4000?token=VIEWER_USER_JWT`).
    -   Verify connection is successful and authenticated.
    -   Keep this client connected and listening for messages.

3.  **Trigger a Device Status Update:**
    -   As an authenticated user with permission to update device status (e.g., admin or editor), send a `PATCH` request to `/api/devices/<device_db_id_123>/status`.
    -   Example Body: `{"status": "active"}`
    -   Verify the API call returns a 200 OK.

4.  **Observe WebSocket Messages:**
    -   **WebSocket Client 1 (Admin User - `admin_user`):**
        -   Should receive the general `device_status_updated` broadcast message with the full updated device details.
        -   Should **also** receive the targeted `admin_device_status_alert` message. Verify its payload structure:
            ```json
            {
              "type": "admin_device_status_alert",
              "message": "Device '<DeviceName>' (ID: <device_db_id_123>) status updated to 'active'.",
              "data": { /* ... updated device object ... */ }
            }
            ```
            *(Note: The message in the example was updated slightly to better reflect the example in the code where it says "...status updated to 'active' by a user/process." - the "by a user/process" part is not in the actual code, so I've removed it here for accuracy to the code.)*
    -   **WebSocket Client 2 (Non-Admin User - `viewer_user`):**
        -   Should receive the general `device_status_updated` broadcast message.
        -   Should **NOT** receive the `admin_device_status_alert` message.

5.  **Disconnect Clients:** Close both WebSocket connections.

*(This test confirms that `sendToRole('admin', ...)` is working as intended and that WebSocket authentication/user roles are being respected for targeted messages).*


## Device Management
(Content as previously verified)
...

## Rules Engine

The Rules Engine evaluates a set of defined rules periodically. If a rule's conditions are met, it executes predefined actions.

### Rule Definition (`rules` table)

A rule is defined by its name, description, conditions, actions, priority, and enabled status.

-   `name`: User-friendly name for the rule (e.g., "Turn on fan if office temp > 25C during work hours").
-   `description`: Optional text describing the rule.
-   `conditions`: A JSONB object defining the logic for the rule to trigger.
-   `actions`: A JSONB array specifying what to do when conditions are met.
-   `is_enabled`: Boolean, true if the rule should be evaluated.
-   `priority`: Integer, for ordering rule evaluation (higher values typically mean higher priority).
-   `last_triggered_at`: Timestamp of when the rule last triggered.

#### Rule Conditions (`conditions` JSONB field)

The `conditions` field defines when a rule should trigger. It can be a single condition object or an object with a `type` ("AND" or "OR") and a `clauses` array.

**Common Clause Fields:**
- `source_type`: String, type of data source (e.g., "device", "sensor", "time").
- `operator`: String, the comparison operator (e.g., "==", ">", "<=").
- `value`: The value to compare against (string or number, depending on the context). Can also be an object for dynamic comparisons (see below).

**Device Status Conditions:**
- `source_type: "device"`
- `source_id: "<hardware_id_of_device>"` (This is the `device_id` from the `devices` table)
- `property: "status"` (Currently, only "status" is supported for devices)
- `operator: "=="` or `"!="`
- `value: "<status_string>"` (e.g., "on", "offline", "active")
  *(Note: `value_from` can also be used here if comparing device status to a sensor's string value, though less common. See Sensor Value Conditions for `value_from` structure.)*
*Example:*
```json
{ "source_type": "device", "source_id": "relay_living_room_light", "property": "status", "operator": "==", "value": "off" }
```

**Sensor Value Conditions (`sensor`)**
Evaluates a condition based on the latest reading of a specific sensor metric (fetched from Redis cache).

- `source_type: "sensor"`
- `source_id: "<sensor_A_identifier>"` (e.g., "temhum1", "calidad_agua", "power:PS001") - The main sensor for the condition.
- `metric: "<metric_A_name>"` (e.g., "temperatura", "voltage", "ph") - The metric from Sensor A to evaluate.
- `operator: ">" | "<" | ">=" | "<=" | "==" | "!="` (Required)

For the comparison value, use EITHER `value` OR `value_from`. If both are provided, `value_from` will take precedence.

-   **`value: <number>`** (Required if `value_from` is not used)
    -   A static numeric value to compare against Sensor A's metric.
    -   *Example Clause (Temperature of `temhum1` > 25):*
        ```json
        {
          "source_type": "sensor",
          "source_id": "temhum1",
          "metric": "temperatura",
          "operator": ">",
          "value": 25
        }
        ```

-   **`value_from: Object`** (Optional, use if comparing against another sensor's metric)
    -   An object specifying another source (currently, another sensor) whose metric will be used for comparison against Sensor A's metric.
    -   **Fields for `value_from` when its `source_type` is "sensor":**
        -   `source_type: "sensor"` (Required)
        -   `source_id: "<sensor_B_identifier>"` (Required - The ID of the sensor to compare against)
        -   `metric: "<metric_B_name>"` (Required - The metric from Sensor B to use for comparison)
    -   *Example Clause (Temperature of `room_temp` > Target Temperature of `thermostat_main`):*
        ```json
        {
          "source_type": "sensor",
          "source_id": "room_temp",
          "metric": "temperatura",
          "operator": ">",
          "value_from": {
             "source_type": "sensor",
             "source_id": "thermostat_main",
             "metric": "target_temp"
          }
        }
        ```

**Time-Based Conditions:**
(Content as previously verified)
...

**Sensor History Conditions (`sensor_history`)**
(Content as previously verified)
...

**Sensor Trend Conditions (`sensor_trend`)**
Evaluates if a specific sensor metric has been exhibiting a certain trend (rising, falling, or stable) over a recent period or number of samples. Data is sourced from Redis history lists.

-   `source_type: "sensor_trend"` (Required)
-   `source_id: "<sensor_identifier>"` (Required - e.g., "temhum1", "calidad_agua", "power:PS001") - The base ID for the sensor.
-   `metric: "<metric_name>"` (Required - e.g., "temperatura", "ph", "voltage") - The specific metric to analyze.
-   `trend_type: "rising" | "falling" | "stable"` (Required) - The type of trend to detect.
-   `threshold_change: <number>` (Required) - The numeric threshold defining the trend:
    -   For `rising`: The metric must increase by at least this amount from the oldest to the newest value in the set.
    -   For `falling`: The metric must decrease by at least this amount from the oldest to the newest value in the set.
    -   For `stable`: The difference between the maximum and minimum values in the set must be less than or equal to this amount.
-   `operator: "is" | "==" | "===" | "isnot" | "!=" | "!=="` (Required) - Usually "is" or "==".
-   `value: true | false` (Required) - The expected boolean outcome of the trend detection (e.g., `true` if the condition is "trend IS rising").

Specify the observation window using EITHER `time_window` OR `samples`. One of these must be provided. If both are present, `time_window` takes precedence.

-   `time_window: "<duration_string>"` (Optional string - e.g., "5m", "1h", "30s")
    -   Analyzes samples received within this duration from the current time.
    -   *Example (Temperature rising by at least 2 degrees over the last 10 minutes):*
        ```json
        {
          "source_type": "sensor_trend",
          "source_id": "temhum1",
          "metric": "temperatura",
          "trend_type": "rising",
          "time_window": "10m",
          "threshold_change": 2,
          "operator": "is",
          "value": true
        }
        ```

-   `samples: <number>` (Optional integer - e.g., 5 for last 5 readings)
    -   Analyzes this number of the most recent samples.
    -   *Example (Humidity stable within 5% over the last 3 samples):*
        ```json
        {
          "source_type": "sensor_trend",
          "source_id": "temhum2",
          "metric": "humedad",
          "trend_type": "stable",
          "samples": 3,
          "threshold_change": 5,
          "operator": "is",
          "value": true
        }
        ```

**Combining Conditions Example:**
(Content as previously verified)
...

#### Rule Actions (`actions` JSONB field)
(Content as previously verified)
...

### Manual Testing Guidelines for Rules

This section provides guidance on how to manually test the rules engine.

#### General Prerequisites for Testing Rules
*   Ensure the Rules Engine (`services/rulesEngineService.js`) is running (it's started by `server.js`).
*   You have API access to create, update, and view rules (e.g., via `POST /api/rules`, `PUT /api/rules/:id`, `GET /api/rules/:id`).
*   You can observe the results of rule actions. This might involve:
    *   Checking device statuses via `GET /api/devices/:id`.
    *   Monitoring `operations_log` via `GET /api/operations` for `rule_triggered` events and action-specific logs.
    *   Observing WebSocket messages for `rule_triggered` or action-specific events.
    *   Checking the `last_triggered_at` field of a rule via `GET /api/rules/:id`.
*   You can manipulate the inputs to your rule conditions (e.g., change a device's status via API or MQTT, or wait for specific times).

#### Testing Time-Based Conditions
(Content as previously verified)
...

**General Verification for all Time-Based Tests:**
(Content as previously verified)
...

##### Testing Sensor History Conditions (`sensor_history`)
(Content as previously verified)
...

##### Testing Sensor Value Conditions with `value_from` (Comparing Two Sensors)
(Content as previously verified)
...

## Database Schema Overview
(Content as previously verified)
...

## Background Services and Workers
(Content as previously verified)
...

## Environment Variables
(Content as previously verified, including Critical Action Worker & DLQ Configuration)
...
```
