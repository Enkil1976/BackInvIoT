-- Configuración de zona horaria para Chile en PostgreSQL
-- Chile utiliza UTC-4 (CLT) en invierno y UTC-3 (CLST) en verano

-- Establecer zona horaria por defecto para la sesión
SET TIME ZONE 'America/Santiago';

-- Configurar zona horaria por defecto para la base de datos (requiere permisos de superusuario)
-- ALTER DATABASE invernadero_iot SET timezone = 'America/Santiago';

-- Verificar la configuración actual
SELECT 
    current_setting('TIMEZONE') as current_timezone,
    now() as current_time_chile,
    timezone('UTC', now()) as current_time_utc,
    extract(timezone_hour FROM now()) as timezone_offset_hours;

-- Crear función para obtener timestamp de Chile
CREATE OR REPLACE FUNCTION get_chile_timestamp()
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN timezone('America/Santiago', now());
END;
$$ LANGUAGE plpgsql;

-- Crear función para convertir UTC a Chile
CREATE OR REPLACE FUNCTION utc_to_chile(utc_time TIMESTAMPTZ)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN timezone('America/Santiago', utc_time);
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT get_chile_timestamp();
-- SELECT utc_to_chile('2024-01-15 10:30:00 UTC');

-- Comentarios sobre la zona horaria de Chile:
COMMENT ON FUNCTION get_chile_timestamp() IS 'Obtiene el timestamp actual en zona horaria de Chile (America/Santiago)';
COMMENT ON FUNCTION utc_to_chile(TIMESTAMPTZ) IS 'Convierte timestamp UTC a zona horaria de Chile';