const axios = require('axios');

async function debugFrontendAPICalls() {
  console.log('🔍 Debugging Frontend API Issues');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // Test the exact calls the frontend makes
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${baseURL}/api/health`, {
      validateStatus: () => true,
      timeout: 5000
    });
    console.log(`   📝 Health status: ${healthResponse.status}`);
    
    console.log('\n2. Testing CORS headers...');
    const corsResponse = await axios.options(`${baseURL}/api/health`, {
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET'
      },
      validateStatus: () => true
    });
    console.log(`   📝 CORS preflight: ${corsResponse.status}`);
    console.log('   🔍 CORS headers:', corsResponse.headers['access-control-allow-origin']);
    
    console.log('\n3. Testing devices endpoint without auth...');
    const devicesNoAuth = await axios.get(`${baseURL}/api/devices`, {
      validateStatus: () => true
    });
    console.log(`   📝 Devices (no auth): ${devicesNoAuth.status}`);
    console.log('   💬 Expected 401:', devicesNoAuth.status === 401 ? 'YES' : 'NO');
    
    console.log('\n4. Testing with authentication...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    
    const devicesAuth = await axios.get(`${baseURL}/api/devices`, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    console.log(`   📝 Devices (with auth): ${devicesAuth.status}`);
    
    if (devicesAuth.status === 200) {
      console.log(`   📦 Device count: ${devicesAuth.data.length}`);
      console.log('   ✅ API is working correctly');
    }
    
    console.log('\n5. Testing latest sensor data...');
    const latestData = await axios.get(`${baseURL}/api/latest/temhum1`, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    console.log(`   📝 Latest data: ${latestData.status}`);
    
    if (latestData.status === 200) {
      console.log('   ✅ Sensor data available');
    } else {
      console.log('   ⚠️ No sensor data - frontend may fallback to mock');
    }
    
    console.log('\n🎯 FRONTEND TROUBLESHOOTING:');
    
    if (devicesAuth.status === 200 && healthResponse.status === 200) {
      console.log('✅ Backend API is working correctly');
      console.log('❓ Frontend issue might be:');
      console.log('   1. Wrong base URL in frontend config');
      console.log('   2. Frontend auth token is invalid/expired');
      console.log('   3. CORS issues from browser');
      console.log('   4. Frontend fell back to mock mode');
      console.log('   5. Frontend localStorage has stale config');
    } else {
      console.log('❌ Backend API has issues');
    }
    
  } catch (error) {
    console.log('❌ API test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 Server is not responding');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   💡 Server is responding slowly');
    }
  }
}

debugFrontendAPICalls();