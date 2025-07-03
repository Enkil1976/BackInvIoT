const express = require('express');
const router = express.Router();
const notificationTemplateService = require('../services/notificationTemplateService');
const { protect } = require('../middleware/auth');
const logger = require('../config/logger');

/**
 * @route   GET /api/notification-templates/variables
 * @desc    Get available template variables
 * @access  Protected (authenticated users)
 */
router.get('/variables', protect, async (req, res) => {
  try {
    const variables = await notificationTemplateService.getAvailableVariables();
    
    res.json({
      success: true,
      data: variables
    });
  } catch (error) {
    logger.error('[NotificationTemplate API] Error getting available variables:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener variables disponibles',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/notification-templates/test
 * @desc    Test template processing with sample data
 * @access  Protected (authenticated users)
 */
router.post('/test', protect, async (req, res) => {
  try {
    const { template, context } = req.body;
    
    if (!template) {
      return res.status(400).json({
        success: false,
        message: 'Template es requerido'
      });
    }

    const processedMessage = await notificationTemplateService.processTemplate(template, context || {});
    const variables = notificationTemplateService.extractVariables(template);
    
    res.json({
      success: true,
      data: {
        originalTemplate: template,
        processedMessage,
        variables,
        context: context || {}
      }
    });
  } catch (error) {
    logger.error('[NotificationTemplate API] Error testing template:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar plantilla',
      error: error.message
    });
  }
});

module.exports = router;