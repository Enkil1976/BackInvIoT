const axios = require('axios');
const jwt = require('jsonwebtoken');

async function deepTokenAnalysis() {
  console.log('🔬 Deep Token Analysis - Production Server');
  console.log('='.repeat(60));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // Step 1: Login and get token
    console.log('1. Getting fresh token from production...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    const userFromLogin = loginResponse.data.user;
    
    console.log('   ✅ Login successful');
    console.log('   👤 User from login response:', userFromLogin);
    
    // Step 2: Decode token manually
    console.log('\n2. Decoding JWT token...');
    const tokenParts = token.split('.');
    const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    console.log('   📋 Token header:', header);
    console.log('   📋 Token payload:', payload);
    console.log('   🔍 Token role:', payload.role);
    console.log('   🔍 Token role type:', typeof payload.role);
    
    // Step 3: Check JWT secret consistency
    console.log('\n3. Testing JWT verification...');
    try {
      const JWT_SECRET = process.env.JWT_SECRET;
      if (JWT_SECRET) {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('   ✅ Token verified with local JWT_SECRET');
        console.log('   🔍 Decoded role:', decoded.role);
      } else {
        console.log('   ❌ No local JWT_SECRET to verify');
      }
    } catch (jwtError) {
      console.log('   ❌ JWT verification failed:', jwtError.message);
      console.log('   💡 This suggests different JWT_SECRET on server');
    }
    
    // Step 4: Test auth/verify endpoint
    console.log('\n4. Testing /api/auth/verify endpoint...');
    try {
      const verifyResponse = await axios.get(`${baseURL}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      
      console.log(`   📝 Verify status: ${verifyResponse.status}`);
      if (verifyResponse.status === 200) {
        console.log('   ✅ Token is valid on server');
        console.log('   👤 Server user data:', verifyResponse.data.user);
        
        const serverUser = verifyResponse.data.user;
        console.log('\n   🔍 COMPARISON:');
        console.log(`      Login response role: "${userFromLogin.role}"`);
        console.log(`      Token payload role: "${payload.role}"`);
        console.log(`      Server verify role: "${serverUser.role}"`);
        
        if (userFromLogin.role !== serverUser.role) {
          console.log('   ❌ INCONSISTENCY FOUND!');
          console.log('   💡 Login response differs from server verification');
        }
        
      } else {
        console.log('   ❌ Token verification failed:', verifyResponse.data);
      }
    } catch (verifyError) {
      console.log('   ❌ Verify endpoint error:', verifyError.message);
    }
    
    // Step 5: Test device creation with detailed headers
    console.log('\n5. Testing device creation with debug...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Deep Analysis Test",
      device_id: "DEEP-TEST-001",
      type: "sensor"
    }, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log(`   📝 Device creation status: ${deviceResponse.status}`);
    console.log(`   📝 Response:`, deviceResponse.data);
    
    if (deviceResponse.status === 403) {
      console.log('\n   ❌ 403 FORBIDDEN - ANALYZING CAUSE:');
      console.log('   🔍 This means the token is valid but authorization fails');
      console.log('   🔍 The server middleware is rejecting the role');
    }
    
    // Step 6: Check if there's a middleware issue
    console.log('\n6. Diagnosing middleware flow...');
    console.log('   🔍 Expected middleware flow:');
    console.log('      1. protect middleware → extracts user from token');
    console.log('      2. authorize middleware → checks user.role against required roles');
    console.log('      3. If token role !== user.role, this fails');
    
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log(`   - Token contains role: "${payload.role}"`);
    console.log(`   - Login response role: "${userFromLogin.role}"`);
    console.log(`   - Device creation: ${deviceResponse.status === 201 ? 'SUCCESS' : 'FAILED'}`);
    
    if (deviceResponse.status === 403) {
      console.log('\n🔧 POSSIBLE CAUSES:');
      console.log('   1. protect middleware is creating req.user with different role');
      console.log('   2. JWT_SECRET mismatch between environments');
      console.log('   3. Database role differs from token role');
      console.log('   4. Middleware bug still exists');
    }
    
  } catch (error) {
    console.log('❌ Analysis failed:', error.message);
  }
}

deepTokenAnalysis();