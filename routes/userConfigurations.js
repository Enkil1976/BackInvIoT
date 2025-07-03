const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { protect } = require('../middleware/auth');

/**
 * @route GET /api/user-configurations
 * @desc Obtener la configuración activa del usuario autenticado
 * @access Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, config_name, config_data, created_at, updated_at 
       FROM user_configurations 
       WHERE user_id = $1 AND is_active = true 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Si no hay configuración, crear una por defecto
      const defaultConfig = {
        baseUrl: process.env.NODE_ENV === 'production' 
          ? 'https://proyectos-iot.onrender.com' 
          : 'http://localhost:4000',
        endpoints: {
          latest: '/api/latest',
          chart: '/api/chart',
          history: '/api/history',
          stats: '/api/stats'
        },
        tables: [
          {
            name: 'temhum1',
            label: 'Sensor Ambiental 1',
            fields: [
              {
                name: 'temperatura',
                label: 'Temperatura',
                unit: '°C',
                type: 'number',
                showInKPI: true,
                showInChart: true,
                showInStats: true,
                showInHistory: true,
                range: { min: 18, max: 25 },
                color: '#3B82F6'
              },
              {
                name: 'humedad',
                label: 'Humedad',
                unit: '%',
                type: 'number',
                showInKPI: true,
                showInChart: true,
                showInStats: true,
                showInHistory: true,
                range: { min: 30, max: 80 },
                color: '#10B981'
              }
            ]
          }
        ]
      };

      const createResult = await pool.query(
        `INSERT INTO user_configurations (user_id, config_name, config_data, is_active) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, config_name, config_data, created_at, updated_at`,
        [userId, 'Configuración por Defecto', JSON.stringify(defaultConfig), true]
      );

      return res.json({
        success: true,
        configuration: createResult.rows[0]
      });
    }

    res.json({
      success: true,
      configuration: result.rows[0]
    });

  } catch (error) {
    console.error('Error getting user configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la configuración del usuario'
    });
  }
});

/**
 * @route POST /api/user-configurations
 * @desc Crear o actualizar la configuración del usuario
 * @access Private
 */
router.post('/', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { configName, configData } = req.body;

    if (!configData) {
      return res.status(400).json({
        success: false,
        error: 'configData es requerido'
      });
    }

    // Validar que configData sea un objeto JSON válido
    if (typeof configData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'configData debe ser un objeto JSON válido'
      });
    }

    // Desactivar configuraciones anteriores del usuario
    await pool.query(
      'UPDATE user_configurations SET is_active = false WHERE user_id = $1',
      [userId]
    );

    // Crear nueva configuración activa
    const result = await pool.query(
      `INSERT INTO user_configurations (user_id, config_name, config_data, is_active) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, config_name, config_data, created_at, updated_at`,
      [userId, configName || 'Mi Configuración', JSON.stringify(configData), true]
    );

    res.json({
      success: true,
      message: 'Configuración guardada exitosamente',
      configuration: result.rows[0]
    });

  } catch (error) {
    console.error('Error saving user configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Error al guardar la configuración del usuario'
    });
  }
});

/**
 * @route PUT /api/user-configurations/:id
 * @desc Actualizar una configuración específica
 * @access Private
 */
router.put('/:id', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const configId = req.params.id;
    const { configName, configData } = req.body;

    if (!configData) {
      return res.status(400).json({
        success: false,
        error: 'configData es requerido'
      });
    }

    // Verificar que la configuración pertenece al usuario
    const checkResult = await pool.query(
      'SELECT id FROM user_configurations WHERE id = $1 AND user_id = $2',
      [configId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    // Actualizar la configuración
    const result = await pool.query(
      `UPDATE user_configurations 
       SET config_name = $1, config_data = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, config_name, config_data, created_at, updated_at`,
      [configName || 'Mi Configuración', JSON.stringify(configData), configId, userId]
    );

    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      configuration: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating user configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar la configuración del usuario'
    });
  }
});

/**
 * @route GET /api/user-configurations/all
 * @desc Obtener todas las configuraciones del usuario
 * @access Private
 */
router.get('/all', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, config_name, is_active, created_at, updated_at 
       FROM user_configurations 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      configurations: result.rows
    });

  } catch (error) {
    console.error('Error getting user configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener las configuraciones del usuario'
    });
  }
});

/**
 * @route POST /api/user-configurations/:id/activate
 * @desc Activar una configuración específica
 * @access Private
 */
router.post('/:id/activate', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const configId = req.params.id;

    // Verificar que la configuración pertenece al usuario
    const checkResult = await pool.query(
      'SELECT id FROM user_configurations WHERE id = $1 AND user_id = $2',
      [configId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    // Desactivar todas las configuraciones del usuario
    await pool.query(
      'UPDATE user_configurations SET is_active = false WHERE user_id = $1',
      [userId]
    );

    // Activar la configuración seleccionada
    const result = await pool.query(
      `UPDATE user_configurations 
       SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id, config_name, config_data, created_at, updated_at`,
      [configId, userId]
    );

    res.json({
      success: true,
      message: 'Configuración activada exitosamente',
      configuration: result.rows[0]
    });

  } catch (error) {
    console.error('Error activating user configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Error al activar la configuración del usuario'
    });
  }
});

/**
 * @route DELETE /api/user-configurations/:id
 * @desc Eliminar una configuración específica
 * @access Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const configId = req.params.id;

    // Verificar que la configuración pertenece al usuario
    const checkResult = await pool.query(
      'SELECT id, is_active FROM user_configurations WHERE id = $1 AND user_id = $2',
      [configId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    // No permitir eliminar la configuración activa si es la única
    if (checkResult.rows[0].is_active) {
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM user_configurations WHERE user_id = $1',
        [userId]
      );

      if (parseInt(countResult.rows[0].count) === 1) {
        return res.status(400).json({
          success: false,
          error: 'No se puede eliminar la única configuración activa'
        });
      }
    }

    // Eliminar la configuración
    await pool.query(
      'DELETE FROM user_configurations WHERE id = $1 AND user_id = $2',
      [configId, userId]
    );

    res.json({
      success: true,
      message: 'Configuración eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error deleting user configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar la configuración del usuario'
    });
  }
});

module.exports = router;