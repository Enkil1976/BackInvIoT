const jwt = require('jsonwebtoken');

// Replace this with your actual token from browser localStorage
const FRONTEND_TOKEN = 'PASTE_YOUR_TOKEN_HERE';

if (FRONTEND_TOKEN === 'PASTE_YOUR_TOKEN_HERE') {
  console.log('❌ Please replace FRONTEND_TOKEN with your actual JWT from browser dev tools');
  console.log('   Go to: Application → Local Storage → auth_token');
  process.exit(1);
}

console.log('🔍 Frontend Token Analysis');
console.log('='.repeat(50));

try {
  // Decode without verification first
  const decoded = jwt.decode(FRONTEND_TOKEN, { complete: true });
  
  console.log('📋 Token Header:');
  console.log('   Algorithm:', decoded.header.alg);
  console.log('   Type:', decoded.header.typ);
  
  console.log('\n📋 Token Payload:');
  console.log('   ID:', decoded.payload.id);
  console.log('   Subject:', decoded.payload.sub);
  console.log('   Username:', decoded.payload.username);
  console.log('   Role:', decoded.payload.role);
  console.log('   Role type:', typeof decoded.payload.role);
  console.log('   Issued at:', new Date(decoded.payload.iat * 1000).toISOString());
  console.log('   Expires at:', new Date(decoded.payload.exp * 1000).toISOString());
  
  const isExpired = new Date() > new Date(decoded.payload.exp * 1000);
  console.log('   Is expired:', isExpired ? 'YES' : 'NO');
  
  // Check role authorization
  const requiredRoles = ['admin', 'editor'];
  const hasPermission = requiredRoles.includes(decoded.payload.role);
  
  console.log('\n🔐 Authorization Check:');
  console.log('   Required roles:', requiredRoles);
  console.log('   User role:', `"${decoded.payload.role}"`);
  console.log('   Has permission:', hasPermission ? 'YES' : 'NO');
  
  if (!hasPermission) {
    console.log('\n❌ PERMISSION DENIED');
    console.log('   The role in this token does not match required roles');
    console.log('   Expected: "admin" or "editor"');
    console.log('   Actual:', `"${decoded.payload.role}"`);
  } else {
    console.log('\n✅ PERMISSION GRANTED');
    console.log('   The token should work for device creation');
  }
  
} catch (error) {
  console.log('❌ Error decoding token:', error.message);
}

console.log('\n📝 Instructions:');
console.log('1. Copy your JWT token from browser dev tools');
console.log('2. Replace FRONTEND_TOKEN in this script');
console.log('3. Run the script again to see the issue');