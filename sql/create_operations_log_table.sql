-- Table for logging operations and significant events across services
CREATE TABLE IF NOT EXISTS operations_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,                      -- Optional: ID of the user who initiated the operation
    device_id INTEGER,                    -- Optional: ID of the device involved in the operation
    service_name VARCHAR(100) NOT NULL,   -- E.g., 'DeviceService', 'ScheduleService', 'AuthService'
    action VARCHAR(255) NOT NULL,         -- E.g., 'device_create', 'device_status_update', 'login_success'
    target_entity_type VARCHAR(100),      -- Optional: Type of the primary entity targeted by the action (e.g., 'device', 'user', 'rule')
    target_entity_id VARCHAR(255),        -- Optional: ID of the primary entity targeted (if not user_id or device_id)
    status VARCHAR(50) NOT NULL,          -- E.g., 'SUCCESS', 'FAILURE', 'PENDING', 'INFO'
    details JSONB,                        -- Additional structured information (parameters, old/new values, error messages)

    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL, -- Keep log even if user is deleted, but nullify user_id

    CONSTRAINT fk_device
        FOREIGN KEY(device_id)
        REFERENCES devices(id)
        ON DELETE SET NULL -- Keep log even if device is deleted, but nullify device_id
);

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_operations_log_timestamp ON operations_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operations_log_user_id ON operations_log(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_log_device_id ON operations_log(device_id);
CREATE INDEX IF NOT EXISTS idx_operations_log_service_name ON operations_log(service_name);
CREATE INDEX IF NOT EXISTS idx_operations_log_action ON operations_log(action);
CREATE INDEX IF NOT EXISTS idx_operations_log_status ON operations_log(status);
CREATE INDEX IF NOT EXISTS idx_operations_log_target_entity ON operations_log(target_entity_type, target_entity_id);

COMMENT ON TABLE operations_log IS 'Logs significant operations and events from various services for auditing and debugging.';
COMMENT ON COLUMN operations_log.user_id IS 'ID of the user who initiated or is associated with the operation (if applicable).';
COMMENT ON COLUMN operations_log.device_id IS 'ID of the device involved in or targeted by the operation (if applicable).';
COMMENT ON COLUMN operations_log.service_name IS 'Name of the service or module that generated the log entry.';
COMMENT ON COLUMN operations_log.action IS 'Specific action performed (e.g., create_device, login, rule_triggered).';
COMMENT ON COLUMN operations_log.target_entity_type IS 'Type of the main entity this operation pertains to (e.g., "device", "user", "schedule").';
COMMENT ON COLUMN operations_log.target_entity_id IS 'Identifier for the main entity, if not covered by user_id or device_id.';
COMMENT ON COLUMN operations_log.status IS 'Outcome or state of the operation (SUCCESS, FAILURE, INFO, PENDING).';
COMMENT ON COLUMN operations_log.details IS 'JSONB field for storing structured details relevant to the operation (e.g., request parameters, changes, error info).';
