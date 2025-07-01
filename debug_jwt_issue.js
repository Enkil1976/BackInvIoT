require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function debugJWTIssue() {
  console.log('🔍 JWT Issue Debugging');
  console.log('='.repeat(50));
  
  const JWT_SECRET = process.env.JWT_SECRET;
  console.log('JWT_SECRET configured:', JWT_SECRET ? 'YES' : 'NO');
  
  try {
    // Get user from database
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', ['Enkil']);
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = userResult.rows[0];
    console.log('\n👤 User from database:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Role:', user.role);
    console.log('   Role type:', typeof user.role);
    
    // Create a test JWT like the auth service would
    const testToken = jwt.sign(
      {
        id: user.id,
        sub: user.id.toString(),
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    console.log('\n🎫 Test Token Created:');
    console.log('   Token:', testToken.substring(0, 30) + '...');
    
    // Verify the token
    const decoded = jwt.verify(testToken, JWT_SECRET);
    console.log('\n✅ Token Verification:');
    console.log('   ID:', decoded.id);
    console.log('   Username:', decoded.username);
    console.log('   Role:', decoded.role);
    console.log('   Role type:', typeof decoded.role);
    
    // Test authorization logic
    const requiredRoles = ['admin', 'editor'];
    const hasPermission = requiredRoles.includes(decoded.role);
    
    console.log('\n🔐 Authorization Test:');
    console.log('   Required roles:', requiredRoles);
    console.log('   User role:', decoded.role);
    console.log('   Permission check:', hasPermission ? 'PASS' : 'FAIL');
    
    if (!hasPermission) {
      console.log('\n❌ AUTHORIZATION WOULD FAIL');
      console.log('   Check if role in database matches exactly: "admin"');
    } else {
      console.log('\n✅ AUTHORIZATION SHOULD PASS');
      console.log('   The issue might be elsewhere');
    }
    
  } catch (error) {
    console.log('\n❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugJWTIssue();