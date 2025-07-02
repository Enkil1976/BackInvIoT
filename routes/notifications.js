const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { protect: auth } = require('../middleware/auth');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');

// Middleware para logs de todas las rutas
router.use((req, res, next) => {
  logger.info(`[NotificationRoutes] ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * GET /api/notifications/rules
 * Obtener todas las reglas de notificación
 */
router.get('/rules', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, is_enabled, conditions, actions, priority, 
             last_triggered_at, created_at, updated_at
      FROM rules 
      ORDER BY priority ASC, name ASC
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener reglas de notificación'
    });
  }
});

/**
 * POST /api/notifications/rules
 * Crear nueva regla de notificación
 */
router.post('/rules', auth, async (req, res) => {
  try {
    const { name, description, is_enabled, conditions, actions, priority } = req.body;

    // Validaciones básicas
    if (!name || !conditions || !actions) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, condiciones y acciones son requeridos'
      });
    }

    const result = await pool.query(`
      INSERT INTO rules (name, description, is_enabled, conditions, actions, priority)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, description, is_enabled, conditions, actions, priority, created_at
    `, [
      name,
      description || '',
      is_enabled !== undefined ? is_enabled : true,
      JSON.stringify(conditions),
      JSON.stringify(actions),
      priority || 5
    ]);

    logger.info(`[NotificationRoutes] Rule created: ${name} (ID: ${result.rows[0].id})`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Regla creada exitosamente'
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error creating rule:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'Ya existe una regla con ese nombre'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error al crear regla de notificación'
    });
  }
});

/**
 * PUT /api/notifications/rules/:id
 * Actualizar regla de notificación
 */
router.put('/rules/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_enabled, conditions, actions, priority } = req.body;

    const result = await pool.query(`
      UPDATE rules 
      SET name = $1, description = $2, is_enabled = $3, conditions = $4, 
          actions = $5, priority = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING id, name, description, is_enabled, conditions, actions, priority, updated_at
    `, [
      name,
      description,
      is_enabled,
      JSON.stringify(conditions),
      JSON.stringify(actions),
      priority,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Regla no encontrada'
      });
    }

    logger.info(`[NotificationRoutes] Rule updated: ${name} (ID: ${id})`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Regla actualizada exitosamente'
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error updating rule:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar regla de notificación'
    });
  }
});

/**
 * DELETE /api/notifications/rules/:id
 * Eliminar regla de notificación
 */
router.delete('/rules/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM rules WHERE id = $1
      RETURNING name
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Regla no encontrada'
      });
    }

    logger.info(`[NotificationRoutes] Rule deleted: ${result.rows[0].name} (ID: ${id})`);

    res.json({
      success: true,
      message: 'Regla eliminada exitosamente'
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar regla de notificación'
    });
  }
});

/**
 * GET /api/notifications/contacts
 * Obtener configuración de contactos del usuario
 */
router.get('/contacts', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT username, notification_preferences
      FROM users 
      WHERE username = $1
    `, [req.user.username]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0].notification_preferences || {}
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener configuración de contactos'
    });
  }
});

/**
 * PUT /api/notifications/contacts
 * Actualizar configuración de contactos del usuario
 */
router.put('/contacts', auth, async (req, res) => {
  try {
    const { email, telegram_chat_id, whatsapp_phone, enabled_channels, notification_hours } = req.body;

    const preferences = {
      email: email || '',
      telegram_chat_id: telegram_chat_id || '',
      whatsapp_phone: whatsapp_phone || '',
      enabled_channels: enabled_channels || ['system_log'],
      notification_hours: notification_hours || { start: '08:00', end: '22:00' },
      severity_filter: ['high', 'medium', 'low']
    };

    const result = await pool.query(`
      UPDATE users 
      SET notification_preferences = $1
      WHERE username = $2
      RETURNING username, notification_preferences
    `, [JSON.stringify(preferences), req.user.username]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    logger.info(`[NotificationRoutes] Contacts updated for user: ${req.user.username}`);

    res.json({
      success: true,
      data: result.rows[0].notification_preferences,
      message: 'Configuración de contactos actualizada'
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error updating contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar configuración de contactos'
    });
  }
});

/**
 * GET /api/notifications/channels
 * Obtener canales de notificación disponibles
 */
router.get('/channels', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, is_active, configuration
      FROM notification_channels 
      ORDER BY name ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener canales de notificación'
    });
  }
});

/**
 * POST /api/notifications/test
 * Enviar notificación de prueba
 */
router.post('/test', auth, async (req, res) => {
  try {
    const { channel = 'system_log', message = 'Notificación de prueba' } = req.body;

    // Get user contact preferences to determine recipient target
    const userResult = await pool.query(
      'SELECT notification_preferences FROM users WHERE username = $1',
      [req.user.username]
    );

    let recipientTarget = req.user.username;
    
    if (userResult.rows.length > 0 && userResult.rows[0].notification_preferences) {
      const prefs = userResult.rows[0].notification_preferences;
      
      // Get the appropriate recipient target based on channel
      switch (channel) {
        case 'email':
          recipientTarget = prefs.email || 'admin@invernadero.com';
          break;
        case 'telegram':
          recipientTarget = prefs.telegram_chat_id || 'TU_CHAT_ID';
          break;
        case 'whatsapp':
          recipientTarget = prefs.whatsapp_phone || '+56912345678';
          break;
        default:
          recipientTarget = req.user.username;
      }
    }

    const testNotification = {
      subject: 'Prueba de Notificación - Sistema IoT',
      body: `🧪 **NOTIFICACIÓN DE PRUEBA**\n\n${message}\n\n📅 Enviado: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}\n👤 Usuario: ${req.user.username}\n📡 Canal: ${channel}\n🎯 Destino: ${recipientTarget}`,
      recipient_type: 'user',
      recipient_target: recipientTarget,
      priority: 5,
      originDetails: { channel: channel }
    };

    const result = await notificationService.sendNotification(testNotification);

    logger.info(`[NotificationRoutes] Test notification sent to ${req.user.username} via ${channel} (target: ${recipientTarget})`);

    res.json({
      success: true,
      message: `Notificación de prueba enviada exitosamente por ${channel} a ${recipientTarget}`,
      details: result
    });
  } catch (error) {
    logger.error('[NotificationRoutes] Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Error al enviar notificación de prueba'
    });
  }
});

module.exports = router;