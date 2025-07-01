const axios = require('axios');

async function debugVerifyEndpoint() {
  console.log('🔍 Debug /api/auth/verify endpoint');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // Step 1: Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    const userFromLogin = loginResponse.data.user;
    
    console.log('   ✅ Login successful');
    console.log('   👤 User from login:', userFromLogin);
    
    // Step 2: Decode token
    console.log('\n2. Decoding token...');
    const tokenParts = token.split('.');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    console.log('   🎫 Token payload:', payload);
    console.log('   🔍 Token role:', `"${payload.role}"`);
    console.log('   🔍 Token role type:', typeof payload.role);
    
    // Step 3: Call /api/auth/verify
    console.log('\n3. Calling /api/auth/verify...');
    const verifyResponse = await axios.get(`${baseURL}/api/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('   ✅ Verify successful');
    console.log('   👤 Server response:', verifyResponse.data);
    console.log('   🔍 Server user role:', `"${verifyResponse.data.user.role}"`);
    console.log('   🔍 Server role type:', typeof verifyResponse.data.user.role);
    
    // Step 4: Compare exactly like frontend does
    console.log('\n4. Exact comparison (like frontend)...');
    const localRole = payload.role;
    const serverRole = verifyResponse.data.user.role;
    
    console.log(`   Local role: "${localRole}" (${typeof localRole})`);
    console.log(`   Server role: "${serverRole}" (${typeof serverRole})`);
    console.log(`   Are equal (===): ${localRole === serverRole}`);
    console.log(`   Are equal (==): ${localRole == serverRole}`);
    
    if (localRole !== serverRole) {
      console.log('\n   ❌ ROLES DIFFER!');
      console.log('   🔍 Analyzing difference...');
      console.log(`      Local length: ${localRole?.length || 'undefined'}`);
      console.log(`      Server length: ${serverRole?.length || 'undefined'}`);
      console.log(`      Local JSON: ${JSON.stringify(localRole)}`);
      console.log(`      Server JSON: ${JSON.stringify(serverRole)}`);
      
      // Check for whitespace or hidden characters
      if (localRole && serverRole) {
        console.log(`      Local trimmed: "${localRole.trim()}"`);
        console.log(`      Server trimmed: "${serverRole.trim()}"`);
        console.log(`      Trimmed equal: ${localRole.trim() === serverRole.trim()}`);
      }
    } else {
      console.log('\n   ✅ ROLES ARE IDENTICAL');
      console.log('   💡 The frontend diagnostic might be using stale data');
    }
    
    // Step 5: Check what the middleware sees
    console.log('\n5. Testing device creation to see middleware behavior...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Debug Verify Test",
      device_id: "DEBUG-VERIFY-001",
      type: "sensor"
    }, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   📝 Device creation: ${deviceResponse.status}`);
    if (deviceResponse.status === 201) {
      console.log('   ✅ Device creation works - no role inconsistency');
    } else {
      console.log('   ❌ Device creation failed:', deviceResponse.data);
    }
    
  } catch (error) {
    console.log('❌ Debug failed:', error.message);
  }
}

debugVerifyEndpoint();