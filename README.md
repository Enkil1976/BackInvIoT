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
    -   `409 Conflict`: Returned if the proposed schedule's execution time(s) directly clash with another existing enabled schedule for the same device. The system checks for exact time matches, considering the next execution for one-time tasks and a limited number of near-future occurrences (e.g., next 5) for cron-based schedules.
    -   `500 Internal Server Error`: Server-side error.

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
    -   `409 Conflict`: Returned if the updated schedule's execution time(s) directly clash with another existing enabled schedule for the same device (excluding itself). The conflict detection logic is similar to the POST endpoint.
    -   `500 Internal Server Error`: Server-side error.

#### Manual Testing Guidelines for Schedule Conflict Validation

These tests verify that the system prevents the creation or update of schedules that would conflict with existing enabled schedules for the same device based on their next execution times.

**Prerequisites:**
-   An authenticated user with permissions to create/update schedules (e.g., 'admin' or 'editor').
-   At least one or two devices registered in the system (e.g., `device_id_A_db_id`, `device_id_B_db_id`). Obtain their database IDs for use in API calls.

**Test Case 1: Conflict - Creating a new one-time schedule that clashes with an existing one-time schedule.**
1.  **Create Schedule 1 (One-Time):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "on"}, "execute_at": "YYYY-MM-DDTHH:MM:00Z" }` (Choose a specific future UTC time, e.g., two hours from now).
    -   Verify: 201 Created. Note the `id` of this schedule.
2.  **Attempt to Create Schedule 2 (Conflicting One-Time):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "off"}, "execute_at": "YYYY-MM-DDTHH:MM:00Z" }` (Use the *exact same* `device_id` and `execute_at` as Schedule 1).
    -   Verify: **409 Conflict** HTTP status code. The response body should indicate a conflict.
3.  **Attempt to Create Schedule 3 (Non-Conflicting - Different Device):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_B_db_id>, "action_name": "set_status", "action_params": {"status": "off"}, "execute_at": "YYYY-MM-DDTHH:MM:00Z" }` (Use a *different device ID* but same time as Schedule 1).
    -   Verify: 201 Created (assuming `device_id_B_db_id` exists).
4.  **Attempt to Create Schedule 4 (Non-Conflicting - Different Time):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "off"}, "execute_at": "YYYY-MM-DDTHH:MM+1M:00Z" }` (Use same device ID as Schedule 1, but a slightly different future time, e.g., one minute later).
    -   Verify: 201 Created.

**Test Case 2: Conflict - Creating a new cron schedule that clashes with an existing one-time schedule's next run.**
1.  Ensure Schedule 1 from Test Case 1 exists, is enabled, and its `execute_at` is "YYYY-MM-DDTHH:MM:00Z".
2.  **Attempt to Create Schedule 5 (Conflicting Cron):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "aux_on"}, "cron_expression": "<cron_that_triggers_at_Schedule1_execute_at_time>" }`
        (e.g., if Schedule 1 is at 14:30:00 UTC, use a cron like `30 14 * * *`).
    -   Verify: **409 Conflict**.
    -   *(Note: This depends on `MAX_CRON_OCCURRENCES_TO_CHECK` being sufficient if the cron's first matching time is not immediate but within those checks).*

**Test Case 3: Conflict - Updating a schedule to clash with another existing schedule.**
1.  **Create Schedule 6 (One-Time, distinct time):**
    -   `POST /api/scheduled-operations`
    -   Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "X"}, "execute_at": "YYYY-MM-DDTHH+1H:MM:00Z" }` (A distinct future UTC time, e.g., one hour after Schedule 1).
    -   Verify: 201 Created. Note its `id` (e.g., `schedule_6_id`).
2.  Ensure Schedule 1 (from Test Case 1, with `execute_at = YYYY-MM-DDTHH:MM:00Z`) still exists and is enabled.
3.  **Attempt to Update Schedule 6 to conflict with Schedule 1:**
    -   `PUT /api/scheduled-operations/<schedule_6_id>`
    -   Body: `{ "execute_at": "YYYY-MM-DDTHH:MM:00Z" }` (Change Schedule 6's time to match Schedule 1's time).
    -   Verify: **409 Conflict**.
4.  **Update Schedule 6 to a non-conflicting time:**
    -    `PUT /api/scheduled-operations/<schedule_6_id>`
    -    Body: `{ "execute_at": "YYYY-MM-DDTHH+2H:MM:00Z" }` (Another distinct future time).
    -    Verify: 200 OK.

**Test Case 4: No Conflict - Updating a schedule's non-timing attributes.**
1.  Ensure Schedule 1 exists.
2.  **Update Schedule 1's action_params (no time change):**
    -   `PUT /api/scheduled-operations/<id_of_schedule_1>`
    -   Body: `{ "action_params": {"status": "on_updated"} }`
    -   Verify: 200 OK. (Conflict check should pass as `next_execution_at` for this schedule does not change relative to others, or if it does due to re-calc, it doesn't clash).

**Test Case 5: No Conflict - Disabled schedules.**
1. Ensure Schedule 1 exists and is enabled (at "YYYY-MM-DDTHH:MM:00Z").
2. **Create Schedule 7 (One-Time, conflicting time with Schedule 1, but initially disabled):**
    - `POST /api/scheduled-operations`
    - Body: `{ "device_id": <device_id_A_db_id>, "action_name": "set_status", "action_params": {"status": "Z"}, "execute_at": "YYYY-MM-DDTHH:MM:00Z", "is_enabled": false }`
    - Verify: 201 Created (No conflict because it's disabled). Note its `id` (e.g., `schedule_7_id`).
3. **Attempt to enable Schedule 7 (which would then conflict):**
    - `PUT /api/scheduled-operations/<schedule_7_id>`
    - Body: `{ "is_enabled": true }`
    - Verify: **409 Conflict**.

## Device Management

### Device Types and Configuration

#### Power Sensor (`power_sensor`)
- Devices of type `power_sensor` are used to monitor the energy consumption of other devices.
- **Configuration (`config` JSONB field):**
  - `monitors_device_id` (integer, required): The `id` (primary key from the `devices` table) of the device whose power consumption this sensor is monitoring.
  - Example `config`: `{"monitors_device_id": 123}` where `123` is the ID of another device (e.g., a relay controlling a pump).

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
- `value`: The value to compare against (string or number, depending on the context).

**Device Status Conditions:**
- `source_type: "device"`
- `source_id: "<hardware_id_of_device>"` (This is the `device_id` from the `devices` table)
- `property: "status"` (Currently, only "status" is supported for devices)
- `operator: "=="` or `"!="`
- `value: "<status_string>"` (e.g., "on", "offline", "active")
*Example:*
```json
{ "source_type": "device", "source_id": "relay_living_room_light", "property": "status", "operator": "==", "value": "off" }
```

**Sensor Value Conditions:**
- `source_type: "sensor"`
- `source_id: "<sensor_identifier_for_redis_key>"` (e.g., "temhum1", "calidad_agua", "power:PS001" - this maps to the key suffix in Redis: `sensor_latest:<source_id>`)
- `metric: "<metric_name>"` (e.g., "temperatura", "voltage", "ph" - this is the field name within the Redis hash)
- `operator: ">" | "<" | ">=" | "<=" | "==" | "!="` (Numerical comparison)
- `value: <number>`
*Example:*
```json
{ "source_type": "sensor", "source_id": "temhum1", "metric": "temperatura", "operator": ">", "value": 28.5 }
```

**Time-Based Conditions:**

You can restrict rules to specific times or days. All times and datetimes are processed in UTC.

1.  **Daily Time Window (`daily_window`)**
    Restricts the rule to a specific time window within any day.
    - `source_type: "time"`
    - `condition_type: "daily_window"`
    - `after_time: "HH:MM:SS"` (Required UTC time string, e.g., "09:00:00")
    - `before_time: "HH:MM:SS"` (Required UTC time string, e.g., "17:00:00")
    *Example (active 9am to 5pm UTC):*
    ```json
    { "source_type": "time", "condition_type": "daily_window", "after_time": "09:00:00", "before_time": "17:00:00" }
    ```
    *Example (active 10pm to 5am UTC, spanning midnight):*
    ```json
    { "source_type": "time", "condition_type": "daily_window", "after_time": "22:00:00", "before_time": "05:00:00" }
    ```

2.  **Day of Week (`day_of_week`)**
    Restricts the rule to specific days of the week.
    - `source_type: "time"`
    - `condition_type: "day_of_week"`
    - `days: [Number]` (Required array of numbers. Convention: **Sunday=0, Monday=1, ..., Saturday=6**)
    *Example (active on weekdays - Monday to Friday):*
    ```json
    { "source_type": "time", "condition_type": "day_of_week", "days": [1, 2, 3, 4, 5] }
    ```

3.  **Date/Time Range (`datetime_range`)**
    Restricts the rule to an absolute date and time window.
    - `source_type: "time"`
    - `condition_type: "datetime_range"`
    - `after_datetime: "YYYY-MM-DDTHH:MM:SSZ"` (Required ISO 8601 UTC datetime string)
    - `before_datetime: "YYYY-MM-DDTHH:MM:SSZ"` (Required ISO 8601 UTC datetime string)
    *Example (active for the entire month of January 2025 UTC):*
    ```json
    { "source_type": "time", "condition_type": "datetime_range", "after_datetime": "2025-01-01T00:00:00Z", "before_datetime": "2025-01-31T23:59:59Z" }
    ```

**Combining Conditions Example:**
Activate a fan if office temperature (from sensor `office_temp_hw_id` via Redis key `sensor_latest:office_temp_hw_id`) is above 25 AND it's a weekday between 9 AM and 5 PM UTC.
```json
{
  "name": "Weekday Office Hours Fan Control",
  "conditions": {
    "type": "AND",
    "clauses": [
      { "source_type": "sensor", "source_id": "office_temp_hw_id", "metric": "temperatura", "operator": ">", "value": 25 },
      { "source_type": "time", "condition_type": "daily_window", "after_time": "09:00:00", "before_time": "17:00:00" },
      { "source_type": "time", "condition_type": "day_of_week", "days": [1, 2, 3, 4, 5] }
    ]
  },
  "actions": [
    { "service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "fan_office_hw_id", "params": {"status": "on"} }
  ]
}
```

#### Rule Actions (`actions` JSONB field)

The `actions` field is an array of action objects to be executed if conditions are met.
- `service`: Name of the service to call (e.g., "deviceService", "operationService").
- `method`: Method to call on that service (e.g., "updateDeviceStatus", "recordOperation").
- `target_device_id`: (For device actions) The hardware ID (`device_id`) of the target device.
- `params`: An object containing parameters for the method.
*Example (from above):*
```json
[
  { "service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "fan_office_hw_id", "params": {"status": "on"} }
]
```

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

1.  **Test Case: `daily_window`**
    *   **Rule Definition:**
        *   Create a simple rule that triggers a visible action (e.g., turn `device_A` ON). The primary condition can be simple (e.g., `device_B` status is "active", or a sensor value).
        *   Add a `daily_window` time condition to this rule's `conditions.clauses` (if using AND/OR) or as the main condition.
        *   Example time condition: `{"source_type": "time", "condition_type": "daily_window", "after_time": "HH:MM:SS", "before_time": "HH:MM:SS"}`.
    *   **Execution & Verification:**
        *   **Test 1 (Inside Window):** Set `after_time` and `before_time` (UTC) so that the current UTC time is *within* this window. Ensure other non-time conditions for the rule are met. Observe if the rule triggers and `device_A`'s action occurs.
        *   **Test 2 (Outside Window):** Adjust `after_time` and `before_time` (or wait) so the current UTC time is *outside* the window. Ensure other non-time conditions are met. Observe that `device_A`'s action does *not* occur due to the time condition.
        *   **Test 3 (Midnight Span):** Define a window that spans midnight (e.g., `after_time: "22:00:00"`, `before_time: "05:00:00"`).
            *   Test shortly after 22:00 UTC (e.g., 22:05 UTC) - rule should be active.
            *   Test shortly after 00:00 UTC (e.g., 01:00 UTC on the next day) - rule should be active.
            *   Test at a time like 06:00 UTC - rule should be inactive.
            *   Test at a time like 21:00 UTC - rule should be inactive.

2.  **Test Case: `day_of_week`**
    *   **Rule Definition:**
        *   Create a rule with a simple primary condition and a visible action.
        *   Add a `day_of_week` time condition: `{"source_type": "time", "condition_type": "day_of_week", "days": [N]}`.
    *   **Execution & Verification:**
        *   **Test 1 (Matching Day):** Set `days` to include the current UTC day of the week (Sunday=0, Monday=1, ..., Saturday=6). Ensure other non-time conditions are met. Observe if the action occurs.
        *   **Test 2 (Non-Matching Day):** Change `days` in the rule to exclude the current UTC day. Ensure other non-time conditions are met. Observe that the action does *not* occur.

3.  **Test Case: `datetime_range`**
    *   **Rule Definition:**
        *   Create a rule with a simple primary condition and a visible action.
        *   Add a `datetime_range` condition: `{"source_type": "time", "condition_type": "datetime_range", "after_datetime": "YYYY-MM-DDTHH:MM:SSZ", "before_datetime": "YYYY-MM-DDTHH:MM:SSZ"}`.
    *   **Execution & Verification:**
        *   **Test 1 (Inside Range):** Set `after_datetime` to a point in the recent past (UTC) and `before_datetime` to a point in the near future (UTC), ensuring the current moment is within this range. Ensure other non-time conditions are met. Observe if the action occurs.
        *   **Test 2 (Outside Range - Past):** Update the rule so `before_datetime` is in the recent past (current time is after the range). Ensure other non-time conditions are met. Observe that the action does *not* occur.
        *   **Test 3 (Outside Range - Future):** Update the rule so `after_datetime` is in the near future (current time is before the range). Ensure other non-time conditions are met. Observe that the action does *not* occur.

4.  **Test Case: Combined Conditions**
    *   **Rule Definition:** Create a rule that combines a time condition (e.g., `daily_window` for work hours) AND a sensor condition (e.g., temperature > X) AND a device status condition (e.g., another device is "off"). Use the `"type": "AND"` structure.
    *   **Execution & Verification:** Systematically make each condition true or false while others are met to verify the AND logic.
        *   All conditions met (time, sensor, device status): Action *should* trigger.
        *   Time condition met, sensor met, device status NOT met: Action should *NOT* trigger.
        *   Time condition NOT met, sensor met, device status met: Action should *NOT* trigger.
        *   (And so on for other combinations).

**General Verification for all Time-Based Tests:**
-   For each test, after the expected evaluation time of the Rules Engine (e.g., every 30 seconds), check the `operations_log` for `rule_triggered` events (or lack thereof) and any action-specific logs.
-   Monitor WebSocket messages for `rule_triggered` events if this is implemented.
-   Check the `last_triggered_at` field of the rule being tested via `GET /api/rules/:id` to confirm if it was updated (or not).

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

### `rules` Table
- Stores definitions for the rules engine. See "Rules Engine" section for details on `conditions` and `actions`.

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
    -   Payload (JSON): `{"ph": <number>, "ec": <number>, "ppm": <number>, "temp": <number_optional>}` (Note: `temp` is for water temperature if sent in this payload)
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
