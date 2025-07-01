require('dotenv').config();
const axios = require('axios');

// Test device creation with debug logging
async function testDeviceCreation() {
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // First, get a token
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'Enkil',
      password: 'your_password_here' // Replace with actual password
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log('🎫 Token received:', token.substring(0, 20) + '...');
    
    // Now try to create a device
    console.log('\n📝 Creating device...');
    const deviceData = {
      name: "Test Device",
      device_id: "TEST-001",
      type: "relay",
      description: "Test device creation",
      status: "offline",
      config: {
        enabled: true,
        pin_relay: 12
      }
    };
    
    const createResponse = await axios.post(
      `${baseURL}/api/devices`,
      deviceData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Device created successfully:', createResponse.data);
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.log('\n🔍 403 Forbidden Analysis:');
      console.log('- User role should be: admin');
      console.log('- Required roles: admin, editor');
      console.log('- Check if JWT token contains correct role');
    }
  }
}

testDeviceCreation();