require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function forceTokenRefresh() {
  console.log('🔄 Forcing token refresh for user...');
  
  try {
    // Get current user data from database
    const userResult = await pool.query(
      'SELECT id, username, email, role FROM users WHERE username = $1',
      ['Enkil']
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = userResult.rows[0];
    console.log('📋 Current user in database:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    
    // Generate a new token with current database role
    const JWT_SECRET = process.env.JWT_SECRET;
    const newToken = jwt.sign(
      {
        id: user.id,
        sub: user.id.toString(),
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('\n🆕 New token generated with current role:');
    console.log(`   Role in token: ${user.role}`);
    console.log(`   Token: ${newToken.substring(0, 50)}...`);
    
    // Verify the new token
    const decoded = jwt.verify(newToken, JWT_SECRET);
    console.log('\n✅ Token verification:');
    console.log(`   Username: ${decoded.username}`);
    console.log(`   Role: ${decoded.role}`);
    console.log(`   Expires: ${new Date(decoded.exp * 1000).toISOString()}`);
    
    // Test authorization
    const requiredRoles = ['admin', 'editor'];
    const hasPermission = requiredRoles.includes(decoded.role);
    console.log(`\n🔐 Authorization test: ${hasPermission ? 'PASS' : 'FAIL'}`);
    
    console.log('\n📋 Instructions:');
    console.log('1. Copy this token to your browser localStorage:');
    console.log(`   localStorage.setItem('auth_token', '${newToken}');`);
    console.log('2. Refresh the page');
    console.log('3. Try creating a device');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

forceTokenRefresh();