-- Table for storing rule definitions for the rules engine
CREATE TABLE IF NOT EXISTS rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,      -- User-friendly name for the rule
    description TEXT,                       -- Optional detailed description of the rule's purpose

    conditions JSONB NOT NULL,              -- JSONB structure defining the conditions for the rule to trigger
                                            -- Example: {"type": "AND", "clauses": [{"source_type": "device", "source_id": "temp_sensor_1_hw_id", "metric": "temperature", "operator": ">", "value": 30}]}
                                            -- Example: {"type": "OR", "clauses": [{"source_type": "time", "value": "sunset", "operator": "AFTER"}, {"source_type": "schedule", "source_id": 123, "metric": "status", "value": "triggered"}]}

    actions JSONB NOT NULL,                 -- JSONB array defining actions to take when conditions are met
                                            -- Example: [{"service": "deviceService", "method": "updateDeviceStatus", "target_device_id": "light_1_hw_id", "params": {"status": "on"}}]
                                            -- Example: [{"service": "notificationService", "method": "sendAlert", "params": {"message": "Temperature too high!", "recipient_user_id": 1}}]

    is_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Flag to enable or disable the rule
    priority INTEGER NOT NULL DEFAULT 0,      -- For ordering rule evaluation (e.g., higher value means higher priority)

    last_triggered_at TIMESTAMPTZ,            -- Timestamp of when the rule was last successfully triggered and its actions initiated

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_rules_is_enabled ON rules(is_enabled);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority DESC); -- Assuming higher number is higher priority
CREATE INDEX IF NOT EXISTS idx_rules_last_triggered_at ON rules(last_triggered_at DESC NULLS LAST);

-- Optional: GIN indexes for querying JSONB fields if specific paths are frequently used
-- CREATE INDEX IF NOT EXISTS idx_rules_conditions_gin ON rules USING GIN (conditions);
-- CREATE INDEX IF NOT EXISTS idx_rules_actions_gin ON rules USING GIN (actions);


-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column_rules()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rules_updated_at
    BEFORE UPDATE
    ON
        rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column_rules();

COMMENT ON TABLE rules IS 'Stores definitions for the rules engine, including conditions and actions.';
COMMENT ON COLUMN rules.name IS 'Unique, user-friendly name for identifying the rule.';
COMMENT ON COLUMN rules.conditions IS 'JSONB structure detailing the conditions that must be met for the rule to trigger. Structure needs to be parsed and evaluated by the rules engine.';
COMMENT ON COLUMN rules.actions IS 'JSONB array specifying one or more actions to be executed when the rule conditions are met. Each action typically defines a target service, method, and parameters.';
COMMENT ON COLUMN rules.is_enabled IS 'Allows temporarily disabling a rule without deleting it.';
COMMENT ON COLUMN rules.priority IS 'Determines the order of rule evaluation if multiple rules might trigger. Higher values typically indicate higher priority.';
COMMENT ON COLUMN rules.last_triggered_at IS 'Timestamp of the last time the rule''s actions were successfully initiated.';
