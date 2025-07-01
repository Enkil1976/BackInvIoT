require('dotenv').config();
const axios = require('axios');

async function testDeviceEndpoint() {
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  console.log('🧪 Testing device endpoint...');
  
  try {
    // First, test if the endpoint exists
    console.log('1. Testing endpoint existence...');
    const testResponse = await axios.get(`${baseURL}/api/devices`, {
      validateStatus: () => true // Don't throw on any status
    });
    
    console.log(`   Status: ${testResponse.status}`);
    console.log(`   Headers: ${JSON.stringify(testResponse.headers, null, 2)}`);
    
    if (testResponse.status === 401) {
      console.log('   ✅ Endpoint exists but requires auth (expected)');
    } else if (testResponse.status === 404) {
      console.log('   ❌ Endpoint not found - route not loaded!');
      return;
    }
    
    // Now test with authentication
    console.log('\n2. Testing with authentication...');
    
    // Login first
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'Enkil',
      password: 'tu_contraseña_aqui' // Replace with actual password
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    
    // Test GET first
    const getResponse = await axios.get(`${baseURL}/api/devices`, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   GET /api/devices: ${getResponse.status}`);
    
    // Test POST
    const postResponse = await axios.post(`${baseURL}/api/devices`, 
      {
        name: "Test Device",
        device_id: "TEST-123",
        type: "sensor"
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      }
    );
    
    console.log(`   POST /api/devices: ${postResponse.status}`);
    if (postResponse.status !== 201) {
      console.log(`   Response: ${JSON.stringify(postResponse.data)}`);
    } else {
      console.log('   ✅ Device created successfully!');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data)}`);
    }
  }
}

testDeviceEndpoint();