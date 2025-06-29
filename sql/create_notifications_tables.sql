-- Tabla para tracking de notificaciones
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    recipient_type VARCHAR(50) NOT NULL,
    recipient_target VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP NULL,
    failed_at TIMESTAMP NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    origin_service VARCHAR(100),
    origin_details JSONB DEFAULT '{}'::jsonb
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_target);

-- Tabla para plantillas de notificación
CREATE TABLE IF NOT EXISTS notification_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    channels TEXT[] NOT NULL DEFAULT '{}',
    priority INTEGER DEFAULT 5,
    variables JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para plantillas
CREATE INDEX IF NOT EXISTS idx_notification_templates_name ON notification_templates(name);
CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON notification_templates(is_active);

-- Tabla para configuración de canales
CREATE TABLE IF NOT EXISTS notification_channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    webhook_url TEXT,
    auth_token TEXT,
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_template JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para canales
CREATE INDEX IF NOT EXISTS idx_notification_channels_name ON notification_channels(name);
CREATE INDEX IF NOT EXISTS idx_notification_channels_active ON notification_channels(is_active);

-- Tabla para estadísticas de rate limiting
CREATE TABLE IF NOT EXISTS notification_rate_limits (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(50) NOT NULL,
    identifier VARCHAR(255) NOT NULL, -- recipient or global
    minute_key VARCHAR(20) NOT NULL,  -- YYYY-MM-DD-HH-MM
    hour_key VARCHAR(20) NOT NULL,    -- YYYY-MM-DD-HH
    day_key VARCHAR(20) NOT NULL,     -- YYYY-MM-DD
    minute_count INTEGER DEFAULT 0,
    hour_count INTEGER DEFAULT 0,
    day_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel, identifier, minute_key)
);

-- Índices para rate limiting
CREATE INDEX IF NOT EXISTS idx_rate_limits_channel_id ON notification_rate_limits(channel, identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_minute_key ON notification_rate_limits(minute_key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_hour_key ON notification_rate_limits(hour_key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_day_key ON notification_rate_limits(day_key);

-- Insertar configuraciones de canales por defecto
INSERT INTO notification_channels (name, webhook_url, auth_token, configuration, payload_template) VALUES 
('email', 'https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f', 'IoT_InvernaderoSystem_2025_SuperSecureKey_32chars_minimum', 
 '{"content_type": "application/json", "timeout": 30000}'::jsonb,
 '{"channel": "email", "to": "{{recipient_target}}", "subject": "{{subject}}", "message": "{{body}}", "priority": "{{priority}}"}'::jsonb),
 
('telegram', 'https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f', 'IoT_InvernaderoSystem_2025_SuperSecureKey_32chars_minimum',
 '{"content_type": "application/json", "timeout": 30000}'::jsonb,
 '{"channel": "telegram", "chat_id": "{{recipient_target}}", "message": "{{subject}}\n\n{{body}}", "priority": "{{priority}}"}'::jsonb),
 
('whatsapp', 'https://n8n-n8n.2h4eh9.easypanel.host/webhook/131ed66b-7e4e-4352-a680-a81f4a2dec4f', 'IoT_InvernaderoSystem_2025_SuperSecureKey_32chars_minimum',
 '{"content_type": "application/json", "timeout": 30000}'::jsonb,
 '{"channel": "whatsapp", "phone": "{{recipient_target}}", "message": "{{subject}}\n\n{{body}}", "priority": "{{priority}}"}'::jsonb),
 
('websocket', '', '',
 '{"broadcast_type": "room", "timeout": 5000}'::jsonb,
 '{"type": "notification", "channel": "websocket", "recipient": "{{recipient_target}}", "data": {"subject": "{{subject}}", "body": "{{body}}", "priority": "{{priority}}"}}'::jsonb),
 
('system_log', '', '',
 '{"log_level": "info"}'::jsonb,
 '{"channel": "system_log", "subject": "{{subject}}", "body": "{{body}}", "recipient": "{{recipient_target}}"}'::jsonb)

ON CONFLICT (name) DO UPDATE SET
    webhook_url = EXCLUDED.webhook_url,
    auth_token = EXCLUDED.auth_token,
    configuration = EXCLUDED.configuration,
    payload_template = EXCLUDED.payload_template,
    updated_at = NOW();

-- Insertar plantillas por defecto
INSERT INTO notification_templates (name, subject_template, body_template, channels, priority) VALUES 
('dlq_alert', 
 'ALERTA: Cola de Trabajo Crítico - {{streamName}}',
 E'🚨 **ALERTA DEL SISTEMA**\n\nLa cola de trabajo crítico \'{{streamName}}\' ha excedido el límite configurado.\n\n📊 **Detalles:**\n- Tamaño actual: {{currentSize}}\n- Límite configurado: {{threshold}}\n- Hora del evento: {{timestamp}}\n\n🔧 **Acción requerida:** Revisar y procesar mensajes pendientes.',
 ARRAY['email', 'telegram'], 1),

('sensor_alert',
 'Alerta de Sensor - {{sensorName}}',
 E'⚠️ **ALERTA DE SENSOR:**\n\nEl sensor {{sensorName}} ha reportado valores fuera del rango normal.\n\n📊 **Valores:**\n- Valor actual: {{currentValue}}\n- Rango normal: {{minValue}} - {{maxValue}}\n- Ubicación: {{location}}\n- Timestamp: {{timestamp}}',
 ARRAY['whatsapp', 'email'], 2),

('rule_triggered',
 'Regla Activada - {{ruleName}}',
 E'🔔 **REGLA ACTIVADA:**\n\nLa regla \'{{ruleName}}\' se ha activado.\n\n📋 **Detalles:**\n- Condición: {{condition}}\n- Valor detectado: {{value}}\n- Dispositivo: {{deviceName}}\n- Timestamp: {{timestamp}}\n\n🎯 **Acción ejecutada:** {{actionTaken}}',
 ARRAY['telegram', 'websocket'], 3),

('system_info',
 'Información del Sistema - {{title}}',
 E'ℹ️ **INFORMACIÓN DEL SISTEMA:**\n\n{{message}}\n\n📅 **Timestamp:** {{timestamp}}',
 ARRAY['system_log'], 5),

('scheduled_reminder',
 'Recordatorio Programado - {{title}}',
 E'⏰ **RECORDATORIO:**\n\n{{message}}\n\n📅 **Programado para:** {{scheduledTime}}\n📍 **Relacionado con:** {{relatedEntity}}',
 ARRAY['email', 'telegram'], 4)

ON CONFLICT (name) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    channels = EXCLUDED.channels,
    priority = EXCLUDED.priority,
    updated_at = NOW();
