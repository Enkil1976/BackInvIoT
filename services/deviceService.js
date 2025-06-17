const pool = require('../config/db');
const logger = require('../config/logger');
const { app } = require('../server'); // Import app to access app.locals for WebSocket broadcasting

async function createDevice({ name, device_id, type, description, status, config, room_id }) {
  // Basic validation
  if (!name || !device_id || !type) {
    const error = new Error('Name, device_id, and type are required for creating a device.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }
  try {
    const query = `
      INSERT INTO devices (name, device_id, type, description, status, config, room_id, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    // last_seen_at can be null initially. It will be updated when the device first communicates.
    // status defaults to 'offline' in the DB schema if not provided.
    const values = [name, device_id, type, description, status || 'offline', config || {}, room_id, null];
    const result = await pool.query(query, values);
    const newDevice = result.rows[0];
    logger.info(`Device created: ${newDevice.name} (ID: ${newDevice.id})`);

    if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
      app.locals.broadcastWebSocket({ type: 'device_created', data: newDevice });
    } else {
      logger.warn('[WebSocket Broadcast Simulated] Event: device_created. app.locals.broadcastWebSocket not available.', { data: newDevice });
      // TODO: Ensure broadcastWebSocket is properly passed or accessible if this warning appears.
    }
    return newDevice;
  } catch (err) {
    logger.error(`Error in createDevice (device_id: ${device_id}): ${err.message}`, { error: err });
    // Check for unique constraint violation (e.g., name or device_id)
    if (err.code === '23505') { // PostgreSQL unique violation error code
        const specificError = new Error(`Device with this name or device_id already exists. (${err.constraint})`);
        specificError.status = 409; // Conflict
        throw specificError;
    }
    throw err; // Re-throw other errors
  }
}

async function getDevices(params = {}) {
  // Basic filtering example (can be expanded)
  let query = 'SELECT * FROM devices';
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (params.type) {
    conditions.push(`type = $${paramCount++}`);
    values.push(params.type);
  }
  if (params.status) {
    conditions.push(`status = $${paramCount++}`);
    values.push(params.status);
  }
  if (params.room_id) {
    conditions.push(`room_id = $${paramCount++}`);
    values.push(params.room_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (err) {
    logger.error('Error in getDevices:', err);
    throw err;
  }
}

async function getDeviceById(id) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid device ID format.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }
  try {
    const result = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found.');
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in getDeviceById (ID: ${id}):`, err);
    throw err; // Re-throw, to be handled by route
  }
}

async function updateDevice(id, { name, type, description, status, config, room_id, last_seen_at }) {
   if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid device ID format.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }
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
   // device_id is generally not updated.

   if (fields.length === 0) {
     const error = new Error('No fields provided for update.');
     error.status = 400;
     logger.warn(error.message + ` For ID: ${id}`);
     throw error;
   }

   // The database trigger handles updated_at automatically.
   values.push(id);

  try {
    const query = `UPDATE devices SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *;`;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for update.');
      error.status = 404;
      throw error;
    }
    const updatedDevice = result.rows[0];
    logger.info(`Device updated: ${updatedDevice.name} (ID: ${id})`);

    if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
      app.locals.broadcastWebSocket({ type: 'device_updated', data: updatedDevice });
    } else {
      logger.warn('[WebSocket Broadcast Simulated] Event: device_updated. app.locals.broadcastWebSocket not available.', { data: updatedDevice });
    }
    return updatedDevice;
  } catch (err) {
    logger.error(`Error in updateDevice (ID: ${id}): ${err.message}`, { error: err });
    if (err.code === '23505') { // PostgreSQL unique violation error code for name or device_id if they were updatable
        const specificError = new Error(`Update failed: Another device with this name or device_id might exist. (${err.constraint})`);
        specificError.status = 409; // Conflict
        throw specificError;
    }
    throw err;
  }
}

async function deleteDevice(id) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid device ID format.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }
  try {
    const result = await pool.query('DELETE FROM devices WHERE id = $1 RETURNING *;', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for deletion.');
      error.status = 404;
      throw error;
    }
    const deletedDeviceData = result.rows[0];
    logger.info(`Device deleted: ${deletedDeviceData.name} (ID: ${id})`);

    if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
      // Ensure we send data that's useful, even if the full object isn't needed by all clients
      app.locals.broadcastWebSocket({ type: 'device_deleted', data: { id: deletedDeviceData.id, name: deletedDeviceData.name } });
    } else {
      logger.warn('[WebSocket Broadcast Simulated] Event: device_deleted. app.locals.broadcastWebSocket not available.', { data: { id: deletedDeviceData.id, name: deletedDeviceData.name } });
    }
    // Return a more structured response
    return { message: 'Device deleted successfully', id: deletedDeviceData.id, name: deletedDeviceData.name };
  } catch (err) {
    logger.error(`Error in deleteDevice (ID: ${id}): ${err.message}`, { error: err });
    throw err;
  }
}

async function updateDeviceStatus(id, newStatus) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid device ID format.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }
  if (newStatus === undefined || newStatus === null || typeof newStatus !== 'string' || newStatus.trim() === '') {
    const error = new Error('Status is required and must be a non-empty string for updating device status.');
    error.status = 400;
    logger.warn(error.message + ` For ID: ${id}`);
    throw error;
  }

  const allowedStatuses = ['online', 'offline', 'active', 'inactive', 'error', 'on', 'off'];
  if (!allowedStatuses.includes(newStatus.toLowerCase())) {
    const error = new Error(`Invalid status value: '${newStatus}'. Allowed statuses are: ${allowedStatuses.join(', ')}.`);
    error.status = 400;
    logger.warn(error.message + ` For ID: ${id}`);
    throw error;
  }

  try {
    const query = `
      UPDATE devices
      SET status = $1, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [newStatus, id]);
    if (result.rows.length === 0) {
      const error = new Error('Device not found for status update.');
      error.status = 404;
      throw error;
    }
    const updatedDeviceWithStatus = result.rows[0];
    logger.info(`Device status updated: ${updatedDeviceWithStatus.name} (ID: ${id}) to ${newStatus}`);

    if (app && app.locals && typeof app.locals.broadcastWebSocket === 'function') {
      app.locals.broadcastWebSocket({ type: 'device_status_updated', data: updatedDeviceWithStatus });
    } else {
      logger.warn('[WebSocket Broadcast Simulated] Event: device_status_updated. app.locals.broadcastWebSocket not available.', { data: updatedDeviceWithStatus });
    }
    return updatedDeviceWithStatus;
  } catch (err) {
    logger.error(`Error in updateDeviceStatus (ID: ${id}, Status: ${newStatus}): ${err.message}`, { error: err });
    throw err;
  }
}

async function getDeviceConsumptionHistory(monitoredDeviceId, queryParams = {}) {
  logger.info(`Fetching consumption history for monitored device ID ${monitoredDeviceId} with params: ${JSON.stringify(queryParams)}`);

  // Validate monitoredDeviceId
  const deviceIdInt = parseInt(monitoredDeviceId, 10);
  if (isNaN(deviceIdInt) || deviceIdInt <= 0) {
    const error = new Error('Invalid monitored_device_id provided.');
    error.status = 400;
    logger.warn(error.message);
    throw error;
  }

  const conditions = ['pml.monitored_device_id = $1'];
  const values = [deviceIdInt];
  let paramCount = 2; // Start after monitored_device_id

  // Time-based filtering
  if (queryParams.startDate) {
    conditions.push(`pml.received_at >= $${paramCount++}`);
    values.push(queryParams.startDate);
  }
  if (queryParams.endDate) {
    conditions.push(`pml.received_at <= $${paramCount++}`);
    values.push(queryParams.endDate);
  }
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

  // Main query to fetch data
  const dataQueryString = `
    SELECT
      pml.id,
      pml.monitored_device_id,
      pml.voltage,
      pml.current,
      pml.power,
      pml.sensor_timestamp,
      pml.received_at
    FROM power_monitor_logs pml
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${paramCount++}
    OFFSET $${paramCount++};
  `;
  const dataValues = [...values, limit, offset];

  // Simplified count query (adjust conditions and values if time filters are heavily used for exact counts)
  // This count query needs to use the same set of conditions as the data query for accuracy,
  // but without limit/offset in its own values.
  const countConditionsString = conditions.join(' AND ');
  const countQueryString = `SELECT COUNT(*) FROM power_monitor_logs pml WHERE ${countConditionsString};`;
  // 'values' array already contains parameters for conditions.

  try {
    const deviceExistsResult = await pool.query('SELECT id FROM devices WHERE id = $1', [deviceIdInt]);
    if (deviceExistsResult.rows.length === 0) {
      const error = new Error(`Device with id ${deviceIdInt} not found (the device supposed to be monitored).`);
      error.status = 404;
      throw error;
    }

    const result = await pool.query(dataQueryString, dataValues);

    // For totalRecords, use the 'values' array which correctly corresponds to the 'conditions'
    const totalCountResult = await pool.query(countQueryString, values);
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);

    return {
        data: result.rows,
        meta: {
            page: page,
            limit: limit,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / limit)
        }
    };

  } catch (err) {
    if (err.status) throw err;

    logger.error(`Error fetching consumption history for device ID ${deviceIdInt}: ${err.message}`, { errorStack: err.stack, query: dataQueryString, values: dataValues });
    const error = new Error('Failed to retrieve consumption history.');
    error.status = 500;
    throw error;
  }
}

module.exports = {
  createDevice,
  getDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  updateDeviceStatus,
  getDeviceConsumptionHistory,
};
