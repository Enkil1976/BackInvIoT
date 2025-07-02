const axios = require('axios');

async function debugAuthIssue() {
  console.log('🔍 Debugging Authentication Issue');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // 1. Test login
    console.log('1. Testing login...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    }, {
      validateStatus: () => true
    });
    
    console.log(`   Status: ${loginResponse.status}`);
    
    if (loginResponse.status !== 200) {
      console.log('   Error:', loginResponse.data);
      
      // Try with original admin
      console.log('\n2. Trying original admin...');
      const loginResponse2 = await axios.post(`${baseURL}/api/auth/login`, {
        username: 'admin',
        password: 'password'
      }, {
        validateStatus: () => true
      });
      
      console.log(`   Status: ${loginResponse2.status}`);
      if (loginResponse2.status === 200) {
        console.log('   ✅ Original admin works');
        console.log('   Token:', loginResponse2.data.token?.substring(0, 50) + '...');
        console.log('   User:', loginResponse2.data.user);
        
        // Test device creation
        await testDeviceCreation(baseURL, loginResponse2.data.token);
        return;
      }
    } else {
      console.log('   ✅ Login successful');
      console.log('   Token:', loginResponse.data.token?.substring(0, 50) + '...');
      console.log('   User:', loginResponse.data.user);
      
      // Test device creation
      await testDeviceCreation(baseURL, loginResponse.data.token);
    }
    
  } catch (error) {
    console.log('❌ Request failed:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.log('   Server is not accessible');
    }
  }
}

async function testDeviceCreation(baseURL, token) {
  console.log('\n3. Testing device creation...');
  
  try {
    const deviceData = {
      name: 'Test Device ' + Date.now(),
      type: 'sensor',
      description: 'Test device for debugging',
      location: 'Test Lab',
      config: { testMode: true }
    };
    
    const response = await axios.post(`${baseURL}/api/devices`, deviceData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 201) {
      console.log('   ✅ Device created successfully');
      console.log('   Device ID:', response.data.device_id);
    } else {
      console.log('   ❌ Device creation failed');
      console.log('   Error:', response.data);
      
      // Additional debugging
      console.log('\n4. Checking user info with token...');
      const userResponse = await axios.get(`${baseURL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      
      console.log(`   User info status: ${userResponse.status}`);
      if (userResponse.status === 200) {
        console.log('   User data:', userResponse.data);
      } else {
        console.log('   User error:', userResponse.data);
      }
    }
    
  } catch (error) {
    console.log('   ❌ Request error:', error.message);
  }
}

debugAuthIssue();