-- Insert example notification rules for temperature and humidity thresholds
-- These rules will automatically send notifications when sensor values exceed thresholds

-- Rule 1: High Temperature Alert (TemHum1)
INSERT INTO rules (name, description, is_enabled, conditions, actions, priority) 
VALUES (
  'Alerta: Temperatura Alta TemHum1',
  'Envía notificación cuando la temperatura del sensor TemHum1 supera los 30°C',
  true,
  '{
    "type": "AND",
    "clauses": [
      {
        "source_type": "sensor",
        "source_id": "temhum1",
        "metric": "temperatura",
        "operator": ">",
        "value": 30
      }
    ]
  }',
  '[
    {
      "service": "notificationService",
      "method": "sendAlert",
      "params": {
        "message": "alerta de temperatura: la temperatura actual del sensor TemHum1 está por encima del umbral (>30°C)",
        "recipient_user_id": 1
      }
    }
  ]',
  1
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions,
  updated_at = NOW();

-- Rule 2: Low Temperature Alert (TemHum1)
INSERT INTO rules (name, description, is_enabled, conditions, actions, priority) 
VALUES (
  'Alerta: Temperatura Baja TemHum1',
  'Envía notificación cuando la temperatura del sensor TemHum1 baja de 10°C',
  true,
  '{
    "type": "AND",
    "clauses": [
      {
        "source_type": "sensor",
        "source_id": "temhum1",
        "metric": "temperatura",
        "operator": "<",
        "value": 10
      }
    ]
  }',
  '[
    {
      "service": "notificationService",
      "method": "sendAlert",
      "params": {
        "message": "alerta de temperatura: la temperatura actual del sensor TemHum1 está por debajo del umbral (<10°C)",
        "recipient_user_id": 1
      }
    }
  ]',
  1
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions,
  updated_at = NOW();

-- Rule 3: High Humidity Alert (TemHum1)
INSERT INTO rules (name, description, is_enabled, conditions, actions, priority) 
VALUES (
  'Alerta: Humedad Alta TemHum1',
  'Envía notificación cuando la humedad del sensor TemHum1 supera el 80%',
  true,
  '{
    "type": "AND",
    "clauses": [
      {
        "source_type": "sensor",
        "source_id": "temhum1",
        "metric": "humedad",
        "operator": ">",
        "value": 80
      }
    ]
  }',
  '[
    {
      "service": "notificationService",
      "method": "sendAlert",
      "params": {
        "message": "alerta de humedad: la humedad actual del sensor TemHum1 está por encima del umbral (>80%)",
        "recipient_user_id": 1
      }
    }
  ]',
  2
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions,
  updated_at = NOW();

-- Rule 4: High Temperature Alert (TemHum2)
INSERT INTO rules (name, description, is_enabled, conditions, actions, priority) 
VALUES (
  'Alerta: Temperatura Alta TemHum2',
  'Envía notificación cuando la temperatura del sensor TemHum2 supera los 30°C',
  true,
  '{
    "type": "AND",
    "clauses": [
      {
        "source_type": "sensor",
        "source_id": "temhum2",
        "metric": "temperatura",
        "operator": ">",
        "value": 30
      }
    ]
  }',
  '[
    {
      "service": "notificationService",
      "method": "sendAlert",
      "params": {
        "message": "alerta de temperatura: la temperatura actual del sensor TemHum2 está por encima del umbral (>30°C)",
        "recipient_user_id": 1
      }
    }
  ]',
  1
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions,
  updated_at = NOW();

-- Rule 5: Water Quality pH Alert
INSERT INTO rules (name, description, is_enabled, conditions, actions, priority) 
VALUES (
  'Alerta: pH del Agua Fuera de Rango',
  'Envía notificación cuando el pH del agua está fuera del rango 6.0-8.0',
  true,
  '{
    "type": "OR",
    "clauses": [
      {
        "source_type": "sensor",
        "source_id": "agua",
        "metric": "ph",
        "operator": "<",
        "value": 6.0
      },
      {
        "source_type": "sensor",
        "source_id": "agua",
        "metric": "ph",
        "operator": ">",
        "value": 8.0
      }
    ]
  }',
  '[
    {
      "service": "notificationService",
      "method": "sendAlert",
      "params": {
        "message": "alerta de calidad del agua: el pH actual está fuera del rango seguro (6.0-8.0)",
        "recipient_user_id": 1
      }
    }
  ]',
  1
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions,
  updated_at = NOW();

COMMENT ON TABLE rules IS 'Rules with automatic notification actions that send alerts to n8n when sensor thresholds are exceeded';