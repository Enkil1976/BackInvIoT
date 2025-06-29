-- Add temperatura_agua column to calidad_agua for Invernadero data structure
ALTER TABLE calidad_agua
    ADD COLUMN IF NOT EXISTS temperatura_agua REAL;
