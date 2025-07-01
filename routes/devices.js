const express = require('express');
const router = express.Router();
const deviceService = require('../services/deviceService');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

// POST /api/devices - Create a new device
router.post('/', protect, authorize('admin', 'editor'), async (req, res) => {
  try {
    const { name, device_id, type, description, status, config, room_id } = req.body;
    // Basic validation
    if (!name || !device_id || !type) {
        logger.warn('Attempt to create device with missing required fields (name, device_id, type).');
        return res.status(400).json({ error: 'Missing required fields: name, device_id, type' });
    }
    // More specific validation can be added here (e.g., using a library like Joi or express-validator)
    // For example, check type against a list of allowed types, validate config structure etc.

    const newDevice = await deviceService.createDevice({ name, device_id, type, description, status, config, room_id });
    res.status(201).json(newDevice);
  } catch (error) {
    logger.error(`Error in POST /api/devices: ${error.message}`, { stack: error.stack, body: req.body });
    if (error.status) {
        return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while creating device' });
  }
});

// GET /api/devices/:id/consumption-history - Get device consumption history
router.get('/:id/consumption-history', protect, async (req, res) => {
  try {
    const history = await deviceService.getDeviceConsumptionHistory(req.params.id, req.query);
    res.status(200).json(history); // Will be [] if service returns empty array
  } catch (error) {
    logger.error(`Error in GET /api/devices/${req.params.id}/consumption-history: ${error.message}`, { stack: error.stack, query: req.query });
    if (error.status) { // Catches the 501 error from the service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/devices/:id/status - Update device status
router.patch('/:id/status', protect, authorize('admin', 'editor', 'operator'), async (req, res) => {
  try {
    const deviceId = req.params.id;
    const { status } = req.body;

    if (status === undefined) { // Check for undefined specifically
      logger.warn(`Attempt to update status for device ID ${deviceId} without status field.`);
      return res.status(400).json({ error: 'Missing required field: status' });
    }

    const updatedDevice = await deviceService.updateDeviceStatus(deviceId, status);
    res.status(200).json(updatedDevice);
  } catch (error) {
    logger.error(`Error in PATCH /api/devices/${req.params.id}/status: ${error.message}`, { stack: error.stack, body: req.body });
    if (error.status) { // Handles 400, 404 from service
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while updating device status' });
  }
});

// GET /api/devices - Get all devices (with optional query params for filtering)
router.get('/', protect, async (req, res) => {
  try {
    // Users with 'editor' or 'admin' role can see all devices
    // Regular users might have more restricted views in a future iteration (e.g., only devices in their rooms)
    // For now, all authenticated users can list devices.
    const devices = await deviceService.getDevices(req.query);
    res.status(200).json(devices);
  } catch (error) {
    logger.error(`Error in GET /api/devices: ${error.message}`, { stack: error.stack, query: req.query });
    res.status(500).json({ error: 'Internal server error while fetching devices' });
  }
});

// GET /api/devices/:id - Get a single device by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const deviceId = req.params.id;
    const device = await deviceService.getDeviceById(deviceId);
    // Future: Add ownership/role check if not all users can see all devices
    res.status(200).json(device);
  } catch (error) {
    logger.error(`Error in GET /api/devices/${req.params.id}: ${error.message}`, { stack: error.stack });
    if (error.status === 404) {
        return res.status(404).json({ error: 'Device not found' });
    }
    if (error.status === 400) {
        return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while fetching device' });
  }
});

// PUT /api/devices/:id - Update a device
router.put('/:id', protect, authorize('admin', 'editor'), async (req, res) => {
  try {
    const deviceId = req.params.id;
    // Basic validation: ensure body is not empty if something is expected
    if (Object.keys(req.body).length === 0) {
        logger.warn(`Attempt to update device ID ${deviceId} with empty body.`);
        return res.status(400).json({ error: 'Request body cannot be empty for update.' });
    }
    const updatedDevice = await deviceService.updateDevice(deviceId, req.body);
    res.status(200).json(updatedDevice);
  } catch (error) {
    logger.error(`Error in PUT /api/devices/${req.params.id}: ${error.message}`, { stack: error.stack, body: req.body });
     if (error.status) { // Handles 400, 404, 409 from service
        return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while updating device' });
  }
});

// DELETE /api/devices/:id - Delete a device
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const deviceId = req.params.id;
    const result = await deviceService.deleteDevice(deviceId);
    res.status(200).json(result); // result includes a success message and device info
  } catch (error) {
    logger.error(`Error in DELETE /api/devices/${req.params.id}: ${error.message}`, { stack: error.stack });
    if (error.status === 404) {
        return res.status(404).json({ error: 'Device not found for deletion' });
    }
     if (error.status === 400) {
        return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error while deleting device' });
  }
});

module.exports = router;
