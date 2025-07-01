require('dotenv').config();
const pool = require('./config/db');

async function checkUserRole() {
  try {
    const result = await pool.query(
      'SELECT id, username, role FROM users WHERE username = $1',
      ['Enkil']
    );
    
    console.log('🔍 User Role Debug:');
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log(`  - ID: ${user.id}`);
      console.log(`  - Username: ${user.username}`);
      console.log(`  - Role: "${user.role}" (${typeof user.role})`);
      console.log(`  - Role length: ${user.role?.length || 0}`);
      console.log(`  - Role exact match 'admin': ${user.role === 'admin'}`);
      console.log(`  - Role exact match 'Admin': ${user.role === 'Admin'}`);
    } else {
      console.log('  - User not found!');
    }
    
    // Check all users with admin-like roles
    const adminUsers = await pool.query(
      "SELECT id, username, role FROM users WHERE role ILIKE '%admin%'"
    );
    
    console.log('\n🔍 All admin-like users:');
    adminUsers.rows.forEach(user => {
      console.log(`  - ${user.username}: "${user.role}"`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUserRole();