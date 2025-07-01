const axios = require('axios');

async function finalDiagnosis() {
  console.log('🔬 Final Diagnosis - Testing Both Users');
  console.log('='.repeat(60));
  
  const users = [
    { username: 'Enkil', password: 'EnkilAdmin2025!', expected: 'Should work but has issues' },
    { username: 'admin_new', password: 'AdminPass123!', expected: 'Should work perfectly' }
  ];
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  for (const user of users) {
    console.log(`\n👤 Testing User: ${user.username}`);
    console.log('-'.repeat(40));
    
    try {
      // 1. Login
      console.log('1. Attempting login...');
      const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
        username: user.username,
        password: user.password
      });
      
      console.log('   ✅ Login successful');
      const token = loginResponse.data.token;
      const userInfo = loginResponse.data.user;
      
      console.log(`   👤 User info: ID=${userInfo.id}, Role="${userInfo.role}"`);
      
      // 2. Decode token
      console.log('2. Analyzing token...');
      const base64Payload = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
      
      console.log(`   🎫 Token role: "${payload.role}"`);
      console.log(`   🔍 Role match: ${userInfo.role === payload.role ? '✅ YES' : '❌ NO'}`);
      
      // 3. Test device creation
      console.log('3. Testing device creation...');
      const deviceResponse = await axios.post(`${baseURL}/api/devices`, {
        name: `Test Device ${user.username}`,
        device_id: `TEST-${user.username}`,
        type: "sensor"
      }, {
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      });
      
      console.log(`   📝 Device creation: ${deviceResponse.status}`);
      
      if (deviceResponse.status === 201) {
        console.log('   ✅ SUCCESS - Device created!');
        console.log(`   📦 Device: ${deviceResponse.data.name}`);
      } else if (deviceResponse.status === 403) {
        console.log('   ❌ FORBIDDEN - Role issue confirmed');
        console.log(`   💬 Error: ${deviceResponse.data.error}`);
      } else {
        console.log(`   ⚠️  Other error: ${deviceResponse.data.error}`);
      }
      
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('   ❌ Login failed - incorrect credentials');
      } else {
        console.log('   ❌ Error:', error.message);
      }
    }
  }
  
  console.log('\n🎯 RECOMMENDATION:');
  console.log('Use admin_new for immediate device creation');
  console.log('The Enkil user has a JWT generation issue that needs server redeployment to fix');
}

finalDiagnosis();