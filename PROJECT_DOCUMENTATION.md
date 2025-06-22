# Project Overview and Architecture

## Project Purpose

To provide a robust backend system for an IoT (Internet of Things) application, enabling device management, data collection, automation through rules and schedules, user control, and real-time feedback.

## Key Features

- Secure user authentication and authorization.
- API for CRUD operations on devices.
- Logging of device data and operational events.
- A rules engine to trigger actions based on device data.
- Scheduling mechanism for deferred or recurring device operations.
- Real-time notifications via WebSockets for system events and device updates.
- System administration capabilities including Dead-Letter Queue (DLQ) management for critical actions.

## High-level Architecture

- **Backend:** Node.js
- **Framework:** Express.js for API development and routing.
- **Database:** PostgreSQL for persistent storage of user data, device information, rules, schedules, and logs.
- **Caching/Queueing:** Redis for session management, caching, and as a message broker for background tasks (critical actions).
- **Real-time Communication:** WebSockets (ws library) for bidirectional communication between server and clients.
- **Device Communication (assumed):** MQTT for lightweight messaging between IoT devices and the backend.

# Setup and Installation Guide
(...content from previous turn...)
# API Endpoint Documentation - Authentication
(...content from previous turn...)
# API Endpoint Documentation - Device Management
(...content from previous turn...)
# API Endpoint Documentation - Data Retrieval
(...content from previous turn...)
# API Endpoint Documentation - Rules Engine
(...content from previous turn...)
# API Endpoint Documentation - Scheduled Operations
(...content from previous turn...)
# API Endpoint Documentation - System Administration
(...content from previous turn...)

# WebSocket Notifications

This application utilizes WebSockets to provide real-time updates and notifications to connected clients, enhancing the interactive experience by pushing relevant information as events occur within the system.

## Connecting and Authentication

Clients can establish a WebSocket connection to the server for receiving real-time events.

-   **Endpoint:** The WebSocket server runs on the same port as the HTTP/HTTPS server.
    -   Example (development): `ws://localhost:4000`
    -   Example (production with SSL): `wss://yourdomain.com`

-   **Authentication:**
    -   To successfully connect and receive authenticated messages, clients **must** provide a valid JSON Web Token (JWT). This token is obtained from the `/api/auth/login` HTTP endpoint.
    -   The JWT should be appended as a query parameter named `token` to the WebSocket connection URL.
    -   **Example Connection URL:**
        ```
        ws://localhost:4000?token=YOUR_JWT_HERE
        ```
        Replace `YOUR_JWT_HERE` with the actual token.

-   **Connection Handling:**
    -   **Authentication Failure:** If the `token` is missing, invalid, or expired, the server will send an error message (JSON format: `{"type": "error", "event": "authentication_failed", "message": "Authentication failed."}`) and then promptly terminate the WebSocket connection.
    -   **Authentication Success:** Upon successful authentication, the server will send a confirmation message to the client.
        -   Example: `{"type":"info","event":"connection_success","message":"WebSocket connection established and authenticated."}`
    -   **User Association:** Once authenticated, the server associates the user's details (like user ID, username, and role) with their WebSocket connection. This allows for targeted messaging, ensuring users receive notifications relevant to them (e.g., updates about their own devices or admin-specific alerts).

## Server-to-Client Event Types

Messages sent from the server to connected WebSocket clients typically have a `type` field indicating the nature of the event, and often an `event` or `sub_type` field for more specificity, along with a `data` or `payload` field containing the relevant information.

### General Broadcast Events

These events are typically broadcast to all authenticated and connected WebSocket clients.

-   **`device_created`**:
    -   **Description**: Sent when a new device is successfully registered in the system.
    -   **Payload**: The full device object of the newly created device.
-   **`device_updated`**:
    -   **Description**: Sent when a device's general information (name, type, description, config, etc., excluding just status) is updated.
    -   **Payload**: The full updated device object.
-   **`device_status_updated`**:
    -   **Description**: Sent when a device's status is specifically updated (e.g., 'online' to 'offline', 'on' to 'off'). This is a general broadcast.
    -   **Payload**: The full device object with the new status.
-   **`device_deleted`**:
    -   **Description**: Sent when a device is deleted from the system.
    -   **Payload**: An object containing the `id` and `name` of the deleted device (e.g., `{"id": 123, "name": "Old Device"}`).
-   **`rule_triggered`**:
    -   **Description**: Sent when a rule's conditions are met and its actions are about to be executed.
    -   **Payload**: `{ "rule_id": <id>, "rule_name": "<name>", "timestamp": "<ISO_date>", "actions_attempted": [...] }`
-   **`schedule_action_outcome`**:
    -   **Description**: Sent by the Scheduler Engine after a scheduled task has been processed (i.e., its action has been queued or failed to queue).
    -   **Payload**: `{ "schedule_id": <id>, "device_id": <id>, "action_name": "<name>", "outcome_status": "SUCCESS" | "FAILURE", "outcome_details": {...}, "processed_at": "<ISO_date>" }`
-   **`queued_action_executed`**:
    -   **Description**: Sent by the Critical Action Worker when an action from the queue has been successfully executed.
    -   **Payload**: `{ "messageId": "<stream_msg_id>", "action": {...}, "origin": {...}, "attempts": <num>, "executedAt": "<ISO_date>", "actor": "<actor>" }`
-   **`queued_action_dlq_moved`**:
    -   **Description**: Sent by the Critical Action Worker when an action fails all retries and is moved to the Dead-Letter Queue (DLQ).
    -   **Payload**: `{ "originalMessageId": "<stream_msg_id>", "action": {...}, ..., "dlqMessageId": "<dlq_msg_id>" }`
-   **`queued_action_dlq_error`**:
    -   **Description**: Sent by the Critical Action Worker if it fails to move a message to the DLQ.
    -   **Payload**: `{ "originalMessageId": "<stream_msg_id>", ..., "dlqPublishError": "<error_message>" }`

*(More general event types may be added as the system evolves.)*

### Targeted Admin Events

These events are sent exclusively to authenticated clients possessing the 'admin' role.

-   **Event Type:** `admin_device_status_alert`
    -   **Description**: Provides real-time notification to administrators whenever any device's status is updated by any means (e.g., direct API call, rule action, scheduled task). This facilitates immediate administrative awareness and monitoring.
    -   **Payload Example (from README.md):**
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

### Targeted User Events (Device Owners)

These events are sent specifically to the authenticated WebSocket client whose user ID matches the `owner_user_id` of a device when that particular device undergoes significant changes.

-   **Event Type:** `owned_device_update`
    -   **Description**: Keeps device owners informed about important updates or changes to their registered devices.
    -   **Common Payload Fields**:
        -   `type: "owned_device_update"`
        -   `sub_type: "<change_type>"` (string, e.g., "status_change", "config_change", "details_change", "device_deleted") - Indicates the nature of the update.
        -   `message: "<descriptive_message_string>"` (string) - A human-readable summary of the update.
        -   `data: Object` - The updated device object or details of the deleted device.
    -   **Payload Example (`sub_type: 'status_change'`, from README.md):**
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
    -   **Payload Example (`sub_type: 'config_change'`, from README.md):**
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
    -   **Payload Example (`sub_type: 'details_change'`, from README.md):**
        (Covers changes to name, description, room, or ownership itself)
        ```json
        {
          "type": "owned_device_update",
          "sub_type": "details_change",
          "message": "Details of your device 'Garden Sprinkler' (ID: 125) have been updated (e.g., name, description, room, or ownership).",
          "data": { /* Full updated device object */ }
        }
        ```
    -   **Payload Example (`sub_type: 'device_deleted'`, from README.md):**
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

## Manual Testing Guidelines for WebSockets (Summary)

The `README.md` provides detailed manual testing scenarios to ensure WebSocket notifications function correctly. Key aspects include:

-   **Testing Targeted Admin Notifications (`admin_device_status_alert`):**
    -   **Objective**: Verify that only users with the 'admin' role receive `admin_device_status_alert` when any device's status changes.
    -   **Setup**: Connect multiple WebSocket clients: one as admin, others as non-admin users.
    -   **Action**: Update a device's status using the API (e.g., `PATCH /api/devices/:id/status`).
    -   **Expected**: The admin client receives both the general `device_status_updated` event AND the specific `admin_device_status_alert`. Non-admin clients only receive the general `device_status_updated` event.

-   **Testing Targeted Notifications to Device Owners (`owned_device_update`):**
    -   **Objective**: Ensure that `owned_device_update` events are sent exclusively to the device's owner upon relevant changes, and that different `sub_type` values are used appropriately.
    -   **Setup**:
        -   Register at least two users: `owner_user` and `non_owner_user`. An optional `admin_user`.
        -   Obtain JWTs for all.
        -   Create/assign a device (`device_X`) to be owned by `owner_user`.
        -   Connect WebSocket clients for each user.
    -   **Test Cases (summarized from README.md A-F):**
        -   **A (Status Update):** Update status of `device_X`.
            -   Owner: Receives general `device_status_updated` AND `owned_device_update` (sub_type: `status_change`).
            -   Non-Owner: Only general `device_status_updated`.
            -   Admin: General `device_status_updated` AND `admin_device_status_alert`.
        -   **B (Config Update):** Update `config` of `device_X`.
            -   Owner: Receives general `device_updated` AND `owned_device_update` (sub_type: `config_change`).
            -   Non-Owner: Only general `device_updated`.
        -   **C (Detail Update - e.g., Name):** Update name of `device_X`.
            -   Owner: Receives general `device_updated` AND `owned_device_update` (sub_type: `details_change`).
            -   Non-Owner: Only general `device_updated`.
        -   **D (Change of Ownership):** Change owner of `device_X` from `owner_user` to `non_owner_user`.
            -   Previous Owner: Receives general `device_updated` AND `owned_device_update` (sub_type: `details_change`).
            -   New Owner: Receives general `device_updated` AND `owned_device_update` (sub_type: `details_change`).
            -   *Follow-up*: A subsequent status update should now target the new owner with `owned_device_update`.
        -   **E (Remove Ownership):** Set `owner_user_id` of `device_X` to `null`.
            -   Previous Owner: Receives general `device_updated` AND `owned_device_update` (sub_type: `details_change`).
            -   *Follow-up*: Subsequent updates should not trigger `owned_device_update` for any non-admin user for this device.
        -   **F (Device Deletion):** Delete `device_X` (owned by `owner_user`).
            -   Owner: Receives general `device_deleted` AND `owned_device_update` (sub_type: `device_deleted`).
            -   Non-Owner: Only general `device_deleted`.

These tests cover the crucial aspects of targeted and broadcast notifications, ensuring messages reach the intended recipients based on their roles and device ownership.
