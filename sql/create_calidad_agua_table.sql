-- Table for calidad_agua sensor data (Invernadero structure)
CREATE TABLE IF NOT EXISTS calidad_agua (
    id SERIAL PRIMARY KEY,
    ph REAL,
    ec REAL,
    ppm REAL,
    temperatura_agua REAL, -- New column for water temperature
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_calidad_agua_received_at ON calidad_agua(received_at DESC);
