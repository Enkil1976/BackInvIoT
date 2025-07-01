require('dotenv').config();
const jwt = require('jsonwebtoken');

// Test the exact JWT token from your frontend
console.log('🔍 JWT Token Analysis');
console.log('='.repeat(50));

// Replace this with the actual token from your frontend localStorage
const frontendToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Paste your actual token here

if (frontendToken.length < 50) {
  console.log('❌ Please replace frontendToken with your actual JWT from localStorage');
  console.log('   You can find it in browser dev tools -> Application -> Local Storage -> auth_token');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
console.log('🔑 JWT_SECRET configured:', JWT_SECRET ? 'YES' : 'NO');

if (!JWT_SECRET) {
  console.log('❌ No JWT_SECRET in environment variables');
  process.exit(1);
}

try {
  // Decode without verification first
  const decodedUnverified = jwt.decode(frontendToken, { complete: true });
  console.log('\n📋 Token Header:', decodedUnverified?.header);
  console.log('📋 Token Payload:', decodedUnverified?.payload);
  
  // Now verify with secret
  const decoded = jwt.verify(frontendToken, JWT_SECRET);
  console.log('\n✅ Token verification: SUCCESS');
  console.log('👤 User ID:', decoded.id);
  console.log('👤 Username:', decoded.username);
  console.log('👤 Role:', decoded.role);
  console.log('⏰ Issued at:', new Date(decoded.iat * 1000).toISOString());
  console.log('⏰ Expires at:', new Date(decoded.exp * 1000).toISOString());
  console.log('⏰ Is expired:', new Date() > new Date(decoded.exp * 1000) ? 'YES' : 'NO');
  
  // Test authorization logic
  const requiredRoles = ['admin', 'editor'];
  const userRole = decoded.role;
  const hasPermission = requiredRoles.includes(userRole);
  
  console.log('\n🔐 Authorization Test:');
  console.log('   Required roles:', requiredRoles);
  console.log('   User role:', userRole);
  console.log('   Has permission:', hasPermission ? 'YES' : 'NO');
  
  if (!hasPermission) {
    console.log('❌ AUTHORIZATION WOULD FAIL');
    console.log('   This explains the 403 Forbidden error');
  } else {
    console.log('✅ AUTHORIZATION SHOULD PASS');
    console.log('   The 403 error must be from something else');
  }
  
} catch (error) {
  console.log('\n❌ Token verification FAILED:', error.message);
  if (error.name === 'TokenExpiredError') {
    console.log('   Token has expired - user needs to login again');
  } else if (error.name === 'JsonWebTokenError') {
    console.log('   Token is malformed or signed with different secret');
  }
}