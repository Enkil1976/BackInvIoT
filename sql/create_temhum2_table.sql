-- Table for temhum2 sensor data (Invernadero structure)
CREATE TABLE IF NOT EXISTS temhum2 (
    id SERIAL PRIMARY KEY,
    temperatura REAL,
    humedad REAL,
    heatindex REAL,
    dewpoint REAL,
    rssi INTEGER,
    boot INTEGER,
    mem INTEGER,
    stats_tmin REAL,
    stats_tmax REAL,
    stats_tavg REAL,
    stats_hmin REAL,
    stats_hmax REAL,
    stats_havg REAL,
    stats_total INTEGER,
    stats_errors INTEGER,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_temhum2_received_at ON temhum2(received_at DESC);
