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

#### Testing Scheduled Notifications

**Test Case: Schedule a 'send_notification' action.**
1.  **Create Schedule:**
    -   `POST /api/scheduled-operations`
    -   Body Example:
        ```json
        {
          "device_id": null, // Or a relevant device_id if notification is device-specific
          "action_name": "send_notification",
          "action_params": {
            "subject": "Scheduled System Maintenance Reminder",
            "body": "System will undergo scheduled maintenance in 1 hour.",
            "recipient_type": "system_log",
            "recipient_target": "maintenance_alerts",
            "type": "warning"
          },
          "execute_at": "YYYY-MM-DDTHH:MM:00Z" // A near future time (UTC)
        }
        ```
    -   Verify: 201 Created. Note the schedule `id`.
2.  **Observe Execution (when `execute_at` time arrives):**
    -   The `criticalActionWorker` should pick up the queued action.
    -   The `notificationService.sendNotification` should be called by the worker.
3.  **Verify Logs:**
    -   Check `operations_log` (via `GET /api/operations` or direct DB query) for entries related to this scheduled notification:
        -   An entry from `SchedulerEngineService` with `action: 'schedule_action_queued'` for this schedule ID, indicating the `send_notification` action was successfully queued.
        -   An entry from `CriticalActionWorker` with `action: 'queued_action_executed'`, where `targetService: 'notificationService'` and `targetMethod: 'sendNotification'`. The `details.originalAction.payload` should match your `action_params`.
        -   An entry from `NotificationService` (logged via `operationService.recordOperation` call within `sendNotification`) with `action: 'notification_sent_log'`. The `details` should contain your notification's subject, body, type, etc.
    -   Check application console logs (or your configured log output) for lines similar to:
        -   `Scheduler: Action 'send_notification' for schedule ID <your_schedule_id> published to queue. Msg ID: <message_id>`
        -   `CriticalActionWorker: Executing action for message ID <message_id>: ... "targetService":"notificationService","targetMethod":"sendNotification" ...`
        -   `NotificationService: [WARNING] To: system_log (\`maintenance_alerts\`) - Subject: "Scheduled System Maintenance Reminder" ...` (The type like `[WARNING]` and content will match your `action_params`).
4.  **Verify WebSocket (Optional):**
    -   If you are monitoring WebSocket messages, you should observe:
        -   A `schedule_action_outcome` event when the scheduler queues the action.
        -   A `queued_action_executed` event when the worker processes the action.

### System Administration API Endpoints

This section covers API endpoints typically used for system administration and monitoring.

#### Get Critical Actions DLQ Messages

-   **Endpoint:** `GET /api/system/dlq/critical-actions`
-   **Description:** Retrieves messages from the Dead-Letter Queue (DLQ) for critical actions. These are actions (e.g., device status changes, scheduled notifications) that failed all processing attempts by the background worker and were moved to the DLQ for manual inspection or reprocessing.
-   **Authentication:** Required (Bearer Token).
-   **Authorization:** Requires 'admin' role.
-   **Query Parameters:**
    -   `start` (string, optional): The Redis Stream message ID from which to start fetching messages. Defaults to `-` (oldest message). Example: `1678886400000-0`.
    -   `end` (string, optional): The Redis Stream message ID at which to stop fetching messages. Defaults to `+` (newest message). Example: `1678886500000-0`.
    -   `count` (integer, optional): The maximum number of messages to retrieve. Defaults to `50`.
-   **Success Response (200 OK):**
    -   Description: An array of DLQ message objects. Each object contains the DLQ message ID and its parsed data.
    -   Example Payload:
        ```json
        [
          {
            "id": "1678886400000-0", // Example Stream Message ID from DLQ
            "data": {
              "original_message_id": "1678886300000-0", // ID of the message in the original stream
              "original_stream": "critical_actions_stream", // Name of the original stream
              "original_payload_string": "{\"type\":\"device_action\",\"targetService\":\"deviceService\",\"targetMethod\":\"updateDeviceStatus\",\"payload\":{\"deviceId\":\"hw_id_xyz\",\"status\":\"on_error_case\"},\"origin\":{\"service\":\"SchedulerEngineService\",\"scheduleId\":1},\"actor\":\"SchedulerEngineService\",\"published_at\":\"2023-03-15T11:58:20.000Z\"}", // Raw original payload
              "parsed_action": { // The original action that was attempted
                "type": "device_action",
                "targetService": "deviceService",
                "targetMethod": "updateDeviceStatus",
                "payload": { "deviceId": "hw_id_xyz", "status": "on_error_case" },
                "origin": { "service": "SchedulerEngineService", "scheduleId": 1 }
              },
              "actor": "SchedulerEngineService", // Who/what originally published the action
              "published_at_original": "2023-03-15T11:58:20.000Z", // When it was first published to main queue
              "last_error_message": "Device not responding after 3 attempts.", // Reason for failure
              "attempts_made": 3, // Number of processing attempts
              "failed_at": "2023-03-15T12:00:00.000Z", // When it was moved to DLQ
              "dlq_reason": "Max retries reached or non-retryable error during processing" // General reason for being in DLQ
            }
          }
          // ... more messages if any
        ]
        ```
-   **Error Responses:**
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have the 'admin' role.
    -   `500 Internal Server Error`: If there's an issue fetching messages from the DLQ (e.g., Redis connectivity problem).

---
#### `POST /api/system/dlq/critical-actions/message/{messageId}/retry`
Attempts to re-queue a specific message from the Critical Actions DLQ back to the main processing queue.
-   **Authentication:** Required (Admin role).
-   **Authorization:** `authorize(['admin'])`
-   **Path Parameters:**
    -   `messageId` (string, required): The Redis Stream ID of the message in the DLQ (e.g., "1678886400000-0").
-   **Success Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "DLQ message re-queued successfully.",
      "originalDlqMessageId": "1678886400000-0",
      "newQueueMessageId": "1678886900000-0"
    }
    ```
    Or if re-queueing failed internally (e.g., publish to main queue failed):
    ```json
    {
      "success": false,
      "message": "Failed to re-queue message to main stream.",
      "originalDlqMessageId": "1678886400000-0"
    }
    ```
-   **Error Responses:**
    -   `400 Bad Request`: Invalid `messageId` format.
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have 'admin' role.
    -   `404 Not Found`: If the `messageId` does not exist in the DLQ.
    -   `500 Internal Server Error`: Server-side error during processing.

---
#### `DELETE /api/system/dlq/critical-actions/message/{messageId}`
Deletes a specific message from the Critical Actions DLQ.
-   **Authentication:** Required (Admin role).
-   **Authorization:** `authorize(['admin'])`
-   **Path Parameters:**
    -   `messageId` (string, required): The Redis Stream ID of the message in the DLQ.
-   **Success Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "DLQ message deleted.",
      "deletedMessageId": "1678886400000-0",
      "deletedCount": 1
    }
    ```
-   **Response when message not found (Status 404 Not Found):**
    ```json
    {
      "success": false,
      "message": "DLQ message not found or already deleted.",
      "deletedMessageId": "1678886400000-0",
      "deletedCount": 0
    }
    ```
-   **Error Responses:**
    -   `400 Bad Request`: Invalid `messageId` format.
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have 'admin' role.
    -   `500 Internal Server Error`: Server-side error.

---
#### `POST /api/system/dlq/critical-actions/retry-all`
Attempts to re-queue all messages currently in the Critical Actions DLQ back to the main processing queue.
-   **Authentication:** Required (Admin role).
-   **Authorization:** `authorize(['admin'])`
-   **Query Parameters (Optional):**
    -   `batchSize` (integer): While the API route might accept this, the current service implementation (`queueService.retryAllDlqMessages`) fetches and processes all messages in one go, not in batches. This parameter is noted for potential future enhancements.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Retry all DLQ messages attempt complete.",
      "totalAttempted": 5,
      "successfullyRequeued": 4,
      "failedToRequeue": 1
    }
    ```
    Or if DLQ was empty:
    ```json
    {
      "message": "DLQ is empty.",
      "totalAttempted": 0,
      "successfullyRequeued": 0,
      "failedToRequeue": 0
    }
    ```
-   **Error Responses:**
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have 'admin' role.
    -   `500 Internal Server Error`: Server-side error during processing.

---
#### `DELETE /api/system/dlq/critical-actions/clear-all`
Deletes ALL messages from the Critical Actions DLQ by removing the DLQ stream itself. **Use with caution.**
-   **Authentication:** Required (Admin role).
-   **Authorization:** `authorize(['admin'])`
-   **Success Response (200 OK):**
    ```json
    {
      "success": true,
      "message": "DLQ stream 'critical_actions_dlq' deleted."
    }
    ```
    (Note: If the stream didn't exist, Redis `DEL` command doesn't error, so the message would still typically indicate success in deleting/ensuring it's gone).
-   **Error Responses:**
    -   `401 Unauthorized`: Missing or invalid JWT.
    -   `403 Forbidden`: User does not have 'admin' role.
    -   `500 Internal Server Error`: Server-side error.

#### Testing DLQ Message Viewing and Management (`/api/system/dlq/critical-actions/*`)

These tests verify the ability to view and manage messages that have landed in the Critical Actions Dead-Letter Queue (DLQ).

**Prerequisites:**
-   An authenticated user with the 'admin' role.
-   The `criticalActionWorker.js` must be running.
-   Knowledge of how to publish actions that will predictably fail and end up in the DLQ.

**Test Case 1: Forcing a Message to the DLQ and Viewing It**

1.  **Identify or Create a Scenario for Action Failure:**
    -   **Option A (Non-existent device):**
        -   Ensure there is no device with hardware ID (e.g., `device_id`) "NON_EXISTENT_HW_ID".
        -   Create a scheduled operation (via `POST /api/scheduled-operations`) or a rule (via `POST /api/rules`) that attempts to perform an action on this "NON_EXISTENT_HW_ID". For example, an action to `updateDeviceStatus`.
            ```json
            // Example for a scheduled operation action_params:
            // "action_name": "set_status",
            // "action_params": { "status": "on" }
            // (Ensure the schedule targets a device_id that will translate to "NON_EXISTENT_HW_ID"
            //  or directly use a rule action that specifies "NON_EXISTENT_HW_ID")

            // Example for a rule action in rule.actions:
            // { "service": "deviceService", "method": "updateDeviceStatus",
            //   "target_device_id": "NON_EXISTENT_HW_ID", "params": {"status": "on"} }
            ```
    -   **Option B (Invalid Action Payload for Worker):**
        -   Create a scheduled operation or rule that queues an action with a valid `targetService` and `targetMethod` but an intentionally malformed `payload` that will cause the worker's `processMessage` logic for that action to consistently throw an error (and not be a non-retryable config error at the dispatcher level). For example, for `deviceService.setDeviceConfiguration`, send a non-object `config`.
2.  **Trigger the Failing Action:**
    -   If using a scheduled operation, wait for it to execute.
    -   If using a rule, ensure the rule's conditions are met to trigger its actions.
3.  **Observe Worker Logs:**
    -   You should see the `criticalActionWorker.js` attempt to process the message multiple times (e.g., `MAX_EXECUTION_RETRIES` times).
    -   Eventually, you should see logs indicating the message failed all retries and is being moved to the DLQ (e.g., "Moving to DLQ..." and "Message ID ... successfully moved to DLQ...").
    -   An operation log with `action: 'queued_action_failed_dlq'` should also be created.
4.  **View the DLQ via API:**
    -   As an admin user, make a GET request to `/api/system/dlq/critical-actions`.
    -   Verify: 200 OK.
    -   The response body should be an array containing at least one message.
    -   Inspect the message data:
        -   `id` should be the Redis Stream ID of the message in the DLQ.
        -   `data.original_message_id` should match the ID of the message that failed from the main `critical_actions_stream`.
        -   `data.parsed_action` (or `original_payload_string`) should reflect the action you queued.
        -   `data.last_error_message` should indicate the reason for failure.
        -   `data.attempts_made` should be equal to `MAX_EXECUTION_RETRIES`.
5.  **Test Pagination (Optional):**
    -   If you have many messages in the DLQ (or can generate them), test the `count`, `start`, and `end` query parameters:
        -   `GET /api/system/dlq/critical-actions?count=1`
        -   Note the ID of the first message. Use it as the `start` for the next query to get subsequent messages (e.g., `GET /api/system/dlq/critical-actions?start=<ID_of_first_message>&count=1`).

**Test Case 2: Viewing an Empty DLQ**
1.  Ensure the DLQ stream (`critical_actions_dlq`) is empty or delete it from Redis (`DEL critical_actions_dlq`). This can also be tested using the `DELETE /api/system/dlq/critical-actions/clear-all` endpoint.
2.  **View the DLQ via API:**
    -   `GET /api/system/dlq/critical-actions`
    -   Verify: 200 OK.
    -   The response body should be an empty array `[]`.

**Test Case 3: Retrying and Deleting DLQ Messages**
1.  Follow steps in **Test Case 1** to get at least one message into the DLQ. Note its `id`.
2.  **Retry the specific DLQ message:**
    -   `POST /api/system/dlq/critical-actions/message/{dlqMessageId}/retry` (replace `{dlqMessageId}` with the actual ID).
    -   Verify: 200 OK. The response should indicate success and provide a `newQueueMessageId`.
    -   Check worker logs: The action should be processed again. If it fails again, it will re-enter the DLQ (possibly with a new DLQ ID).
    -   Verify with `GET /api/system/dlq/critical-actions`: The original DLQ message ID should no longer be present.
3.  **Force another message to the DLQ.** Note its ID.
4.  **Delete the specific DLQ message:**
    -   `DELETE /api/system/dlq/critical-actions/message/{dlqMessageId}/delete` (replace `{dlqMessageId}` with the new ID).
    -   Verify: 200 OK. The response should indicate success and `deletedCount: 1`.
    -   Verify with `GET /api/system/dlq/critical-actions`: The message should be gone.
    -   Attempt to delete the same ID again. Verify: 404 Not Found.

**Test Case 4: Retry All and Clear All DLQ Messages**
1.  Force several messages into the DLQ (e.g., 2-3 messages).
2.  **Retry All DLQ messages:**
    -   `POST /api/system/dlq/critical-actions/retry-all`
    -   Verify: 200 OK. Inspect the response summary (totalAttempted, successfullyRequeued, failedToRequeue).
    -   Verify with `GET /api/system/dlq/critical-actions`: The DLQ should now be empty (or only contain messages that failed re-queuing immediately).
3.  If any messages remain or new ones are forced, test **Clear All:**
    -   `DELETE /api/system/dlq/critical-actions/clear-all`
    -   Verify: 200 OK. The response should indicate the stream was deleted.
    -   Verify with `GET /api/system/dlq/critical-actions`: The DLQ should be empty.

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

**Sensor History Conditions (`sensor_history`)**
Evaluates a condition based on an aggregation of recent historical readings for a specific sensor metric. Uses data stored in Redis lists by `mqttService.js` (e.g., `sensor_history:temhum1:temperatura`).

- `source_type: "sensor_history"`
- `source_id: "<sensor_identifier_for_redis_key_base>"` (e.g., "temhum1", "calidad_agua", "power:PS001") - This is the base part of the Redis list key.
- `metric: "<metric_name>"` (e.g., "temperatura", "voltage", "ph") - This is appended to `source_id` to form the full list key.
- `aggregator: "avg" | "min" | "max" | "sum"` (Required - The aggregation function to apply to the historical values).
- `operator: ">" | "<" | ">=" | "<=" | "==" | "!="` (Required - Comparison operator).
- `value: <number>` (Required - The value to compare the aggregated result against).

You must specify **either** `time_window` (to aggregate over a duration) **or** `samples` (to aggregate over a fixed number of recent readings). If both are provided, `time_window` will take precedence.

-   **`time_window: "<duration_string>"`** (Optional, use if not using `samples`)
    -   Specifies the duration of recent history to consider, relative to the current time. Data points within this duration (from their `ts` field) will be included in the aggregation.
    -   Format: A string with a number followed by 's' (seconds), 'm' (minutes), or 'h' (hours).
    -   Examples: `"30s"`, `"5m"`, `"2h"`.
    -   *Example Clause (Average temperature over the last 10 minutes):*
        ```json
        {
          "source_type": "sensor_history",
          "source_id": "temhum1",
          "metric": "temperatura",
          "aggregator": "avg",
          "time_window": "10m",
          "operator": ">",
          "value": 22
        }
        ```

-   **`samples: <number>`** (Optional, use if not using `time_window`)
    -   Number of the most recent samples to retrieve from the history list and aggregate.
    -   *Example Clause (Maximum pH value from the last 5 samples):*
        ```json
        {
          "source_type": "sensor_history",
          "source_id": "calidad_agua",
          "metric": "ph",
          "aggregator": "max",
          "samples": 5,
          "operator": "<=",
          "value": 7.5
        }
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

##### Testing Sensor History Conditions (`sensor_history`)

These tests verify conditions based on aggregations of recent sensor readings from Redis Lists.

**Prerequisites for Sensor History Testing:**
-   Ensure `mqttService.js` is operational and correctly configured to push historical data for the relevant sensors to Redis Lists. For example, data for `temhum1`'s `temperatura` should be in `sensor_history:temhum1:temperatura`.
-   You need a method to publish MQTT messages for the sensor and metric you intend to test (e.g., using an MQTT client tool). This allows you to populate the Redis history list with known values and timestamps.
-   Verify that `SENSOR_HISTORY_MAX_LENGTH` (default 100 in `mqttService.js` and `rulesEngineService.js`) is adequate for your test scenarios, or be mindful of this limit. Data points older than this many entries might be trimmed from the list.

**A. Testing with `samples`-based aggregation (Briefly)**
-   **Scenario:** Trigger a rule if the average of the last 3 humidity readings for `temhum1` is above 60%.
    1.  **Publish Data:** Publish 4+ MQTT messages to `Invernadero/TemHum1/data` with varying `humedad` values, ensuring the last 3 average above 60% (e.g., 50, 65, 70, 75 - last three are 65,70,75).
    2.  **Rule Definition:**
        ```json
        {
          "name": "High Avg Humidity Last 3 Samples",
          "conditions": {
            "source_type": "sensor_history", "source_id": "temhum1", "metric": "humedad",
            "aggregator": "avg", "samples": 3, "operator": ">", "value": 60
          },
          "actions": [ /* ... some action ... */ ]
        }
        ```
    3.  **Verify:** The rule should trigger. If you then publish three more values below 60, the rule (if re-evaluated) should no longer trigger for this condition.

**B. Testing with `time_window`-based aggregation**

**Test Case B1: `avg` temperature over a time window.**
1.  **Publish Sensor Data:**
    -   For topic `Invernadero/TemHum1/data` (target `source_id: "temhum1"`, `metric: "temperatura"`):
        -   At T-4 minutes (from now): Publish `{"temperatura": 20}`
        -   At T-3 minutes: Publish `{"temperatura": 20}`
        -   At T-2 minutes: Publish `{"temperatura": 20}`
        -   At T-1 minute: Publish `{"temperatura": 30}`
        -   At T-0 minutes (now): Publish `{"temperatura": 30}`
        *(Ensure `mqttService.js` adds these to `sensor_history:temhum1:temperatura` with their timestamps)*
2.  **Rule Definition (Average > 28 over last 2 minutes):**
    -   Create/update a rule:
        ```json
        {
          "name": "High Avg Temp Last 2 Min",
          "conditions": {
            "source_type": "sensor_history", "source_id": "temhum1", "metric": "temperatura",
            "aggregator": "avg", "time_window": "2m", "operator": ">", "value": 28
          },
          "actions": [ { "service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "fan_hw_id", "params": {"status": "on"} } ]
        }
        ```
3.  **Execution & Verification (after rule evaluation cycle):**
    -   The "fan_hw_id" device should turn ON. (The average of values [30, 30] from the last 2 minutes is 30, which is > 28).
    -   Check `operations_log` for rule trigger.
4.  **Rule Definition (Average > 23 over last 5 minutes):**
    -   Update the rule's `time_window` to `"5m"` and `value` to `23`.
        ```json
        { // ... same name/actions ...
           "conditions": {
               "source_type": "sensor_history", "source_id": "temhum1", "metric": "temperatura",
               "aggregator": "avg", "time_window": "5m", "operator": ">", "value": 23
           }
        }
        ```
5.  **Execution & Verification (after rule evaluation cycle):**
    -   The "fan_hw_id" device should remain ON (or turn ON if previously off). (The average of [20, 20, 20, 30, 30] from the last 5 minutes is 24, which is > 23).
6.  **Test Non-Trigger (Average < 23 over last 5 minutes):**
    -   Update rule: `operator: "<"`, `value: 23`.
    -   Verify: Fan should NOT be triggered by this rule for an ON action.

**Test Case B2: `min` power over a time window.**
1.  **Publish Sensor Data:**
    -   For topic `Invernadero/PS001/data` (target `source_id: "power:PS001"`, `metric: "power"`). Note: `mqttService` needs to be configured to handle `power:PS001` as a valid `source_id` for history.
        -   At T-30 seconds: Publish `{"power": 100}`
        -   At T-20 seconds: Publish `{"power": 50}`
        -   At T-10 seconds: Publish `{"power": 120}`
2.  **Rule Definition (Min power < 60W over last 1 minute):**
    -   Create a rule:
        ```json
        {
          "name": "Low Power Alert Last Min",
          "conditions": {
            "source_type": "sensor_history", "source_id": "power:PS001", "metric": "power",
            "aggregator": "min", "time_window": "1m", "operator": "<", "value": 60
          },
          "actions": [ { "service": "operationService", "method": "recordOperation", "params": {"serviceName": "RulesEngine", "action": "AlertLowPower", "status": "ALERT", "details": {"message": "Minimum power was below 60W in the last minute."}}} ]
        }
        ```
3.  **Execution & Verification (after rule evaluation cycle):**
    -   An operation log with `action: "AlertLowPower"` should be created. (The minimum of [100, 50, 120] in the last minute is 50, which is < 60).

**Test Case B3: Empty/Insufficient Data in Window**
1.  **Setup:** Ensure no data has been published for a specific sensor metric (e.g., `sensor_history:temhum2:temperatura`) within the last 5 minutes. You can achieve this by not publishing or by waiting long enough.
2.  **Rule Definition:**
    ```json
    {
        "name": "Temp Avg With No Recent Data",
        "conditions": {
            "source_type": "sensor_history", "source_id": "temhum2", "metric": "temperatura",
            "aggregator": "avg", "time_window": "1m", "operator": ">", "value": 0
        },
        "actions": [ /* ... some action that is clearly observable ... */ ]
    }
    ```
3.  **Execution & Verification (after rule evaluation cycle):**
    -   The rule should NOT trigger its action.
    -   Check debug logs for messages like "no relevant numeric values for aggregation" or "no history data found" for `sensor_history:temhum2:temperatura`.

**Test Case B4: `max` and `sum` aggregators (Brief)**
-   **`max`:** Publish values like [10, 50, 20] within a `time_window` (e.g., "1m"). Create a rule with `aggregator: "max"`, `operator: "==", value: 50`. Verify it triggers.
-   **`sum`:** Publish values like [10, 20, 30] within a `time_window`. Create a rule with `aggregator: "sum"`, `operator: "==", value: 60`. Verify it triggers.

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

## Background Services and Workers

This section describes background processes that run as part of the application.

### Critical Action Worker

The Critical Action Worker (`workers/criticalActionWorker.js`) is responsible for processing actions from a Redis Stream (`CRITICAL_ACTIONS_STREAM_NAME`). These actions are typically queued by other services (like the Rules Engine or Scheduler Service) and involve operations like updating device statuses or configurations.

-   **Retry Mechanism:** If an action fails, the worker will retry it up to `CRITICAL_WORKER_MAX_RETRIES` times, with a delay of `CRITICAL_WORKER_RETRY_DELAY_MS` between attempts.
-   **Dead-Letter Queue (DLQ):** If an action fails all retry attempts, it is moved to a Dead-Letter Queue (`CRITICAL_ACTIONS_DLQ_STREAM_NAME`) for later inspection and potential manual retry or deletion via the System Administration API endpoints.
-   **DLQ Growth Alerting:** The Critical Action Worker periodically monitors the size of the DLQ. If the number of messages in the DLQ exceeds `DLQ_ALERT_THRESHOLD`, an error is logged to the main application logs, and an 'ALERT' operation (`dlq_threshold_exceeded`) is recorded in the `operations_log` table. This check occurs every `DLQ_CHECK_INTERVAL_MINUTES`. This feature helps administrators identify persistent issues with action processing or an accumulation of failed tasks.

## Environment Variables

This application requires certain environment variables to be set in a `.env` file in the project root.

### MQTT Configuration

-   `MQTT_BROKER_URL`: The full URL of your EMQX MQTT broker.
    (e.g., `mqtt://broker.emqx.io:1883` for non-TLS, `mqtts://broker.emqx.io:8883` for TLS,
    `ws://broker.emqx.io:8083/mqtt` for WebSocket, `wss://broker.emqx.io:8084/mqtt` for Secure WebSocket)
-   `MQTT_USERNAME`: (Optional) Username for MQTT broker authentication.
-   `MQTT_PASSWORD`: (Optional) Password for MQTT broker authentication.

The application is configured to subscribe to topics under the root `Invernadero/#`. Specific sub-topics and their expected payloads are:
(Details as previously verified)
...

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

### Critical Action Worker & DLQ Configuration

-   `CRITICAL_ACTIONS_STREAM_NAME`: Name of the main Redis Stream for critical actions (Default: `critical_actions_stream`).
-   `CRITICAL_ACTIONS_STREAM_MAXLEN`: Approximate maximum length for the main actions stream (Default: `10000`).
-   `CRITICAL_WORKER_MAX_RETRIES`: Number of times the worker will retry a failed action (Default: `3`).
-   `CRITICAL_WORKER_RETRY_DELAY_MS`: Delay in milliseconds between retries (Default: `1000`).
-   `CRITICAL_ACTIONS_DLQ_STREAM_NAME`: Name of the Redis Stream for the Dead-Letter Queue (Default: `critical_actions_dlq`). This is used by the worker for publishing failed messages and by the `queueService` for DLQ management.
-   `CRITICAL_ACTIONS_DLQ_MAXLEN`: Approximate maximum length for the DLQ stream (Default: `1000`).
-   `DLQ_ALERT_THRESHOLD`: Threshold for DLQ size. If the number of messages in `CRITICAL_ACTIONS_DLQ_STREAM_NAME` exceeds this, an alert is logged by the Critical Action Worker. (Default: `10`).
-   `DLQ_CHECK_INTERVAL_MINUTES`: How often (in minutes) the Critical Action Worker checks the DLQ size. (Default: `5`). A value of `0` disables the check.
```
