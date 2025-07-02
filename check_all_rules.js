#!/usr/bin/env node

const pool = require('./config/db');

async function checkAllRules() {
  try {
    const result = await pool.query(`
      SELECT id, name, priority, is_enabled, last_triggered_at 
      FROM rules 
      ORDER BY id
    `);
    
    console.log('All rules in database:');
    console.log('ID | Name | Priority | Enabled | Last Triggered');
    console.log('-'.repeat(70));
    
    result.rows.forEach(rule => {
      const lastTriggered = rule.last_triggered_at 
        ? new Date(rule.last_triggered_at).toLocaleString()
        : 'Never';
      console.log(`${rule.id} | ${rule.name} | ${rule.priority} | ${rule.is_enabled} | ${lastTriggered}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAllRules();