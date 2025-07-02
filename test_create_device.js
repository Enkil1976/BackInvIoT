const axios = require('axios');

async function testDeviceCreation() {
  console.log('🔧 Testing Device Creation with Correct Payload');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // 1. Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    console.log('   User role:', loginResponse.data.user.role);
    
    // 2. Create device with correct fields
    console.log('\n2. Creating device with correct payload...');
    const deviceId = 'DEV_' + Date.now();
    const deviceData = {
      name: 'Sensor Ambiental Test',
      device_id: deviceId,  // This field was missing!
      type: 'environmental_sensor',
      description: 'Sensor de prueba para debugging',
      location: 'Laboratorio de Pruebas',
      config: { 
        sensorType: 'temperature_humidity',
        interval: 60,
        testMode: true 
      }
    };
    
    console.log('   Device data:', JSON.stringify(deviceData, null, 2));
    
    const response = await axios.post(`${baseURL}/api/devices`, deviceData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log(`\n3. Response status: ${response.status}`);
    
    if (response.status === 201) {
      console.log('   ✅ Device created successfully!');
      console.log('   Device:', response.data);
    } else {
      console.log('   ❌ Device creation failed');
      console.log('   Error:', response.data);
      
      // Check what fields are actually required
      console.log('\n4. Checking device creation endpoint...');
      const emptyResponse = await axios.post(`${baseURL}/api/devices`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      console.log('   Empty payload response:', emptyResponse.data);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log('   Response data:', error.response.data);
    }
  }
}

testDeviceCreation();