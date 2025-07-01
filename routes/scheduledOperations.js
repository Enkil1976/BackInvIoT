const express = require('express');
const router = express.Router();
const scheduleService = require('../services/scheduleService');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

// POST /api/scheduled-operations - Create a new scheduled operation
router.post('/', protect, authorize('admin', 'editor'), async (req, res) => {
  try {
    const { device_id, action_name, cron_expression, execute_at } = req.body;
    // Basic validation: device_id, action_name, and one of cron_expression or execute_at must exist
    if (!device_id || !action_name || (!cron_expression && !execute_at)) {
      return res.status(400).json({
        error: 'Missing required fields: device_id, action_name, and either cron_expression or execute_at must be provided.'
      });
    }
    // Further validation (e.g., device_id is integer, action_name is valid, cron format if cronlib not used yet) can be added.

    const newSchedule = await scheduleService.createScheduledOperation(req.body);
    res.status(201).json(newSchedule);
  } catch (error) {
    logger.error('Error in POST /api/scheduled-operations:', { message: error.message, body: req.body, stack: error.stack });
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while creating scheduled operation' });
  }
});

// GET /api/scheduled-operations - Get all scheduled operations
router.get('/', protect, authorize('admin', 'editor', 'viewer'), async (req, res) => {
  try {
    // Convert query params for page and limit to integers if they exist, ensure they are positive
    const queryParams = { ...req.query };
    if (queryParams.page) {
        queryParams.page = parseInt(queryParams.page, 10);
        if (isNaN(queryParams.page) || queryParams.page < 1) {
            return res.status(400).json({ error: 'Page parameter must be a positive integer.'});
        }
    }
    if (queryParams.limit) {
        queryParams.limit = parseInt(queryParams.limit, 10);
        if (isNaN(queryParams.limit) || queryParams.limit < 1) {
            return res.status(400).json({ error: 'Limit parameter must be a positive integer.'});
        }
    }
     if (queryParams.deviceId) {
        queryParams.deviceId = parseInt(queryParams.deviceId, 10);
        if (isNaN(queryParams.deviceId)) {
            return res.status(400).json({ error: 'deviceId parameter must be an integer.'});
        }
    }
    if (queryParams.is_enabled !== undefined) {
        if (queryParams.is_enabled !== 'true' && queryParams.is_enabled !== 'false') {
            return res.status(400).json({ error: "is_enabled parameter must be 'true' or 'false'."});
        }
        queryParams.is_enabled = (queryParams.is_enabled === 'true');
    }


    const result = await scheduleService.getScheduledOperations(queryParams);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in GET /api/scheduled-operations:', { message: error.message, query: req.query, stack: error.stack });
    res.status(500).json({ error: 'Internal server error while fetching scheduled operations' });
  }
});

// GET /api/scheduled-operations/:id - Get a single scheduled operation by ID
router.get('/:id', protect, authorize('admin', 'editor', 'viewer'), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const schedule = await scheduleService.getScheduledOperationById(scheduleId);
    res.status(200).json(schedule);
  } catch (error) {
    logger.error(`Error in GET /api/scheduled-operations/${req.params.id}:`, { message: error.message, stack: error.stack });
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while fetching scheduled operation' });
  }
});

// PUT /api/scheduled-operations/:id - Update a scheduled operation
router.put('/:id', protect, authorize('admin', 'editor'), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body cannot be empty for update.' });
    }
    // Add specific field validation as needed
    const updatedSchedule = await scheduleService.updateScheduledOperation(scheduleId, req.body);
    res.status(200).json(updatedSchedule);
  } catch (error) {
    logger.error(`Error in PUT /api/scheduled-operations/${req.params.id}:`, { message: error.message, body: req.body, stack: error.stack });
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while updating scheduled operation' });
  }
});

// DELETE /api/scheduled-operations/:id - Delete a scheduled operation
router.delete('/:id', protect, authorize('admin', 'editor'), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const result = await scheduleService.deleteScheduledOperation(scheduleId);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error in DELETE /api/scheduled-operations/${req.params.id}:`, { message: error.message, stack: error.stack });
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while deleting scheduled operation' });
  }
});

module.exports = router;
