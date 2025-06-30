# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
npm start                    # Production server
npm run dev                  # Development with hot reload (if available)
```

### Testing
```bash
npm test                     # Run all tests
npm run test:watch          # Watch mode for tests
npm run coverage            # Test coverage report
npm run test:mqtt           # Test MQTT connectivity
npm run test:notification   # Test notification system
```

### Diagnostic Tools
```bash
npm run diagnose:mqtt       # Diagnose MQTT system issues
npm run simulate:mqtt       # Generate test MQTT data
```

### Database Setup
Execute SQL files in order:
```bash
psql invernadero_iot < sql/create_users_table.sql
psql invernadero_iot < sql/create_devices_table.sql
psql invernadero_iot < sql/create_temhum1_table.sql
psql invernadero_iot < sql/create_temhum2_table.sql
psql invernadero_iot < sql/create_calidad_agua_table.sql
psql invernadero_iot < sql/create_power_monitor_logs_table.sql
psql invernadero_iot < sql/create_rules_table.sql
psql invernadero_iot < sql/create_scheduled_operations_table.sql
psql invernadero_iot < sql/create_notifications_tables.sql
```

## High-Level Architecture

### Core System Flow
1. **MQTT Data Ingestion**: `mqttService.js` receives sensor data via MQTT topics (`Invernadero/[SensorID]/[DataType]`)
2. **Dual Storage**: Data stored in PostgreSQL (persistence) and Redis (real-time cache + history)
3. **API Layer**: Express routes serve data with role-based authentication (JWT)
4. **Real-time Updates**: WebSocket server broadcasts events to subscribed clients
5. **Automation**: Rules engine evaluates conditions and triggers actions via queue system

### Key Architectural Patterns

#### Service Layer Architecture
- **Services** (`services/`) contain business logic and database operations
- **Routes** (`routes/`) handle HTTP requests and delegate to services
- **Middleware** (`middleware/`) provides cross-cutting concerns (auth, cache, validation)

#### MQTT Message Processing Pipeline
```
MQTT Message → mqttService.js → {
  ├── Parse topic structure (Invernadero/[ID]/[Type])
  ├── Validate and transform payload
  ├── Store in PostgreSQL (permanent record)
  ├── Update Redis cache (latest values + history lists)
  └── Emit WebSocket events (real-time updates)
}
```

#### Authentication & Authorization Flow
- JWT tokens generated in `authService.js`
- Middleware `auth.js` validates tokens and extracts user context
- Role-based access control: admin > editor > operator > viewer
- Device ownership concept: users can own specific devices for targeted notifications

#### Queue-Based Action Processing
- Critical actions queued via `queueService.js` (Redis Streams)
- `criticalActionWorker.js` processes actions with retry logic
- Failed actions moved to Dead Letter Queue (DLQ) for admin review
- Used by rules engine and scheduled operations

### Data Models & Relationships

#### Sensor Data Tables
- `temhum1`, `temhum2`: Temperature/humidity sensors with stats
- `calidad_agua`: Water quality (pH, EC, PPM, water temperature)
- `power_monitor_logs`: Power consumption linked to monitored devices

#### Management Tables
- `devices`: IoT device registry with config JSON and ownership
- `users`: Authentication with roles
- `rules`: Automation rules with JSON conditions/actions
- `scheduled_operations`: Cron-based device operations
- `notifications`: Alert system with channels

#### Redis Cache Structure
```
sensor_latest:[sensor_id]           # Hash of current values
sensor_history:[sensor_id]:[metric] # List of timestamped values (LIFO)
```

### WebSocket Real-time System
- Authentication required via JWT query parameter
- Room-based subscriptions:
  - `sensor_latest:[sensor_id]` - sensor data updates
  - `device_events:[device_id]` - device-specific events
  - `operations_log:new` - new operation logs
- Targeted messaging: device owners receive `owned_device_update` events
- Admin-only events: `admin_device_status_alert`

### Rules Engine Architecture
Located in `services/rulesEngine/`:
- **Evaluators** (`evaluators/`) assess conditions against current data
- **Context Cache** (`utils/contextCache.js`) optimizes data fetching
- **Data Fetcher** (`utils/dataFetcher.js`) retrieves sensor/device state
- Rules triggered by scheduled evaluation and real-time sensor updates

## Environment Configuration

### Required Variables
```bash
PG_URI=postgresql://user:pass@host:port/dbname
REDIS_HOST=localhost
REDIS_PORT=6379
MQTT_BROKER_URL=mqtt://broker:1883
JWT_SECRET=your_secret_key
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### MQTT Topic Structure
```
Invernadero/
├── TemHum1/data     # Temperature/humidity sensor 1
├── TemHum2/data     # Temperature/humidity sensor 2
├── Agua/data        # Multi-parameter water quality
├── Agua/Temperatura # Water temperature only
└── [DeviceID]/data  # Power sensors by hardware ID
```

## Development Guidelines

### Adding New Sensor Types
1. Create SQL table in `sql/` directory
2. Add topic parsing logic in `mqttService.js` `handleIncomingMessage()`
3. Update Redis caching patterns for real-time data
4. Add validation middleware if needed
5. Create API routes in `routes/data.js` for data access

### Extending the Rules Engine
1. Add new evaluator in `services/rulesEngine/evaluators/`
2. Register evaluator in `services/rulesEngine/evaluators/index.js`
3. Update condition validation in `services/rulesEngine/utils/validation.js`
4. Test with example rules via API

### WebSocket Event Broadcasting
Use `req.io` or service-level event emitters:
```javascript
// Broadcast to all
req.io.emit('event_type', payload);

// Broadcast to room
req.io.to('room_name').emit('event_type', payload);

// Targeted to user role
req.io.to('admin_users').emit('admin_event', payload);
```

### Database Migrations
- Add new SQL files to `sql/` directory
- Use descriptive filenames with version/date prefixes
- Include both CREATE and ALTER statements as needed
- Update this file with new setup commands

## Testing Sensor Data

### Simulate MQTT Data
```bash
# Use built-in simulator
npm run simulate:mqtt

# Or publish manually with mosquitto_pub
mosquitto_pub -h broker.emqx.io -t "Invernadero/TemHum1/data" \
  -m '{"temperatura":24.5,"humedad":65,"heatindex":26,"dewpoint":18,"rssi":-45,"stats":{"tmin":20,"tmax":28,"tavg":24,"hmin":60,"hmax":70,"havg":65,"total":100,"errors":0},"boot":1,"mem":45000}'
```

### API Testing with Authentication
```bash
# Login to get JWT
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# Use JWT for protected routes
curl -H "Authorization: Bearer JWT_TOKEN" \
  http://localhost:4000/api/latest/temhum1
```