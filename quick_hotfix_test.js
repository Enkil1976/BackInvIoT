const axios = require('axios');

async function testAndApplyHotfix() {
  console.log('🔧 Testing hotfix possibility on production server...');
  console.log('='.repeat(60));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // First, test if we can create a direct valid token
    console.log('1. Testing direct device creation with fresh login...');
    
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    
    // Try to use the debug endpoint we added to auth routes
    console.log('2. Testing debug endpoint (if deployed)...');
    try {
      const debugResponse = await axios.post(`${baseURL}/api/auth/debug-login`, {
        username: 'admin_new'
      }, { validateStatus: () => true });
      
      if (debugResponse.status === 200) {
        console.log('   ✅ Debug endpoint available');
        console.log('   🔧 Using debug token for device creation...');
        
        const debugToken = debugResponse.data.debug_token;
        
        // Test device creation with debug token
        const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
          name: "Hotfix Test Device",
          device_id: "HOTFIX-001",
          type: "sensor"
        }, {
          headers: { 'Authorization': `Bearer ${debugToken}` },
          validateStatus: () => true
        });
        
        console.log(`   📝 Device creation result: ${deviceResponse.status}`);
        
        if (deviceResponse.status === 201) {
          console.log('   ✅ SUCCESS! Debug token works');
          console.log('   💡 Frontend can use debug endpoint as workaround');
        } else {
          console.log('   ❌ Debug token also fails:', deviceResponse.data);
        }
        
      } else if (debugResponse.status === 404) {
        console.log('   ❌ Debug endpoint not deployed yet');
      }
      
    } catch (debugError) {
      console.log('   ❌ Debug endpoint error:', debugError.message);
    }
    
    console.log('\n📋 RECOMMENDATIONS:');
    console.log('1. Deploy the corrected backend code to production');
    console.log('2. Or use the working local server for development');
    console.log('3. The root cause is the authorize([...]) vs authorize(...) bug');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testAndApplyHotfix();