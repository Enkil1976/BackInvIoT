-- Table for storing power monitoring data (voltage, current, power)
CREATE TABLE IF NOT EXISTS power_monitor_logs (
    id SERIAL PRIMARY KEY,
    monitored_device_id INTEGER NOT NULL,
    voltage REAL NOT NULL,
    current REAL NOT NULL,
    power REAL NOT NULL,
    sensor_timestamp TIMESTAMPTZ NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_monitored_device
        FOREIGN KEY(monitored_device_id)
        REFERENCES devices(id)
        ON DELETE CASCADE -- If the monitored device is deleted, its power logs are also deleted.
);

-- Index for faster queries on consumption history
CREATE INDEX IF NOT EXISTS idx_power_monitor_logs_device_id_received_at
ON power_monitor_logs (monitored_device_id, received_at DESC);

-- Optional: Index for sensor_timestamp if it's often queried
CREATE INDEX IF NOT EXISTS idx_power_monitor_logs_sensor_timestamp
ON power_monitor_logs (sensor_timestamp DESC);
