const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = require('./config/db');

async function createWeatherTable() {
  try {
    console.log('📋 Creating weather_current table...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'sql', 'create_weather_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    const result = await pool.query(sql);
    
    console.log('✅ Weather table created successfully');
    console.log('📊 Checking table structure...');
    
    // Verify table was created
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'weather_current'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Table columns:');
    tableInfo.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
    });
    
    // Check indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'weather_current';
    `);
    
    console.log('🔍 Table indexes:');
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });
    
    console.log('🎉 Weather table setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating weather table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createWeatherTable();