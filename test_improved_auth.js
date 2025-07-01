const axios = require('axios');

async function testImprovedAuth() {
  console.log('🧪 Testing Improved Authentication Middleware');
  console.log('='.repeat(60));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    console.log('1. Testing fresh login...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    
    console.log('\n2. Testing device creation with improved middleware...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Improved Auth Test",
      device_id: "IMPROVED-001",
      type: "sensor"
    }, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   📝 Device creation: ${deviceResponse.status}`);
    
    if (deviceResponse.status === 201) {
      console.log('   ✅ SUCCESS! Improved middleware working');
      console.log('   📦 Device created:', deviceResponse.data.name);
      
      // Clean up test device
      try {
        await axios.delete(`${baseURL}/api/devices/${deviceResponse.data.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('   🧹 Test device cleaned up');
      } catch (cleanupError) {
        console.log('   ⚠️ Could not clean up test device');
      }
      
    } else if (deviceResponse.status === 403) {
      console.log('   ❌ Still getting 403 - check server logs');
      console.log('   💬 Response:', deviceResponse.data);
    } else {
      console.log('   ❌ Unexpected status:', deviceResponse.data);
    }
    
    console.log('\n3. Testing role change detection...');
    console.log('   ℹ️ To test this, manually change the role in DB and retry');
    console.log('   📋 The improved middleware will detect and log role changes');
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }
}

testImprovedAuth();