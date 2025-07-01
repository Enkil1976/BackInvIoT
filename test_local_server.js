const axios = require('axios');

async function testLocalServer() {
  console.log('🏠 Testing Local Server');
  console.log('='.repeat(40));
  
  const baseURL = 'http://localhost:4000';
  
  try {
    // Test with admin_new user
    console.log('1. Testing login...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    console.log('   ✅ Login successful');
    const token = loginResponse.data.token;
    const userInfo = loginResponse.data.user;
    
    console.log(`   👤 User: ${userInfo.username}, Role: "${userInfo.role}"`);
    
    // Test device creation
    console.log('2. Testing device creation...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Local Test Device",
      device_id: "LOCAL-TEST-001",
      type: "sensor"
    }, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   📝 Status: ${deviceResponse.status}`);
    
    if (deviceResponse.status === 201) {
      console.log('   ✅ SUCCESS - Device created locally!');
      console.log('   🎯 This confirms the code is correct');
      console.log('   🚨 The deployed server needs to be updated');
    } else {
      console.log('   ❌ Failed locally too:', deviceResponse.data);
    }
    
  } catch (error) {
    console.log('❌ Error testing local server:', error.message);
  }
}

testLocalServer();