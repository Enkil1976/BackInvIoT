const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function checkUsers() {
  try {
    const result = await pool.query('SELECT id, username, password_hash, role FROM users WHERE role = $1', ['admin']);
    
    console.log('Admin users in database:');
    for (const user of result.rows) {
      console.log(`\n- Username: ${user.username}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  ID: ${user.id}`);
      
      // Test common passwords
      const testPasswords = ['password', 'admin', 'AdminPass123!', '123456'];
      
      for (const testPass of testPasswords) {
        try {
          const isMatch = await bcrypt.compare(testPass, user.password_hash);
          if (isMatch) {
            console.log(`  ✅ Password: ${testPass}`);
            break;
          }
        } catch (e) {
          // Continue testing
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkUsers();