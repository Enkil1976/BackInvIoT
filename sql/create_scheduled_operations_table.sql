-- Table for storing scheduled operations for devices
CREATE TABLE IF NOT EXISTS scheduled_operations (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL,
    action_name VARCHAR(100) NOT NULL,       -- E.g., 'set_status', 'set_config', 'custom_command'
    action_params JSONB,                     -- Parameters for the action, e.g., {"status": "on"}, {"config_key": "target_temp", "value": 25}

    -- Scheduling options (at least one of cron_expression or execute_at should typically be defined)
    cron_expression VARCHAR(100),            -- For recurring tasks, e.g., '0 0 * * *' for daily at midnight
    execute_at TIMESTAMPTZ,                  -- For one-time tasks
    -- repeat_interval VARCHAR(100),         -- Alternative for simple repeats, e.g., '1 hour', '30 minutes'. Requires app-level parsing.
                                             -- For simplicity, focusing on cron_expression and execute_at for now.

    -- Execution tracking
    last_executed_at TIMESTAMPTZ,
    next_execution_at TIMESTAMPTZ,           -- Calculated timestamp for the next run, indexed for scheduler

    is_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- To enable/disable the schedule
    description TEXT,                        -- Optional user-friendly description

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_device
        FOREIGN KEY(device_id)
        REFERENCES devices(id)
        ON DELETE CASCADE, -- If the device is deleted, its scheduled operations are also deleted.

    CONSTRAINT chk_schedule_timing
        CHECK (cron_expression IS NOT NULL OR execute_at IS NOT NULL) -- Ensure some form of scheduling is defined
);

-- Indexes for efficient querying by the scheduler and for management
CREATE INDEX IF NOT EXISTS idx_scheduled_operations_next_execution_at_is_enabled
ON scheduled_operations (next_execution_at ASC NULLS FIRST, is_enabled); -- Scheduler primarily queries this

CREATE INDEX IF NOT EXISTS idx_scheduled_operations_device_id ON scheduled_operations(device_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_operations_action_name ON scheduled_operations(action_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_operations_is_enabled ON scheduled_operations(is_enabled);


-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column_scheduled_operations()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scheduled_operations_updated_at
    BEFORE UPDATE
    ON
        scheduled_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column_scheduled_operations();

COMMENT ON TABLE scheduled_operations IS 'Stores tasks to be executed on devices at specific times or intervals.';
COMMENT ON COLUMN scheduled_operations.action_name IS 'Identifier for the action to be performed on the device (e.g., set_status, update_config).';
COMMENT ON COLUMN scheduled_operations.action_params IS 'JSON object containing parameters for the specified action.';
COMMENT ON COLUMN scheduled_operations.cron_expression IS 'Cron expression defining recurrence for the task. See https://crontab.guru/';
COMMENT ON COLUMN scheduled_operations.execute_at IS 'Specific timestamp for one-time task execution.';
COMMENT ON COLUMN scheduled_operations.next_execution_at IS 'Timestamp of the next scheduled execution; used by the scheduler to pick up tasks.';
COMMENT ON COLUMN scheduled_operations.is_enabled IS 'Flag to enable or disable the scheduled operation without deleting it.';
