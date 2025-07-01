require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function resetEnkilPassword() {
  console.log('🔑 Resetting Enkil password...');
  console.log('='.repeat(50));
  
  try {
    // New password for Enkil
    const newPassword = 'EnkilAdmin2025!';
    const saltRounds = 12;
    
    console.log('1. Generating new password hash...');
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    console.log('2. Updating password in database...');
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING id, username, role',
      [hashedPassword, 'Enkil']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User Enkil not found');
      return;
    }
    
    const user = result.rows[0];
    console.log('✅ Password updated successfully');
    console.log(`   User: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    
    console.log('\n🔑 New login credentials for Enkil:');
    console.log(`   Username: Enkil`);
    console.log(`   Password: ${newPassword}`);
    
    console.log('\n📝 Steps to test:');
    console.log('1. Clear browser localStorage');
    console.log('2. Login with new credentials');
    console.log('3. New JWT will be generated with correct role');
    console.log('4. Try creating device');
    
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
  } finally {
    await pool.end();
  }
}

resetEnkilPassword();