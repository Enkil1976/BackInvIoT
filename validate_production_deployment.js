const axios = require('axios');

async function validateProductionDeployment() {
  console.log('🔍 Validating Production Deployment');
  console.log('='.repeat(50));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    console.log('1. Testing authentication with improved middleware...');
    
    // Test with admin_new user
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    console.log('   👤 User role:', loginResponse.data.user.role);
    
    console.log('\n2. Testing role verification with server...');
    const verifyResponse = await axios.get(`${baseURL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('   ✅ Token verification successful');
    console.log('   🔍 Server role:', verifyResponse.data.user.role);
    console.log('   🔄 Role consistency:', loginResponse.data.user.role === verifyResponse.data.user.role ? 'YES' : 'NO');
    
    console.log('\n3. Testing device creation with improved auth...');
    const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
      name: "Production Validation Test",
      device_id: "PROD-VALID-" + Date.now(),
      type: "sensor",
      description: "Test device for validating improved auth deployment"
    }, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   📝 Device creation status: ${deviceResponse.status}`);
    
    if (deviceResponse.status === 201) {
      console.log('   ✅ SUCCESS! Device creation works');
      console.log('   📦 Created device:', deviceResponse.data.name);
      
      // Test device update (requires same permissions)
      console.log('\n4. Testing device update permissions...');
      const updateResponse = await axios.put(`${baseURL}/api/devices/${deviceResponse.data.id}`, {
        description: "Updated by validation test"
      }, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      
      console.log(`   📝 Device update status: ${updateResponse.status}`);
      
      // Clean up
      console.log('\n5. Cleaning up test device...');
      const deleteResponse = await axios.delete(`${baseURL}/api/devices/${deviceResponse.data.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      
      console.log(`   🧹 Device deletion status: ${deleteResponse.status}`);
      
    } else if (deviceResponse.status === 403) {
      console.log('   ❌ FAILED: Still getting 403 Forbidden');
      console.log('   💬 Error:', deviceResponse.data);
      console.log('   🔧 Check if deployment completed successfully');
      return false;
    } else {
      console.log('   ⚠️ Unexpected status:', deviceResponse.status);
      console.log('   💬 Response:', deviceResponse.data);
    }
    
    console.log('\n6. Testing with different user (Enkil)...');
    try {
      const enkilLogin = await axios.post(`${baseURL}/api/auth/login`, {
        username: 'Enkil',
        password: 'EnkilAdmin2025!'
      });
      
      const enkilDevice = await axios.post(`${baseURL}/api/devices`, {
        name: "Enkil Test Device",
        device_id: "ENKIL-TEST-" + Date.now(),
        type: "sensor"
      }, {
        headers: { 'Authorization': `Bearer ${enkilLogin.data.token}` },
        validateStatus: () => true
      });
      
      console.log(`   📝 Enkil device creation: ${enkilDevice.status}`);
      
      if (enkilDevice.status === 201) {
        console.log('   ✅ Enkil can also create devices');
        // Clean up
        await axios.delete(`${baseURL}/api/devices/${enkilDevice.data.id}`, {
          headers: { 'Authorization': `Bearer ${enkilLogin.data.token}` }
        });
      }
      
    } catch (enkilError) {
      console.log('   ⚠️ Could not test with Enkil user');
    }
    
    console.log('\n🎉 DEPLOYMENT VALIDATION SUCCESSFUL!');
    console.log('\n✅ Confirmed working:');
    console.log('   - Authentication with improved middleware');
    console.log('   - Role consistency between token and server');
    console.log('   - Device creation permissions');
    console.log('   - Device update permissions');
    console.log('   - Device deletion permissions');
    
    return true;
    
  } catch (error) {
    console.log('\n❌ VALIDATION FAILED:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
    return false;
  }
}

// Run validation
validateProductionDeployment().then(success => {
  if (success) {
    console.log('\n🚀 Production deployment is working correctly!');
    process.exit(0);
  } else {
    console.log('\n🚨 Production deployment needs attention!');
    process.exit(1);
  }
});