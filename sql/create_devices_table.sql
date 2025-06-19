-- Table for storing device information
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    device_id VARCHAR(255) UNIQUE, -- Hardware or protocol-specific ID
    type VARCHAR(100) NOT NULL,    -- E.g., 'relay', 'sensor_temp', 'actuator_pump'
    description TEXT,
    status VARCHAR(50) DEFAULT 'offline', -- E.g., 'online', 'offline', 'active', 'inactive', 'error'
    config JSONB,                          -- Device-specific settings (pin number, polling interval, etc.)
    room_id INTEGER,                       -- Optional: Foreign key to a 'rooms' table
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_room_id ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_devices_owner_user_id ON devices(owner_user_id); -- New index
CREATE INDEX IF NOT EXISTS idx_devices_last_seen_at ON devices(last_seen_at DESC);

-- Optional: Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE
    ON
        devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN devices.device_id IS 'Hardware-specific or protocol-specific unique identifier (e.g., MAC address, part of MQTT client ID)';
COMMENT ON COLUMN devices.type IS 'Categorization of the device (e.g., relay, sensor_temp, actuator_pump, etc.)';
COMMENT ON COLUMN devices.status IS 'Current operational status of the device (e.g., online, offline, active, inactive, error)';
COMMENT ON COLUMN devices.config IS 'JSONB field for device-specific configurations and settings';
COMMENT ON COLUMN devices.room_id IS 'Optional foreign key to link device to a specific room or location';
COMMENT ON COLUMN devices.owner_user_id IS 'Foreign key referencing the user who owns/manages this device.';
