const axios = require('axios');

async function testDeployedServer() {
  console.log('🌐 Testing deployed server...');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // Test 1: Get user info from server by making a login attempt
    console.log('1. Testing login on deployed server...');
    
    // You need to replace with actual password
    const password = 'put_actual_password_here';
    
    if (password === 'put_actual_password_here') {
      console.log('❌ Please update the password in this script');
      console.log('\n📋 Alternative: Test with curl command:');
      console.log(`curl -X POST ${baseURL}/api/auth/login \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"username":"Enkil","password":"YOUR_PASSWORD"}'`);
      return;
    }
    
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'Enkil',
      password: password
    });
    
    console.log('✅ Login successful on deployed server');
    console.log('👤 User data returned:', loginResponse.data.user);
    console.log('🎫 Token provided:', loginResponse.data.token ? 'YES' : 'NO');
    
    // Decode the token from deployed server
    const token = loginResponse.data.token;
    const base64Payload = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
    
    console.log('\n2. Token analysis from deployed server:');
    console.log('   Username:', payload.username);
    console.log('   Role:', payload.role);
    console.log('   Role type:', typeof payload.role);
    console.log('   ID:', payload.id);
    
    // Test device creation
    console.log('\n3. Testing device creation...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Test Device",
      device_id: "TEST-001",
      type: "sensor"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    console.log('📝 Device creation result:');
    console.log('   Status:', deviceResponse.status);
    console.log('   Response:', deviceResponse.data);
    
    if (deviceResponse.status === 403) {
      console.log('\n❌ 403 FORBIDDEN - Role mismatch confirmed');
      console.log('   Server role:', payload.role);
      console.log('   Required: admin or editor');
    } else if (deviceResponse.status === 201) {
      console.log('\n✅ SUCCESS - Device created');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data || error.message);
  }
}

testDeployedServer();