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

These tests verify conditions that compare a metric from one sensor against a metric from another sensor using the `value_from` field.

**Prerequisites:**
- Ensure `mqttService.js` is correctly configured to update latest sensor values in Redis Hashes (e.g., `sensor_latest:sensorA_id`, `sensor_latest:sensorB_id`).
- Have a way to publish MQTT messages for at least two different sensor `source_id`s and their respective metrics (e.g., using an MQTT client tool like MQTT Explorer or `mosquitto_pub`).

**Test Case C1: Sensor A temperature > Sensor B target_temperature**
1.  **Publish Sensor Data for Sensor A (`room_temp_sensor`):**
    -   Topic: `Invernadero/room_temp_sensor/data`
    -   Payload: `{"temperatura": 25}`
    -   Verify (optional): Check Redis `HGETALL sensor_latest:room_temp_sensor` shows `temperatura: "25"`.
2.  **Publish Sensor Data for Sensor B (`thermostat_living`):**
    -   Topic: `Invernadero/thermostat_living/data`
    -   Payload: `{"target_temp": 22}`
    -   Verify (optional): Check Redis `HGETALL sensor_latest:thermostat_living` shows `target_temp: "22"`.
3.  **Rule Definition:**
    -   Create a rule via `POST /api/rules`:
        ```json
        {
          "name": "Room Temp Higher Than Thermostat Target",
          "conditions": {
            "source_type": "sensor",
            "source_id": "room_temp_sensor",
            "metric": "temperatura",
            "operator": ">",
            "value_from": {
              "source_type": "sensor",
              "source_id": "thermostat_living",
              "metric": "target_temp"
            }
          },
          "actions": [
            { "service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "cooler_hw_id", "params": {"status": "on"} }
          ]
        }
        ```
4.  **Execution & Verification (Rule Triggers):**
    -   Wait for the Rules Engine to evaluate (e.g., up to 30 seconds or its cycle time).
    -   Verify: The "cooler_hw_id" device should turn ON (since 25 > 22).
    -   Check `operations_log` for rule trigger and action.
5.  **Publish New Sensor Data for Sensor A (to make condition false):**
    -   Topic: `Invernadero/room_temp_sensor/data`
    -   Payload: `{"temperatura": 20}`
6.  **Execution & Verification (Rule Does Not Trigger for ON, or triggers separate OFF rule):**
    -   Wait for Rules Engine evaluation.
    -   Verify: The "cooler_hw_id" should NOT be turned ON by *this* rule. (If it was already on, it would remain on unless another rule turns it off).

**Test Case C2: Sensor A pH == Sensor B reference_pH (using different operator)**
1.  **Publish Sensor Data for Sensor A (`tank1_ph`):**
    - Topic: `Invernadero/tank1_ph/data` (assuming `source_id: "tank1_ph"`)
    - Payload: `{"ph_value": 6.5}` (assuming metric is "ph_value")
2.  **Publish Sensor Data for Sensor B (`ref_solution_ph`):**
    - Topic: `Invernadero/ref_solution_ph/data` (assuming `source_id: "ref_solution_ph"`)
    - Payload: `{"ph_value": 6.5}`
3.  **Rule Definition (pH values are equal):**
    ```json
    {
      "name": "Tank pH Matches Reference",
      "conditions": {
        "source_type": "sensor", "source_id": "tank1_ph", "metric": "ph_value", "operator": "==",
        "value_from": { "source_type": "sensor", "source_id": "ref_solution_ph", "metric": "ph_value" }
      },
      "actions": [ { "service": "operationService", "method": "recordOperation", "params": {"serviceName": "RulesEngine", "action": "pHMatchLog", "status": "INFO", "details": {"message": "Tank 1 pH matches reference solution."}}} ]
    }
    ```
4.  **Execution & Verification:** Rule should trigger, and a "pHMatchLog" operation should be recorded.
5.  **Publish New Sensor Data for Sensor A (`tank1_ph`):** Payload: `{"ph_value": 6.8}`
6.  **Execution & Verification:** Rule should NOT trigger for this condition (6.8 != 6.5).

**Test Case C3: Data for `value_from` sensor is missing/stale**
1.  **Publish Sensor Data for Sensor A (`room_temp_sensor`):**
    - Topic: `Invernadero/room_temp_sensor/data`
    - Payload: `{"temperatura": 25}`
2.  **Setup for Missing Comparison Data:** Ensure no recent data exists in Redis for `sensor_latest:thermostat_nonexistent` or that its `target_temp` metric is missing. (e.g., by not publishing to `Invernadero/thermostat_nonexistent/data` or by deleting the Redis key `sensor_latest:thermostat_nonexistent`).
3.  **Rule Definition (Compare with non-existent/stale sensor data):**
    ```json
    {
      "name": "Compare With Stale Sensor",
      "conditions": {
        "source_type": "sensor", "source_id": "room_temp_sensor", "metric": "temperatura", "operator": ">",
        "value_from": { "source_type": "sensor", "source_id": "thermostat_nonexistent", "metric": "target_temp" }
      },
      "actions": [  { "service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "alert_light_hw_id", "params": {"status": "on"} } ]
    }
    ```
4.  **Execution & Verification:**
    -   The rule should NOT trigger.
    -   Check debug logs in `rulesEngineService.js` for warnings like "No valid data for sensor ... in context" or "Metric ... not found for sensor ..." related to `thermostat_nonexistent` when the rule is evaluated.

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
