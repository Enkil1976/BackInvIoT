const express = require('express');
const router = express.Router();
const operationService = require('../services/operationService');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

// POST /api/operations - Record a new operation
router.post('/', protect, authorize(['admin', 'service_account']), async (req, res) => {
  try {
    const { serviceName, action, status, userId, deviceId, targetEntityType, targetEntityId, details } = req.body;

    // Core fields validation
    if (!serviceName || !action || !status) {
        logger.warn('Attempt to record operation with missing core fields (serviceName, action, status).', { body: req.body });
        return res.status(400).json({ error: 'Missing required fields: serviceName, action, status' });
    }

    const operationData = {
        userId: userId || req.user?.id, // Default to authenticated user if not specified and available
        deviceId,
        serviceName,
        action,
        targetEntityType,
        targetEntityId,
        status,
        details
    };

    const operationLog = await operationService.recordOperation(operationData);
    res.status(201).json(operationLog);
  } catch (error) {
    logger.error(`Error in POST /api/operations: ${error.message}`, { stack: error.stack, body: req.body });
    if (error.status) { // Handles 400 from service validation
        return res.status(error.status).json({ error: error.message });
    }
    // Default to 500 for other errors (e.g., database connection issues from service)
    res.status(500).json({ error: 'Internal server error while recording operation' });
  }
});

// GET /api/operations - Get operation logs
router.get('/', protect, authorize(['admin', 'auditor']), async (req, res) => {
  try {
    // Convert query params for page and limit to integers if they exist
    const queryParams = { ...req.query };
    if (queryParams.page) queryParams.page = parseInt(queryParams.page, 10);
    if (queryParams.limit) queryParams.limit = parseInt(queryParams.limit, 10);
    if (queryParams.userId) queryParams.userId = parseInt(queryParams.userId, 10);
    if (queryParams.deviceId) queryParams.deviceId = parseInt(queryParams.deviceId, 10);


    // Validate page and limit to be positive integers
    if (queryParams.page !== undefined && (!Number.isInteger(queryParams.page) || queryParams.page < 1)) {
        return res.status(400).json({ error: 'Page parameter must be a positive integer.' });
    }
    if (queryParams.limit !== undefined && (!Number.isInteger(queryParams.limit) || queryParams.limit < 1)) {
        return res.status(400).json({ error: 'Limit parameter must be a positive integer.' });
    }

    const result = await operationService.getOperations(queryParams);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error in GET /api/operations: ${error.message}`, { stack: error.stack, query: req.query });
    // Default to 500 as service layer should throw specific errors for bad input if necessary
    res.status(500).json({ error: 'Internal server error while fetching operation logs' });
  }
});

module.exports = router;
