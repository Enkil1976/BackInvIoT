const pool = require('../config/db');
const logger = require('../config/logger');

async function createRule({
  name,
  description,
  conditions,
  actions,
  is_enabled = true, // Default to true
  priority = 0      // Default to 0
}) {
  // Basic validation
  if (!name || !conditions || !actions) {
    const error = new Error('Name, conditions, and actions are required for creating a rule.');
    error.status = 400;
    logger.warn('Create rule failed due to missing required fields.', { name, conditions_present: !!conditions, actions_present: !!actions });
    throw error;
  }

  // Validate JSON structure (basic check, more complex validation can be added)
  try {
    if (typeof conditions !== 'object' || conditions === null) JSON.parse(conditions); // Will throw if not valid JSON string or already object
    if (typeof actions !== 'object' || actions === null) JSON.parse(actions);       // Will throw if not valid JSON string or already object
  } catch (jsonError) {
    const error = new Error('Conditions and actions must be valid JSON or JSON objects.');
    error.status = 400;
    logger.warn('Create rule failed due to invalid JSON for conditions or actions.', { name, jsonError: jsonError.message });
    throw error;
  }


  try {
    const query = `
      INSERT INTO rules (name, description, conditions, actions, is_enabled, priority, last_triggered_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    // last_triggered_at is null initially
    const values = [
      name,
      description || null,
      conditions, // Assumed to be valid JSON object or string by now
      actions,    // Assumed to be valid JSON object or string by now
      is_enabled,
      priority,
      null
    ];
    const result = await pool.query(query, values);
    logger.info(`Rule created: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
    return result.rows[0];
  } catch (err) {
    logger.error('Error in createRule:', { errorMessage: err.message, name });
    if (err.code === '23505' && err.constraint === 'rules_name_key') { // Unique name violation
        const specificError = new Error(`A rule with the name '${name}' already exists.`);
        specificError.status = 409; // Conflict
        throw specificError;
    }
    throw err;
  }
}

async function getRules(queryParams = {}) {
  const { isEnabled, priority, limit = 50, page = 1 } = queryParams;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (isEnabled !== undefined) { conditions.push(`is_enabled = $${paramCount++}`); values.push(isEnabled); }
  if (priority !== undefined) { conditions.push(`priority = $${paramCount++}`); values.push(priority); }
  // Add more filters as needed (e.g., search in name/description)

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT * FROM rules
    ${whereClause}
    ORDER BY priority DESC, name ASC
    LIMIT $${paramCount++}
    OFFSET $${paramCount++};
  `;
  const queryValues = [...values, parseInt(limit, 10), offset];

  const countQuery = `SELECT COUNT(*) FROM rules ${whereClause};`;
  const countValues = [...values];

  try {
    const result = await pool.query(query, queryValues);
    const totalCountResult = await pool.query(countQuery, countValues);
    const totalRecords = parseInt(totalCountResult.rows[0].count, 10);
    return {
      data: result.rows,
      meta: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalRecords,
        totalPages: Math.ceil(totalRecords / parseInt(limit, 10)),
      },
    };
  } catch (err) {
    logger.error('Error in getRules:', { errorMessage: err.message, queryParams });
    throw err;
  }
}

async function getRuleById(id) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid rule ID format.');
    error.status = 400; throw error;
  }
  try {
    const result = await pool.query('SELECT * FROM rules WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Rule not found.');
      error.status = 404; throw error;
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in getRuleById (ID: ${id}):`, { errorMessage: err.message });
    throw err;
  }
}

async function updateRule(id, updateData) {
  if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid rule ID format.');
    error.status = 400; throw error;
  }

  const { name, description, conditions, actions, is_enabled, priority, last_triggered_at } = updateData;
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) { fields.push(`name = $${paramCount++}`); values.push(name); }
  if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(description); }
  if (conditions !== undefined) {
    try { if (typeof conditions !== 'object' || conditions === null) JSON.parse(conditions); }
    catch (e) { const err = new Error('Invalid JSON for conditions.'); err.status=400; throw err; }
    fields.push(`conditions = $${paramCount++}`); values.push(conditions);
  }
  if (actions !== undefined) {
    try { if (typeof actions !== 'object' || actions === null) JSON.parse(actions); }
    catch (e) { const err = new Error('Invalid JSON for actions.'); err.status=400; throw err; }
    fields.push(`actions = $${paramCount++}`); values.push(actions);
  }
  if (is_enabled !== undefined) { fields.push(`is_enabled = $${paramCount++}`); values.push(is_enabled); }
  if (priority !== undefined) { fields.push(`priority = $${paramCount++}`); values.push(priority); }
  if (last_triggered_at !== undefined) { // Allow manual update/reset of last_triggered_at
    fields.push(`last_triggered_at = $${paramCount++}`);
    values.push(last_triggered_at ? new Date(last_triggered_at) : null);
  }


  if (fields.length === 0) {
    const error = new Error('No fields provided for update.');
    error.status = 400; throw error;
  }

  values.push(id); // For WHERE id = $N
  // updated_at is handled by DB trigger
  const query = `UPDATE rules SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *;`;

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) { // Should be caught by getRuleById if used before update
      const error = new Error('Rule not found for update.');
      error.status = 404; throw error;
    }
    logger.info(`Rule updated: ${result.rows[0].name} (ID: ${id})`);
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in updateRule (ID: ${id}):`, { errorMessage: err.message, updateData });
     if (err.code === '23505' && err.constraint === 'rules_name_key') {
        const specificError = new Error(`A rule with the name '${name}' already exists.`);
        specificError.status = 409; throw specificError;
    }
    throw err;
  }
}

async function deleteRule(id) {
   if (isNaN(parseInt(id, 10))) {
    const error = new Error('Invalid rule ID format.');
    error.status = 400; throw error;
  }
  try {
    const result = await pool.query('DELETE FROM rules WHERE id = $1 RETURNING *;', [id]);
    if (result.rows.length === 0) {
      const error = new Error('Rule not found for deletion.');
      error.status = 404; throw error;
    }
    logger.info(`Rule deleted: ${result.rows[0].name} (ID: ${id})`);
    return { message: 'Rule deleted successfully', rule: result.rows[0] };
  } catch (err) {
    logger.error(`Error in deleteRule (ID: ${id}):`, { errorMessage: err.message });
    throw err;
  }
}

module.exports = {
  createRule,
  getRules,
  getRuleById,
  updateRule,
  deleteRule,
};
