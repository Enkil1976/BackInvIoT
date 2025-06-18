const pool = require('../config/db');
const logger = require('../config/logger');

let _broadcastWebSocket = null;

function initDeviceService(dependencies) {
  if (dependencies && dependencies.broadcastWebSocket) {
    _broadcastWebSocket = dependencies.broadcastWebSocket;
    logger.info('DeviceService initialized with broadcastWebSocket capability.');
  } else {
    logger.warn('DeviceService initialized WITHOUT broadcastWebSocket capability. Real-time updates will not be sent.');
  }
}

async function createDevice({ name, device_id, type, description, status, config, room_id }) {
  if (!name || !device_id || !type) {
    const error = new Error('Name, device_id, and type are required for creating a device.');
    error.status = 400;
    logger.warn(error.message, { name, device_id, type });
    throw error;
  }
  try {
    const query = `
      INSERT INTO devices (name, device_id, type, description, status, config, room_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [name, device_id, type, description, status || 'offline', config || {}, room_id, null];
    const result = await pool.query(query, values);
    const newDevice = result.rows[0];
    logger.info(`Device created: ${newDevice.name} (ID: ${newDevice.id})`);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({ type: 'device_created', data: newDevice });
      } catch (broadcastError) {
        logger.error('Error broadcasting device_created event:', broadcastError);
      }
    } else {
      logger.debug('broadcastWebSocket not available in DeviceService for device_created event.');
    }
    return newDevice;
  } catch (err) {
    logger.error(`Error in createDevice (device_id: ${device_id}): ${err.message}`, { error: err });
    if (err.code === '23505') {
        const specificError = new Error(`Device with this name or device_id already exists. (${err.constraint})`);
        specificError.status = 409;
        throw specificError;
    }
    throw err;
  }
}

async function getDevices(params = {}) {
  let queryStr = 'SELECT * FROM devices';
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (params.type) { conditions.push(`type = $${paramCount++}`); values.push(params.type); }
  if (params.status) { conditions.push(`status = $${paramCount++}`); values.push(params.status); }
  if (params.room_id) { conditions.push(`room_id = $${paramCount++}`); values.push(params.room_id); }

  if (conditions.length > 0) { queryStr += ' WHERE ' + conditions.join(' AND '); }
  queryStr += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(queryStr, values);
    return result.rows;
  } catch (err) {
    logger.error('Error in getDevices:', err);
    throw err;
  }
}

async function getDeviceById(id) {
  const deviceIdInt = parseInt(id, 10);
  if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid device ID format.');
    error.status = 400; logger.warn(error.message, { id }); throw error;
  }
  try {
    const result = await pool.query('SELECT * FROM devices WHERE id = $1', [deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found.');
      error.status = 404; throw error;
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in getDeviceById (ID: ${id}):`, err);
    throw err;
  }
}

async function updateDevice(id, updateData) {
  const deviceIdInt = parseInt(id, 10);
  if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid device ID format.');
    error.status = 400; logger.warn(error.message, { id }); throw error;
  }
   const { name, type, description, status, config, room_id, last_seen_at } = updateData;
   const fields = [];
   const values = [];
   let paramCount = 1;

   if (name !== undefined) { fields.push(`name = $${paramCount++}`); values.push(name); }
   if (type !== undefined) { fields.push(`type = $${paramCount++}`); values.push(type); }
   if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(description); }
   if (status !== undefined) { fields.push(`status = $${paramCount++}`); values.push(status); }
   if (config !== undefined) { fields.push(`config = $${paramCount++}`); values.push(config); }
   if (room_id !== undefined) { fields.push(`room_id = $${paramCount++}`); values.push(room_id); }
   if (last_seen_at !== undefined) { fields.push(`last_seen_at = $${paramCount++}`); values.push(last_seen_at); }

   if (fields.length === 0) {
     const error = new Error('No fields provided for update.');
     error.status = 400; logger.warn(error.message, { id }); throw error;
   }
   values.push(deviceIdInt);

  try {
    const query = `UPDATE devices SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *;`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for update.');
      error.status = 404; throw error;
    }
    const updatedDevice = result.rows[0];
    logger.info(`Device updated: ${updatedDevice.name} (ID: ${id})`);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({ type: 'device_updated', data: updatedDevice });
      } catch (broadcastError) {
        logger.error('Error broadcasting device_updated event:', broadcastError);
      }
    } else {
      logger.debug('broadcastWebSocket not available in DeviceService for device_updated event.');
    }
    return updatedDevice;
  } catch (err) {
    logger.error(`Error in updateDevice (ID: ${id}): ${err.message}`, { error: err });
    if (err.code === '23505') {
        const specificError = new Error(`Update failed: Another device with this name or device_id might exist. (${err.constraint})`);
        specificError.status = 409; throw specificError;
    }
    throw err;
  }
}

async function deleteDevice(id) {
  const deviceIdInt = parseInt(id, 10);
  if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid device ID format.');
    error.status = 400; logger.warn(error.message, { id }); throw error;
  }
  try {
    const result = await pool.query('DELETE FROM devices WHERE id = $1 RETURNING *;', [deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for deletion.');
      error.status = 404; throw error;
    }
    const deletedDeviceData = result.rows[0];
    logger.info(`Device deleted: ${deletedDeviceData.name} (ID: ${id})`);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({ type: 'device_deleted', data: { id: deletedDeviceData.id, name: deletedDeviceData.name } });
      } catch (broadcastError) {
        logger.error('Error broadcasting device_deleted event:', broadcastError);
      }
    } else {
      logger.debug('broadcastWebSocket not available in DeviceService for device_deleted event.');
    }
    return { message: 'Device deleted successfully', id: deletedDeviceData.id, name: deletedDeviceData.name };
  } catch (err) {
    logger.error(`Error in deleteDevice (ID: ${id}): ${err.message}`, { error: err });
    throw err;
  }
}

async function updateDeviceStatus(id, newStatus) {
  const deviceIdInt = parseInt(id, 10);
  if (isNaN(deviceIdInt)) {
    const error = new Error('Invalid device ID format.');
    error.status = 400; logger.warn(error.message, { id }); throw error;
  }
  if (newStatus === undefined || newStatus === null || typeof newStatus !== 'string' || newStatus.trim() === '') {
    const error = new Error('Status is required and must be a non-empty string.');
    error.status = 400; logger.warn(error.message, { id, newStatus }); throw error;
  }
  const allowedStatuses = ['online', 'offline', 'active', 'inactive', 'error', 'on', 'off'];
  if (!allowedStatuses.includes(newStatus.toLowerCase())) {
    const error = new Error(`Invalid status value: '${newStatus}'.`);
    error.status = 400; logger.warn(error.message, { id, newStatus }); throw error;
  }

  try {
    const query = `
      UPDATE devices
      SET status = $1, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [newStatus, deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for status update.');
      error.status = 404; throw error;
    }
    const updatedDeviceWithStatus = result.rows[0];
    logger.info(`Device status updated: ${updatedDeviceWithStatus.name} (ID: ${id}) to ${newStatus}`);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({ type: 'device_status_updated', data: updatedDeviceWithStatus });
      } catch (broadcastError) {
        logger.error('Error broadcasting device_status_updated event:', broadcastError);
      }
    } else {
      logger.debug('broadcastWebSocket not available in DeviceService for device_status_updated event.');
    }
    return updatedDeviceWithStatus;
  } catch (err) {
    logger.error(`Error in updateDeviceStatus (ID: ${id}, Status: ${newStatus}): ${err.message}`, { error: err });
    throw err;
  }
}

async function setDeviceConfiguration(dbDeviceId, newConfig) {
  logger.info(`Attempting to set configuration for device ID ${dbDeviceId}:`, newConfig);
  const deviceIdInt = parseInt(dbDeviceId, 10);
  if (isNaN(deviceIdInt) || deviceIdInt <= 0) {
    const error = new Error('Invalid device database ID provided for setDeviceConfiguration.');
    error.status = 400; throw error;
  }
  if (typeof newConfig !== 'object' || newConfig === null) {
    const error = new Error('Invalid newConfig provided; must be an object.');
    error.status = 400; throw error;
  }

  try {
    const query = `
      UPDATE devices
      SET config = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [newConfig, deviceIdInt]);
    if (result.rows.length === 0) {
      const error = new Error(`Device with database ID ${deviceIdInt} not found for config update.`);
      error.status = 404; throw error;
    }
    const updatedDevice = result.rows[0];
    logger.info(`Configuration updated for device ${updatedDevice.name} (ID: ${deviceIdInt}). New config:`, updatedDevice.config);

    if (_broadcastWebSocket && typeof _broadcastWebSocket === 'function') {
      try {
        _broadcastWebSocket({ type: 'device_config_updated', data: updatedDevice });
      } catch (broadcastError) {
        logger.error('Error broadcasting device_config_updated event:', broadcastError);
      }
    } else {
      logger.debug(`broadcastWebSocket not available in DeviceService for device_config_updated event.`);
    }
    return updatedDevice;
  } catch (err) {
    logger.error(`Error in setDeviceConfiguration for device ID ${deviceIdInt}:`, err);
    if (err.status) throw err;
    const error = new Error('Failed to set device configuration.');
    error.status = 500; throw error;
  }
}


async function getDeviceConsumptionHistory(monitoredDeviceId, queryParams = {}) {
  logger.info(`Fetching consumption history for monitored device ID ${monitoredDeviceId} with params: ${JSON.stringify(queryParams)}`);
  const deviceIdInt = parseInt(monitoredDeviceId, 10);
  if (isNaN(deviceIdInt) || deviceIdInt <= 0) {
    const error = new Error('Invalid monitored_device_id provided.');
    error.status = 400; logger.warn(error.message); throw error;
  }

  const conditions = ['pml.monitored_device_id = $1'];
  const values = [deviceIdInt];
  let paramCount = 2;

  if (queryParams.startDate) { conditions.push(`pml.received_at >= $${paramCount++}`); values.push(queryParams.startDate); }
  if (queryParams.endDate) { conditions.push(`pml.received_at <= $${paramCount++}`); values.push(queryParams.endDate); }
  if (queryParams.lastHours && !queryParams.startDate && !queryParams.endDate) {
    const hours = parseInt(queryParams.lastHours, 10);
    if (!isNaN(hours) && hours > 0) {
      conditions.push(`pml.received_at >= NOW() - INTERVAL '${hours} hours'`);
    } else {
      logger.warn(`Invalid lastHours parameter: ${queryParams.lastHours}. Ignoring.`);
    }
  }

  const orderBy = 'pml.received_at DESC';
  const limit = parseInt(queryParams.limit, 10) || 100;
  const page = parseInt(queryParams.page, 10) || 1;
  const offset = (page - 1) * limit;

  const dataQueryString = `
    SELECT pml.id, pml.monitored_device_id, pml.voltage, pml.current, pml.power, pml.sensor_timestamp, pml.received_at
    FROM power_monitor_logs pml
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${paramCount++}
    OFFSET $${paramCount++};
  `;
  const dataValues = [...values, limit, offset];

  const countConditionsString = conditions.join(' AND ');
  const countQueryString = `SELECT COUNT(*) FROM power_monitor_logs pml WHERE ${countConditionsString};`;

  try {
    const deviceExistsResult = await pool.query('SELECT id FROM devices WHERE id = $1', [deviceIdInt]);
    if (deviceExistsResult.rows.length === 0) {
      const error = new Error(`Device with id ${deviceIdInt} not found (the device supposed to be monitored).`);
      error.status = 404; throw error;
    }

    const result = await pool.query(dataQueryString, dataValues);
    const totalCountResult = await pool.query(countQueryString, values);
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);

    return {
        data: result.rows,
        meta: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) }
    };
  } catch (err) {
    if (err.status) throw err;
    logger.error(`Error fetching consumption history for device ID ${deviceIdInt}: ${err.message}`, { errorStack: err.stack });
    const error = new Error('Failed to retrieve consumption history.');
    error.status = 500; throw error;
  }
}

module.exports = {
  initDeviceService, // Added init function
  createDevice,
  getDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  updateDeviceStatus,
  getDeviceConsumptionHistory,
  setDeviceConfiguration,
};
