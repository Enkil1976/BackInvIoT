require('dotenv').config();
const pool = require('./config/db');

async function fixUserRole() {
  console.log('🔧 Fixing user role in database...');
  console.log('='.repeat(50));
  
  try {
    // First, check current role
    console.log('1. Checking current user role...');
    const currentUser = await pool.query(
      'SELECT id, username, role FROM users WHERE username = $1',
      ['Enkil']
    );
    
    if (currentUser.rows.length === 0) {
      console.log('❌ User "Enkil" not found');
      return;
    }
    
    const user = currentUser.rows[0];
    console.log(`   Current role: "${user.role}" (${typeof user.role})`);
    
    // Update role to admin (force it)
    console.log('\n2. Updating role to admin...');
    const updateResult = await pool.query(
      'UPDATE users SET role = $1 WHERE username = $2 RETURNING id, username, role',
      ['admin', 'Enkil']
    );
    
    const updatedUser = updateResult.rows[0];
    console.log('✅ Role updated successfully');
    console.log(`   New role: "${updatedUser.role}"`);
    
    // Verify the update
    console.log('\n3. Verifying update...');
    const verifyResult = await pool.query(
      'SELECT id, username, role FROM users WHERE username = $1',
      ['Enkil']
    );
    
    const verifiedUser = verifyResult.rows[0];
    console.log(`   Verified role: "${verifiedUser.role}"`);
    
    // Check for any other users that might have the wrong role
    console.log('\n4. Checking all users...');
    const allUsers = await pool.query('SELECT id, username, role FROM users ORDER BY id');
    
    console.log('   All users in database:');
    allUsers.rows.forEach(u => {
      console.log(`      ${u.id}: ${u.username} -> "${u.role}"`);
    });
    
    console.log('\n📝 Next steps:');
    console.log('1. Clear localStorage in browser');
    console.log('2. Login again with user "Enkil"');
    console.log('3. New JWT should contain role: "admin"');
    console.log('4. Device creation should work');
    
  } catch (error) {
    console.error('❌ Error fixing user role:', error.message);
  } finally {
    await pool.end();
  }
}

fixUserRole();