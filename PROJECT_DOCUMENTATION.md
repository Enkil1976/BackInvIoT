# IoT Backend System Documentation

## Table of Contents

1.  [Project Overview and Architecture](#project-overview-and-architecture)
    *   [Project Purpose](#project-purpose)
    *   [Key Features](#key-features)
    *   [High-level Architecture](#high-level-architecture)
2.  [Setup and Installation Guide](#setup-and-installation-guide)
    *   [Prerequisites](#prerequisites)
    *   [Cloning the Repository](#cloning-the-repository)
    *   [Installing Dependencies](#installing-dependencies)
    *   [Environment Configuration](#environment-configuration)
    *   [Database Setup](#database-setup)
    *   [Starting the Application](#starting-the-application)
    *   [Verifying Setup](#verifying-setup)
3.  [API Endpoint Documentation - Authentication](#api-endpoint-documentation---authentication)
    *   [User Registration](#user-registration)
    *   [User Login](#user-login)
    *   [Accessing Protected Routes](#accessing-protected-routes)
    *   [Creating an Administrator User](#creating-an-administrator-user)
    *   [Security Notes](#security-notes)
4.  [API Endpoint Documentation - Device Management](#api-endpoint-documentation---device-management)
    *   [Create Device](#create-device)
    *   [List Devices](#list-devices)
    *   [Get Device Details](#get-device-details)
    *   [Update Device](#update-device)
    *   [Update Device Status](#update-device-status)
    *   [Delete Device](#delete-device)
    *   [Get Device Consumption History](#get-device-consumption-history)
5.  [API Endpoint Documentation - Data Retrieval](#api-endpoint-documentation---data-retrieval)
    *   [Get Latest Data Record](#get-latest-data-record)
    *   [Get Chart Data](#get-chart-data)
    *   [Get Paginated History](#get-paginated-history)
    *   [Get Daily Statistics](#get-daily-statistics)
6.  [API Endpoint Documentation - Rules Engine](#api-endpoint-documentation---rules-engine)
    *   [Create Rule](#create-rule)
    *   [List Rules](#list-rules)
    *   [Get Rule Details](#get-rule-details)
    *   [Update Rule](#update-rule)
    *   [Delete Rule](#delete-rule)
    *   [Rule Evaluation Logic (Conceptual)](#rule-evaluation-logic-conceptual)
7.  [API Endpoint Documentation - Scheduled Operations](#api-endpoint-documentation---scheduled-operations)
    *   [Create Scheduled Operation](#create-scheduled-operation)
    *   [List Scheduled Operations](#list-scheduled-operations)
    *   [Get Scheduled Operation Details](#get-scheduled-operation-details)
    *   [Update Scheduled Operation](#update-scheduled-operation)
    *   [Delete Scheduled Operation](#delete-scheduled-operation)
    *   [Manual Testing Notes Summary](#manual-testing-notes-summary)
8.  [API Endpoint Documentation - System Administration](#api-endpoint-documentation---system-administration)
    *   [Dead-Letter Queue (DLQ) Management for Critical Actions](#dead-letter-queue-dlq-management-for-critical-actions)
    *   [DLQ Growth Alerting (Conceptual)](#dlq-growth-alerting-conceptual)
9.  [WebSocket Notifications](#websocket-notifications)
    *   [Connecting and Authentication](#connecting-and-authentication)
    *   [Server-to-Client Event Types](#server-to-client-event-types)
    *   [Manual Testing Guidelines for WebSockets (Summary)](#manual-testing-guidelines-for-websockets-summary)
10. [Database Schema](#database-schema)
    *   [Tables](#tables)
    *   [Relationships (Conceptual Summary)](#relationships-conceptual-summary)
11. [Background Services and Workers](#background-services-and-workers)
    *   [`services/mqttService.js` (MQTT Service)](#servicesmqttservicejs-mqtt-service)
    *   [`services/rulesEngineService.js` (Rules Engine Service)](#servicesrulesengineservicejs-rules-engine-service)
    *   [`services/scheduleService.js` (Schedule Service - Management)](#servicesscheduleservicejs-schedule-service---management)
    *   [`services/schedulerEngineService.js` (Scheduler Engine - Execution)](#servicesschedulerengineservicejs-scheduler-engine---execution)
    *   [`services/queueService.js` (Queue Service - Redis Streams)](#servicesqueueservicejs-queue-service---redis-streams)
    *   [`workers/criticalActionWorker.js` (Critical Action Worker)](#workerscriticalactionworkerjs-critical-action-worker)
    *   [`services/notificationService.js` (Notification Service - Conceptual)](#servicesnotificationservicejs-notification-service---conceptual)
    *   [API Support Services (`services/authService.js`, `services/deviceService.js`, `services/rulesService.js`, etc.)](#api-support-services-servicesauthservicejs-servicesdeviceservicejs-servicesrulesservicejs-etc)
12. [Environment Variables](#environment-variables)
    *   [General Configuration](#general-configuration)
    *   [Database (PostgreSQL)](#database-postgresql)
    *   [Redis](#redis)
    *   [Authentication (JWT)](#authentication-jwt)
    *   [MQTT Broker](#mqtt-broker)
    *   [Logging (Winston)](#logging-winston)
    *   [Note on `.env` File](#note-on-env-file)
13. [Testing Guide](#testing-guide)
    *   [Introduction](#introduction)
    *   [Running Tests](#running-tests)
    -   [Types of Tests](#types-of-tests)
    *   [Contributing Tests](#contributing-tests)

## Project Overview and Architecture

### Project Purpose

To provide a robust backend system for an IoT (Internet of Things) application, enabling device management, data collection, automation through rules and schedules, user control, and real-time feedback.

### Key Features

- Secure user authentication and authorization.
- API for CRUD operations on devices.
- Logging of device data and operational events.
- A rules engine to trigger actions based on device data.
- Scheduling mechanism for deferred or recurring device operations.
- Real-time notifications via WebSockets for system events and device updates.
- System administration capabilities including Dead-Letter Queue (DLQ) management for critical actions.

### High-level Architecture

-   **Backend**: Node.js
-   **Framework**: Express.js for API development and routing.
-   **Database**: PostgreSQL for persistent storage of user data, device information, rules, schedules, and logs.
-   **Caching/Queueing**: Redis for session management, caching, and as a message broker for background tasks (critical actions).
-   **Real-time Communication**: WebSockets (using the `ws` library) for bidirectional communication between server and clients.
-   **Device Communication (assumed)**: MQTT for lightweight messaging between IoT devices and the backend.

## Setup and Installation Guide

This section details the steps to set up the development environment for the IoT backend system.

### Prerequisites

Before you begin, ensure you have the following installed on your system:

-   **Node.js**: Version 18.x or higher is recommended.
-   **PostgreSQL**: Version 13 or higher.
-   **Redis**: Version 6.x or higher.

### Cloning the Repository

First, clone the project repository to your local machine:

```bash
git clone <repository-url>
```
Replace `<repository-url>` with the actual URL of the Git repository.

### Installing Dependencies

Navigate to the cloned project directory and install the necessary Node.js dependencies:

```bash
cd <project-directory> # Navigate to the root of the cloned repository
npm install
```

### Environment Configuration

The application uses environment variables for configuration. These variables are loaded from a `.env` file located in the root of the project, parsed by the `dotenv` package.

1.  **Create a `.env` file**: If a `.env.example` file is provided in the repository, copy it to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    If `.env.example` does not exist, you will need to create the `.env` file manually.

2.  **Set Environment Variables**: Populate the `.env` file with the essential variables. Adjust values according to your development environment. See the [Environment Variables](#environment-variables) section for a detailed list.

### Database Setup

1.  **Ensure PostgreSQL is Running**: Make sure your PostgreSQL server is running and accessible using the credentials specified in your `.env` file.

2.  **Schema Definition**: The database schema (tables, relationships, etc.) is defined in SQL scripts located in the `sql/` directory.

3.  **Execute SQL Scripts**: You will need to execute these scripts against your PostgreSQL database to create the necessary tables and relationships. The order of execution can be important due to dependencies (e.g., foreign keys).

    The following SQL files define the schema (as identified previously):
    -   `create_users_table.sql`
    -   `create_devices_table.sql`
    -   `create_rules_table.sql`
    -   `create_scheduled_operations_table.sql`
    -   `create_operations_log_table.sql`
    -   `create_power_monitor_logs_table.sql`
    -   `create_temhum1_table.sql`
    -   `create_temhum2_table.sql`
    -   `create_calidad_agua_table.sql`
    -   `alter_devices_add_owner_user_id.sql`
    -   `alter_temhum1_add_invernadero_fields.sql`
    -   `alter_temhum2_add_invernadero_fields.sql`
    -   `alter_calidad_agua_add_temperatura_agua.sql`
    -   `migrate_add_role_to_users.sql`

    **Note**: It is generally recommended to run the `create_*` scripts first to establish the base tables. Afterwards, run the `alter_*` scripts to modify existing tables, and finally, any `migrate_*` scripts for data migrations or further schema adjustments. Always review the script contents if you are unsure about specific dependencies or their order. You can use a PostgreSQL client like `psql` or a GUI tool (e.g., pgAdmin, DBeaver) to execute these scripts.

### Starting the Application

Once dependencies are installed and the environment is configured, you can start the application:

-   **Development Mode**: This command typically starts the server with hot-reloading, useful for development.
    ```bash
    npm run dev
    ```
    (Note: The `dev` script in `package.json` uses `vite`. Assuming Vite is configured for backend hot-reloading, e.g. via `nodemon` or similar, or if it serves a development frontend that proxies to this backend.)

-   **Production Mode**: For production deployments, use:
    ```bash
    npm start
    ```
    This usually runs the application in a more optimized way, without development-specific features.

### Verifying Setup

After starting the application, you can verify that it's running correctly:

-   Check the console output for any error messages.
-   Try accessing a basic API endpoint, such as a health check endpoint (e.g., `/health` or `/api/status`), if available. If not, a simple request to `http://localhost:PORT` (where `PORT` is the one defined in your `.env`, e.g., 4000) or a known public endpoint should indicate if the server is responding.
-   For example, if there's a root endpoint that returns a welcome message: `curl http://localhost:4000/`
-   If API documentation (e.g., Swagger/OpenAPI) is served, try accessing its URL.

## API Endpoint Documentation - Authentication

This section details the API endpoints for user authentication, including registration, login, and how to access protected routes.

### User Registration

Registers a new user in the system.

-   **Endpoint**: `POST /api/auth/register`
-   **Description**: Creates a new user account.
-   **Request Body** (`application/json`):
    ```json
    {
      "username": "usuario1",
      "email": "correo@ejemplo.com",
      "password": "tu_contraseña_segura"
    }
    ```
-   **Success Response (201 Created)**:
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
-   **Potential Error Responses**:
    -   `400 Bad Request`: Validation errors (e.g., missing fields, invalid email, short password).
    -   `409 Conflict`: Username or email already exists.

### User Login

Logs in an existing user and returns a JWT for session authentication.

-   **Endpoint**: `POST /api/auth/login`
-   **Description**: Authenticates a user and provides a JSON Web Token (JWT).
-   **Request Body** (`application/json`):
    ```json
    {
      "username": "usuario1",
      "password": "tu_contraseña_segura"
    }
    ```
-   **Success Response (200 OK)**:
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
-   **Potential Error Responses**:
    -   `400 Bad Request`: Missing username or password.
    -   `401 Unauthorized`: Invalid credentials.

### Accessing Protected Routes

To access routes that require authentication, include the JWT in the `Authorization` header of your HTTP request, prefixed with `Bearer `.

-   **Header Format**: `Authorization: Bearer <JWT_TOKEN>`
-   **Example** (`curl`):
    This example shows how to get the latest record from a protected table (`temhum1`). Replace `<JWT_TOKEN>` with the actual token.
    ```bash
    curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:4000/api/latest/temhum1
    ```

### Creating an Administrator User

For security reasons, administrator users should be created manually directly in the database.

1.  **Hash the Password**:
    Use a library like bcrypt to hash the desired password. You can do this in a Node.js console:
    ```javascript
    // In Node.js console
    require('bcrypt').hashSync('your_secure_password', 12);
    // This will output the hashed password string.
    ```

2.  **Insert the Admin User into the Database**:
    Use the hashed password from the previous step to insert the administrator user into the `users` table. The `role` field should be set to `admin`.
    ```sql
    INSERT INTO users (username, email, password_hash, role)
    VALUES ('admin', 'admin@example.com', '<HASHED_PASSWORD_FROM_STEP_1_HERE>', 'admin');
    ```

### Security Notes

-   **Password Hashing**: User passwords are not stored in plaintext. They are hashed using bcrypt with a salt.
-   **JWT Expiration**: JWTs expire after a period defined by the `JWT_EXPIRES_IN` environment variable.
-   **Token Storage**: Active JWTs are stored in Redis (as per `README.md`), potentially for session control or quick invalidation, though expiration is the primary mechanism.
-   **General Advice**: Do not share passwords. Secure JWTs appropriately on the client-side.

## API Endpoint Documentation - Device Management

This section provides details on API endpoints for managing devices within the IoT system.

*(Note: Specific role requirements for authentication marked with "(Role: Admin/Editor - Verification Recommended)" or similar indicate common practice but should be verified against actual implementation in `routes/devices.js` or service layers.)*

### Create Device

Registers a new device in the system.

-   **Endpoint**: `POST /api/devices`
-   **Authentication**: Required. (Role: Admin/Editor - Verification Recommended)
-   **Request Body** (`application/json`):
    ```json
    {
      "name": "Living Room Lamp",
      "device_id": "SN-LR-LAMP-001", // Unique hardware identifier
      "type": "smart_light",
      "description": "Smart light bulb in the living room.",
      "room": "Living Room",
      "status": "offline", // Initial status
      "config": {
        "brightness_level": 80,
        "color_temperature": "warm_white"
      },
      "owner_user_id": 123 // Optional: ID of the user owning this device
    }
    ```
-   **Success Response (201 Created)**: The created device object, including `id`, `created_at`, `updated_at`.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (if `device_id` already exists).

### List Devices

Retrieves a list of all registered devices, with support for filtering and pagination.

-   **Endpoint**: `GET /api/devices`
-   **Authentication**: Required.
-   **Query Parameters (Optional)**: *(Exact parameters need verification against implementation)*
    -   `type` (string): Filter by device type.
    -   `room` (string): Filter by room.
    -   `status` (string): Filter by status.
    -   `owner_user_id` (integer): Filter by owner.
    -   `page` (integer, default: 1).
    -   `limit` (integer, default: 10).
    -   `sortBy` (string, default: 'created_at').
    -   `sortOrder` (string, default: 'desc').
-   **Success Response (200 OK)**:
    ```json
    {
      "data": [ /* array of device objects */ ],
      "meta": { "currentPage": 1, "limit": 10, "totalDevices": 50, "totalPages": 5 }
    }
    ```
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`.

### Get Device Details

Retrieves detailed information for a specific device by its database ID.

-   **Endpoint**: `GET /api/devices/:id`
-   **Authentication**: Required. *(Permission model, e.g., owner or admin, needs verification)*
-   **Path Parameters**: `id` (integer, required).
-   **Success Response (200 OK)**: The device object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `404 Not Found`.

### Update Device

Updates attributes of an existing device. `device_id` is generally immutable.

-   **Endpoint**: `PUT /api/devices/:id`
-   **Authentication**: Required. (Role: Admin/Editor or device owner - Verification Recommended)
-   **Path Parameters**: `id` (integer, required).
-   **Request Body** (`application/json`): Subset of fields from Create Device (e.g., `name`, `type`, `description`, `room`, `config`, `owner_user_id`).
-   **Success Response (200 OK)**: The updated device object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Update Device Status

Updates the operational status of a specific device.

-   **Endpoint**: `PATCH /api/devices/:id/status`
-   **Authentication**: Required. *(Permissions may vary for user vs. system/MQTT updates - Verification Recommended)*
-   **Path Parameters**: `id` (integer, required).
-   **Request Body** (`application/json`):
    ```json
    { "status": "new_status" }
    ```
-   **Success Response (200 OK)**: The device object with updated status.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Delete Device

Removes a device from the system.

-   **Endpoint**: `DELETE /api/devices/:id`
-   **Authentication**: Required. (Role: Admin - Verification Recommended)
-   **Path Parameters**: `id` (integer, required).
-   **Success Response**: `204 No Content` or `200 OK` with a confirmation message.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Get Device Consumption History

Retrieves the power consumption history for a specified device.

-   **Endpoint**: `GET /api/devices/:id/consumption-history`
-   **Authentication**: Required.
-   **Path Parameters**: `id` (integer, required).
-   **Query Parameters**:
    -   `startDate` (string, optional, ISO8601 date).
    -   `endDate` (string, optional, ISO8601 date).
    -   `lastHours` (integer, optional).
    -   `limit` (integer, optional, default: 100).
    -   `page` (integer, optional, default: 1).
-   **Success Response (200 OK)**:
    ```json
    {
      "data": [ /* array of consumption records */ ],
      "meta": { "page": 1, "limit": 100, "totalRecords": 500, "totalPages": 5 }
    }
    ```
-   **Error Responses**: `401 Unauthorized`, `400 Bad Request`, `404 Not Found`.

## API Endpoint Documentation - Data Retrieval

Endpoints for retrieving historical and aggregated sensor data. These utilize `validateTableParam` middleware (validates table name against a predefined list) and `cacheMiddleware` (caches responses in Redis).

*(Authentication for /chart, /history, /stats routes was not explicitly authMiddleware-protected in routes/data.js. This should be reviewed for production security.)*

### Get Latest Data Record

Retrieves the most recent record from a specified sensor table. Calculates `dew_point` for `temhum1`, `temhum2`.

-   **Endpoint**: `GET /api/latest/:table`
-   **Authentication**: Required (uses `authMiddleware`).
-   **Path Parameters**: `table` (string, required, e.g., `temhum1`).
-   **Success Response (200 OK)**: Latest record object or `null`. Example for `temhum1`:
    ```json
    {
      "id": 123, "received_at": "2023-10-27T10:30:05Z", "temperature": 25.5, "humidity": 60.1, "dew_point": 17.5
    }
    ```
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `500 Internal Server Error`.

### Get Chart Data

Retrieves data suitable for chart rendering from a table for a recent period.

-   **Endpoint**: `GET /api/chart/:table`
-   **Authentication**: Not explicitly JWT protected per `routes/data.js`. *(Security review recommended)*
-   **Path Parameters**: `table` (string, required).
-   **Query Parameters**: `hours` (integer, optional, default: 24).
-   **Success Response (200 OK)**: Array of record objects.
    ```json
    [
      { "received_at": "2023-10-27T08:00:00Z", "temperature": 22.0, "humidity": 55.0 },
      { "received_at": "2023-10-27T08:05:00Z", "temperature": 22.1, "humidity": 55.2 }
    ]
    ```
-   **Error Responses**: `400 Bad Request`, `500 Internal Server Error`.

### Get Paginated History

Retrieves paginated historical data from a specified table.

-   **Endpoint**: `GET /api/history/:table`
-   **Authentication**: Not explicitly JWT protected. *(Security review recommended)*
-   **Path Parameters**: `table` (string, required).
-   **Query Parameters**: `limit` (integer, default: 100), `page` (integer, default: 1).
-   **Success Response (200 OK)**: Array of record objects.
-   **Error Responses**: `400 Bad Request`, `500 Internal Server Error`.

### Get Daily Statistics

Retrieves daily aggregated statistics (count, avg, min, max) for the last 7 days. Customized for specific tables like `temhum1`, `calidad_agua`.

-   **Endpoint**: `GET /api/stats/:table`
-   **Authentication**: Not explicitly JWT protected. *(Security review recommended)*
-   **Path Parameters**: `table` (string, required).
-   **Success Response (200 OK)**: Array of daily stat objects. Example for `temhum1`:
    ```json
    [
      {
        "date": "2023-10-27", "total_records": 288,
        "temperature": { "average": 24.5, "minimum": 22.0, "maximum": 26.5 },
        "humidity": { "average": 55.0, "minimum": 50.0, "maximum": 60.0 }
      }
    ]
    ```
-   **Error Responses**: `400 Bad Request`, `500 Internal Server Error`.

## API Endpoint Documentation - Rules Engine

Manages automation rules (conditions and actions). Logic handled by `services/rulesEngineService.js`.

*(Note: Exact condition/action structures and role requirements need verification from source code, e.g., `routes/rules.js` and services.)*

### Create Rule

-   **Endpoint**: `POST /api/rules`
-   **Authentication**: Required. (Role: Admin/Editor - Verification Recommended)
-   **Request Body** (`application/json`): Includes `name`, `description`, `device_id`, `conditions` (array), `actions` (array), `is_enabled`, `priority`.
    ```json
    {
      "name": "High Temp Alert",
      "device_id": 5,
      "conditions": [ { "source_table": "temhum1", "field": "temperature", "operator": ">", "value": 30, "device_id_field_in_source_table": "device_db_id" } ],
      "actions": [ { "type": "SET_DEVICE_STATUS", "target_device_id": 10, "params": {"status": "off"} } ]
    }
    ```
-   **Success Response (201 Created)**: The created rule object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`.

### List Rules

-   **Endpoint**: `GET /api/rules`
-   **Authentication**: Required.
-   **Query Parameters (Assumed)**: `device_id`, `is_enabled`, `page`, `limit`.
-   **Success Response (200 OK)**: Paginated list of rule objects.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`.

### Get Rule Details

-   **Endpoint**: `GET /api/rules/:id`
-   **Authentication**: Required.
-   **Path Parameters**: `id` (integer, required).
-   **Success Response (200 OK)**: The rule object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `404 Not Found`.

### Update Rule

-   **Endpoint**: `PUT /api/rules/:id`
-   **Authentication**: Required. (Role: Admin/Editor - Verification Recommended)
-   **Path Parameters**: `id` (integer, required).
-   **Request Body** (`application/json`): Fields to update.
-   **Success Response (200 OK)**: The updated rule object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Delete Rule

-   **Endpoint**: `DELETE /api/rules/:id`
-   **Authentication**: Required. (Role: Admin - Verification Recommended)
-   **Path Parameters**: `id` (integer, required).
-   **Success Response**: `204 No Content` or `200 OK`.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Rule Evaluation Logic (Conceptual)

`services/rulesEngineService.js` loads active rules, monitors data/events, evaluates conditions, and if met, queues actions (via `queueService.js`) or calls services directly. Outcomes are logged to `operations_log`.

## API Endpoint Documentation - Scheduled Operations

Manages operations scheduled for devices. `services/scheduleService.js` for management, `services/schedulerEngineService.js` for execution. Includes conflict detection for exact time matches.

### Create Scheduled Operation

-   **Endpoint**: `POST /api/scheduled-operations`
-   **Authentication**: Required. (Role: Admin/Editor - per README)
-   **Request Body** (`application/json`): `device_id`, `action_name`, `action_params`, `cron_expression` (optional), `execute_at` (optional), `is_enabled`, `description`.
    -   **Supported `action_name` values**: `set_status`, `apply_device_config`, `log_generic_event`, `send_notification` (details for each in README).
-   **Success Response (201 Created)**: The created scheduled operation object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `409 Conflict`, `500 Internal Server Error`.

### List Scheduled Operations

-   **Endpoint**: `GET /api/scheduled-operations`
-   **Authentication**: Required. *(Role-based filtering needs clarification)*
-   **Query Parameters (Assumed)**: `device_id`, `is_enabled`, `action_name`, `page`, `limit`.
-   **Success Response (200 OK)**: Paginated list of scheduled operations.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`.

### Get Scheduled Operation Details

-   **Endpoint**: `GET /api/scheduled-operations/:id`
-   **Authentication**: Required.
-   **Path Parameters**: `id` (integer, required).
-   **Success Response (200 OK)**: The scheduled operation object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Update Scheduled Operation

-   **Endpoint**: `PUT /api/scheduled-operations/:id`
-   **Authentication**: Required. (Role: Admin/Editor - per README)
-   **Path Parameters**: `id` (integer, required).
-   **Request Body** (`application/json`): Fields to update.
-   **Success Response (200 OK)**: The updated scheduled operation object.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `500 Internal Server Error`.

### Delete Scheduled Operation

-   **Endpoint**: `DELETE /api/scheduled-operations/:id`
-   **Authentication**: Required. (Role: Admin/Editor - Verification Recommended)
-   **Path Parameters**: `id` (integer, required).
-   **Success Response**: `204 No Content` or `200 OK`.
-   **Error Responses**: `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

### Manual Testing Notes Summary

-   **Conflict Validation**: Test `409 Conflict` for overlapping one-time and cron schedules for the same device. Disabled schedules should not conflict.
-   **Scheduled Notifications**: Test `send_notification` action by verifying `operations_log` entries and WebSocket `schedule_action_outcome` events.

## API Endpoint Documentation - System Administration

Endpoints for admin users to monitor and manage system health, especially background task error handling. Access is strictly limited to 'admin' roles.

### Dead-Letter Queue (DLQ) Management for Critical Actions

Critical actions (from rules/schedules) are processed by `workers/criticalActionWorker.js` via `queueService.js`. Failed actions move to a DLQ.

#### View DLQ Messages

-   **Endpoint**: `GET /api/system/dlq/critical-actions`
-   **Authentication**: Required (Role: Admin).
-   **Query Parameters**: `count` (integer, default: 10), `startId` (string, default: '0-0' for Redis Streams).
-   **Success Response (200 OK)**: Array of DLQ message objects (including `dlqMessageId`, `originalMessageId`, `action`, `error_details`, `retries`, `failed_at`).
-   **Error Responses**: `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`.

#### Retry DLQ Message

-   **Endpoint**: `POST /api/system/dlq/critical-actions/retry/:dlqMessageId`
-   **Authentication**: Required (Role: Admin).
-   **Path Parameters**: `dlqMessageId` (string, required).
-   **Success Response (200 OK)**: Confirmation (e.g., `{"message": "Message requeued", "new_stream_message_id": "..."}`).
-   **Error Responses**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`.

#### Delete DLQ Message

-   **Endpoint**: `DELETE /api/system/dlq/critical-actions/:dlqMessageId`
-   **Authentication**: Required (Role: Admin).
-   **Path Parameters**: `dlqMessageId` (string, required).
-   **Success Response**: `200 OK` or `204 No Content`.
-   **Error Responses**: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`.

#### Retry All DLQ Messages

-   **Endpoint**: `POST /api/system/dlq/critical-actions/retry-all`
-   **Authentication**: Required (Role: Admin). *(Utility endpoint - confirm implementation)*
-   **Success Response (200 OK)**: Summary (e.g., `{"requeued_count": X, "failed_count": Y}`).
-   **Error Responses**: `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`.

#### Clear Entire DLQ

-   **Endpoint**: `DELETE /api/system/dlq/critical-actions/clear-all`
-   **Authentication**: Required (Role: Admin). *(Utility endpoint - confirm implementation, use with extreme caution)*
-   **Success Response**: `200 OK` or `204 No Content` (e.g., `{"cleared_count": X}`).
-   **Error Responses**: `401 Unauthorized`, `403 Forbidden`, `500 Internal Server Error`.

### DLQ Growth Alerting (Conceptual)

The system should ideally monitor DLQ size and alert admins if it exceeds thresholds, indicating potential systemic issues. (Based on README test case).

## WebSocket Notifications

Real-time updates via WebSockets.

### Connecting and Authentication

-   **Endpoint**: Same port as HTTP/S (e.g., `ws://localhost:4000`).
-   **Authentication**: JWT via `token` query parameter: `ws://localhost:4000?token=YOUR_JWT_HERE`.
-   **Connection Handling**:
    -   Failure: `{"type": "error", "event": "authentication_failed", ...}` then termination.
    -   Success: `{"type":"info","event":"connection_success",...}`. User details associated with connection.

### Server-to-Client Event Types

#### General Broadcast Events
-   `device_created`: Payload: new device object.
-   `device_updated`: Payload: updated device object (general info).
-   `device_status_updated`: Payload: device object with new status.
-   `device_deleted`: Payload: `{ id, name }`.
-   `rule_triggered`: Payload: `{ rule_id, rule_name, timestamp, actions_attempted }`.
-   `schedule_action_outcome`: Payload: `{ schedule_id, device_id, action_name, outcome_status, outcome_details, processed_at }`.
-   `queued_action_executed`: Payload: `{ messageId, action, origin, attempts, executedAt, actor }`.
-   `queued_action_dlq_moved`: Payload: `{ originalMessageId, action, ..., dlqMessageId }`.
-   `queued_action_dlq_error`: Payload: `{ originalMessageId, ..., dlqPublishError }`.

#### Targeted Admin Events
-   `admin_device_status_alert`: Sent only to admins on any device status update. Payload example:
    ```json
    {
      "type": "admin_device_status_alert",
      "message": "Device 'Living Room Lamp' (ID: 123) status updated to 'on'.",
      "data": { "id": 123, "name": "Living Room Lamp", "status": "on", ... }
    }
    ```

#### Targeted User Events (Device Owners)
-   `owned_device_update`: Sent to device owner on changes to their device.
    -   `sub_type`: "status_change", "config_change", "details_change", "device_deleted".
    -   Payload includes `message` and `data` (device object or details). Examples provided in README for each `sub_type`.

### Manual Testing Guidelines for WebSockets (Summary)

-   **Admin Notifications**: Verify `admin_device_status_alert` is admin-only.
-   **Owner Notifications**: Verify `owned_device_update` (with correct `sub_type`) is owner-only for device status, config, detail changes, and deletion. Non-owners should only get general events.

## Database Schema

Overview of the PostgreSQL database structure, defined by scripts in `sql/`.

*(Key columns highlighted; specific data types omitted for brevity. Assumed Foreign Keys like `device_db_id` in sensor tables link to `devices.id`.)*

### Tables

-   **`users`**: User accounts. (PK: `id`, `username`, `email`, `password_hash`, `role`).
-   **`devices`**: IoT device information. (PK: `id`, `device_id` (unique HW ID), `name`, `type`, `status`, `config` (JSONB), `owner_user_id` (FK to `users.id`)).
-   **`rules`**: Automation rules. (PK: `id`, `name`, `device_id` (FK), `conditions` (JSONB), `actions` (JSONB), `is_enabled`).
-   **`scheduled_operations`**: Scheduled tasks. (PK: `id`, `device_id` (FK), `action_name`, `action_params` (JSONB), `cron_expression`, `execute_at`, `is_enabled`, `status`).
-   **`operations_log`**: Audit trail for system operations. (PK: `id`, `device_id` (FK), `rule_id` (FK), `schedule_id` (FK), `action_name`, `status`, `executed_at`, `actor_type`).
-   **`power_monitor_logs`**: Time-series power data. (PK: `id`, `monitored_device_id` (FK to `devices.id`), `voltage`, `current`, `power`, `sensor_timestamp`).
-   **`temhum1`**: Temperature/humidity data (e.g., Greenhouse 1). (PK: `id`, `received_at`, `temperatura`, `humedad`, `device_db_id` (FK assumed), `nombre_invernadero`).
-   **`temhum2`**: Temperature/humidity data (e.g., Greenhouse 2). (PK: `id`, `received_at`, `temperatura`, `humedad`, `device_db_id` (FK assumed), `nombre_invernadero`).
-   **`calidad_agua`**: Water quality data. (PK: `id`, `received_at`, `ph`, `ec`, `ppm`, `temperatura_agua`, `device_db_id` (FK assumed)).
-   **Other Sensor Tables (e.g., `luxometro`)**: If used, would follow similar time-series pattern with FK to `devices.id`.

### Relationships (Conceptual Summary)

-   User owns Devices.
-   Device associated with Rules, Scheduled Operations, and various log/sensor data tables.
-   `operations_log` links to Devices, Rules, or Scheduled Operations as triggers.

## Background Services and Workers

Key server-side components for asynchronous tasks, device communication, and automation.

### `services/mqttService.js` (MQTT Service)
-   **Purpose**: Manages MQTT communication with devices.
-   **Responsibilities (Inferred)**: Connects to broker, subscribes/publishes to topics, parses messages, forwards data to other services or database. Handles device lifecycle events.

### `services/rulesEngineService.js` (Rules Engine Service)
-   **Purpose**: Evaluates rules and triggers actions.
-   **Responsibilities (Inferred)**: Loads rules, monitors conditions (event-driven or polling), evaluates conditions, queues actions (via `queueService.js`) or calls services directly. Logs outcomes.

### `services/scheduleService.js` (Schedule Service - Management)
-   **Purpose**: Manages CRUD for scheduled operations via API.
-   **Responsibilities**: Validates and stores schedule definitions in `scheduled_operations` table. Provides data to `schedulerEngineService.js`.

### `services/schedulerEngineService.js` (Scheduler Engine - Execution)
-   **Purpose**: Executes scheduled operations.
-   **Responsibilities (Inferred)**: Monitors due tasks (cron, one-time), queues actions via `queueService.js`, updates task status, logs execution.

### `services/queueService.js` (Queue Service - Redis Streams)
-   **Purpose**: Interface for adding tasks to Redis Streams for reliable, decoupled processing.
-   **Responsibilities (Inferred)**: Enqueues tasks/messages to specified Redis Streams.

### `workers/criticalActionWorker.js` (Critical Action Worker)
-   **Purpose**: Processes tasks from Redis Streams (e.g., `critical_actions_stream`).
-   **Responsibilities (Inferred)**: Reads from stream (consumer group), executes actions (calling other services), acknowledges messages, handles errors (retries, DLQ transfer). Logs processing.

### `services/notificationService.js` (Notification Service - Conceptual)
-   **Purpose**: Handles dispatch of notifications.
-   **Responsibilities (Inferred)**: Receives requests, formats content, "sends" notifications (logging, WebSockets, future: email/SMS).

### API Support Services (`services/authService.js`, `services/deviceService.js`, `services/rulesService.js`, etc.)
-   **Purpose**: Core business logic for respective API routes.
-   **Responsibilities**: Data validation, CRUD operations with database, orchestrating calls to other services.

## Environment Variables

Application configuration is managed via environment variables, typically loaded from a `.env` file in development.

### General Configuration
-   `NODE_ENV`: Application environment (e.g., `development`, `production`).
-   `PORT`: HTTP server port (e.g., `4000`).

### Database (PostgreSQL)
-   `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PASSWORD`, `DB_PORT`.

### Redis
-   `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (optional).
-   `REDIS_CACHE_PREFIX` (optional, e.g., `iot_cache:`).
-   `CRITICAL_ACTION_STREAM_NAME` (e.g., `critical_actions_stream`).
-   `CRITICAL_ACTION_GROUP_NAME` (e.g., `critical_actions_group`).
-   `CRITICAL_ACTION_CONSUMER_NAME` (e.g., `consumer-1`).

### Authentication (JWT)
-   `JWT_SECRET`: Long, random secret string. **Critical for security.**
-   `JWT_EXPIRES_IN`: Token validity duration (e.g., `1h`, `7d`).

### MQTT Broker
-   `MQTT_BROKER_URL` (e.g., `mqtt://localhost:1883`).
-   `MQTT_USERNAME`, `MQTT_PASSWORD` (optional).

### Logging (Winston)
-   `LOG_LEVEL` (optional, default: `info`; e.g., `debug`).
-   `LOG_FILE_PATH` (optional, e.g., `/var/log/iot_app/app.log`).

### Note on `.env` File
For local development, place these in a `.env` file in the project root.
```dotenv
# Example .env structure
PORT=4000
DB_USER=myuser
DB_HOST=localhost
# ... etc.
JWT_SECRET=your_very_long_random_secret_string_here
```
Ensure actual secrets are strong and confidential.

## Testing Guide

Ensuring code quality and stability.

### Introduction
-   Framework: **Jest**.
-   API Testing: **Supertest**.

### Running Tests
Located in `__tests__` directory (e.g., `__tests__/server.test.js`).
-   `npm test`: Runs all test suites (`jest __tests__/server.test.js`).
-   `npm run test:watch`: Runs tests in watch mode (`jest __tests__/server.test.js --watch`).
-   `npm run coverage`: Generates code coverage report (`jest __tests__/server.test.js --coverage`).

### Types of Tests
-   **API Integration Tests**: Current focus, using Supertest to verify endpoint responses (status codes, bodies, headers) in `__tests__/server.test.js`.

### Contributing Tests
-   Write tests for new features and bug fixes.
-   Maintain existing tests when refactoring.
