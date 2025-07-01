require('dotenv').config();
const { loginUser } = require('./services/authService');
const jwt = require('jsonwebtoken');

async function debugLoginProcess() {
  console.log('🔍 Debugging login process...');
  console.log('='.repeat(50));
  
  try {
    // Simulate login like the frontend does
    console.log('1. Attempting login for user: Enkil');
    
    const result = await loginUser({
      username: 'Enkil',
      password: 'tu_contraseña_aqui' // Replace with actual password
    });
    
    console.log('\n2. Login result received:');
    console.log('   ✅ Login successful');
    console.log('   👤 User object:', result.user);
    console.log('   🎫 Token generated:', result.token ? 'YES' : 'NO');
    
    // Decode the token to see what's inside
    console.log('\n3. Analyzing generated token:');
    const JWT_SECRET = process.env.JWT_SECRET;
    const decoded = jwt.verify(result.token, JWT_SECRET);
    
    console.log('   📋 Token payload:');
    console.log('      ID:', decoded.id);
    console.log('      Username:', decoded.username);
    console.log('      Role:', decoded.role);
    console.log('      Role type:', typeof decoded.role);
    console.log('      Subject:', decoded.sub);
    
    // Test authorization logic exactly as middleware does
    const requiredRoles = ['admin', 'editor'];
    const userRole = decoded.role;
    const hasPermission = requiredRoles.includes(userRole);
    
    console.log('\n4. Authorization simulation:');
    console.log('   Required roles:', requiredRoles);
    console.log('   Token role:', userRole);
    console.log('   Includes check:', hasPermission);
    console.log('   Result:', hasPermission ? 'AUTHORIZED' : 'FORBIDDEN');
    
    if (!hasPermission) {
      console.log('\n❌ PROBLEM FOUND:');
      console.log('   The token being generated does NOT contain admin role');
      console.log('   Check user role in database vs what login service retrieves');
    } else {
      console.log('\n✅ TOKEN IS CORRECT:');
      console.log('   The token should work for device creation');
      console.log('   The problem might be elsewhere');
    }
    
  } catch (error) {
    console.log('\n❌ Login failed:', error.message);
    if (error.message.includes('incorrectos')) {
      console.log('   Please update the password in this script');
    }
  }
}

debugLoginProcess();