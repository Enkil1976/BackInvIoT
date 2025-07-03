-- Tabla para almacenar configuraciones de sistema por usuario
-- Permite que cada usuario tenga su propia configuración de endpoints, sensores, etc.

CREATE TABLE IF NOT EXISTS user_configurations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    config_name VARCHAR(255) NOT NULL DEFAULT 'Mi Configuración',
    config_data JSONB NOT NULL, -- Almacena toda la configuración como JSON
    is_active BOOLEAN DEFAULT true, -- Si esta configuración está activa para el usuario
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_user_configurations_user_id ON user_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_configurations_active ON user_configurations(user_id, is_active) WHERE is_active = true;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_user_configurations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_configurations_timestamp
    BEFORE UPDATE ON user_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_configurations_timestamp();

-- Comentarios para documentar la tabla
COMMENT ON TABLE user_configurations IS 'Configuraciones personalizadas del sistema por usuario';
COMMENT ON COLUMN user_configurations.user_id IS 'ID del usuario propietario de la configuración';
COMMENT ON COLUMN user_configurations.config_name IS 'Nombre descriptivo de la configuración';
COMMENT ON COLUMN user_configurations.config_data IS 'Datos de configuración en formato JSON (endpoints, tablas, campos, etc.)';
COMMENT ON COLUMN user_configurations.is_active IS 'Indica si esta configuración está activa para el usuario';

-- Insertar configuración por defecto para usuarios existentes
INSERT INTO user_configurations (user_id, config_name, config_data, is_active)
SELECT 
    id as user_id,
    'Configuración por Defecto' as config_name,
    '{
        "baseUrl": "https://proyectos-iot.onrender.com",
        "endpoints": {
            "latest": "/api/latest",
            "chart": "/api/chart", 
            "history": "/api/history",
            "stats": "/api/stats"
        },
        "tables": [
            {
                "name": "temhum1",
                "label": "Sensor Ambiental 1",
                "fields": [
                    {
                        "name": "temperatura",
                        "label": "Temperatura",
                        "unit": "°C",
                        "type": "number",
                        "showInKPI": true,
                        "showInChart": true,
                        "showInStats": true,
                        "showInHistory": true,
                        "range": {"min": 18, "max": 25},
                        "color": "#3B82F6"
                    },
                    {
                        "name": "humedad",
                        "label": "Humedad", 
                        "unit": "%",
                        "type": "number",
                        "showInKPI": true,
                        "showInChart": true,
                        "showInStats": true,
                        "showInHistory": true,
                        "range": {"min": 30, "max": 80},
                        "color": "#10B981"
                    }
                ]
            }
        ]
    }'::jsonb as config_data,
    true as is_active
FROM users 
WHERE NOT EXISTS (
    SELECT 1 FROM user_configurations uc WHERE uc.user_id = users.id
);

-- Verificar que la tabla se creó correctamente
SELECT 
    'user_configurations table created successfully' as status,
    COUNT(*) as default_configs_created
FROM user_configurations;