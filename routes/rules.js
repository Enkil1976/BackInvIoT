const express = require('express');
const router = express.Router();
const rulesService = require('../services/rulesService');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

// POST /api/rules - Create a new rule
router.post('/', protect, authorize(['admin', 'editor']), async (req, res) => {
  try {
    const { name, conditions, actions } = req.body;
    if (!name || !conditions || !actions) {
      return res.status(400).json({
        error: 'Missing required fields: name, conditions, and actions must be provided.'
      });
    }
    // Add more specific validation for conditions and actions structure if needed

    const newRule = await rulesService.createRule(req.body);
    res.status(201).json(newRule);
  } catch (error) {
    logger.error('Error in POST /api/rules:', { message: error.message, body: req.body, stack: error.stack });
    if (error.status) { // Catches 400 (validation) or 409 (conflict) from service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while creating rule' });
  }
});

// GET /api/rules - Get all rules
router.get('/', protect, authorize(['admin', 'editor', 'viewer']), async (req, res) => {
  try {
    const queryParams = { ...req.query };
    if (queryParams.page) queryParams.page = parseInt(queryParams.page, 10);
    if (queryParams.limit) queryParams.limit = parseInt(queryParams.limit, 10);
    if (queryParams.priority) queryParams.priority = parseInt(queryParams.priority, 10);

    if ((queryParams.page !== undefined && (isNaN(queryParams.page) || queryParams.page < 1)) ||
        (queryParams.limit !== undefined && (isNaN(queryParams.limit) || queryParams.limit < 1)) ||
        (queryParams.priority !== undefined && isNaN(queryParams.priority))) {
        return res.status(400).json({ error: 'Invalid pagination or priority parameters.' });
    }

    if (queryParams.is_enabled !== undefined) {
        if (queryParams.is_enabled !== 'true' && queryParams.is_enabled !== 'false') {
            return res.status(400).json({ error: "is_enabled parameter must be 'true' or 'false'."});
        }
        queryParams.is_enabled = (queryParams.is_enabled === 'true');
    }

    const result = await rulesService.getRules(queryParams);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in GET /api/rules:', { message: error.message, query: req.query, stack: error.stack });
    res.status(500).json({ error: 'Internal server error while fetching rules' });
  }
});

// GET /api/rules/:id - Get a single rule by ID
router.get('/:id', protect, authorize(['admin', 'editor', 'viewer']), async (req, res) => {
  try {
    const rule = await rulesService.getRuleById(req.params.id);
    res.status(200).json(rule);
  } catch (error) {
    logger.error(`Error in GET /api/rules/${req.params.id}:`, { message: error.message, stack: error.stack });
    if (error.status) { // Catches 400 or 404 from service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while fetching rule' });
  }
});

// PUT /api/rules/:id - Update a rule
router.put('/:id', protect, authorize(['admin', 'editor']), async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body cannot be empty for update.' });
    }
    const updatedRule = await rulesService.updateRule(req.params.id, req.body);
    res.status(200).json(updatedRule);
  } catch (error) {
    logger.error(`Error in PUT /api/rules/${req.params.id}:`, { message: error.message, body: req.body, stack: error.stack });
    if (error.status) { // Catches 400, 404, 409 from service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while updating rule' });
  }
});

// DELETE /api/rules/:id - Delete a rule
router.delete('/:id', protect, authorize(['admin', 'editor']), async (req, res) => {
  try {
    const result = await rulesService.deleteRule(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error in DELETE /api/rules/${req.params.id}:`, { message: error.message, stack: error.stack });
    if (error.status) { // Catches 400 or 404 from service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while deleting rule' });
  }
});

module.exports = router;
