const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

async function createNotificationTables() {
  const client = await pool.connect();
  
  try {
    logger.info('Starting notification tables creation...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../sql/create_notifications_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    logger.info('✅ Notification tables created successfully');
    
    // Verify tables were created
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('notifications', 'notification_templates', 'notification_channels', 'notification_rate_limits')
      ORDER BY table_name
    `);
    
    logger.info('Created tables:', tables.rows.map(row => row.table_name));
    
    // Check initial data
    const channelCount = await client.query('SELECT COUNT(*) FROM notification_channels');
    const templateCount = await client.query('SELECT COUNT(*) FROM notification_templates');
    
    logger.info(`Initial data: ${channelCount.rows[0].count} channels, ${templateCount.rows[0].count} templates`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating notification tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute if run directly
if (require.main === module) {
  createNotificationTables()
    .then(() => {
      logger.info('Notification tables setup completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Failed to setup notification tables:', error);
      process.exit(1);
    });
}

module.exports = { createNotificationTables };
