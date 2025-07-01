const axios = require('axios');

async function testDebugEndpoint() {
  console.log('🔍 Testing debug endpoint...');
  console.log('='.repeat(60));
  
  const endpoints = [
    { name: 'Local Server', url: 'http://localhost:4000' },
    { name: 'Deployed Server', url: 'https://proyectos-iot.onrender.com' }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing ${endpoint.name} (${endpoint.url})`);
    console.log('-'.repeat(40));
    
    try {
      const response = await axios.post(`${endpoint.url}/api/auth/debug-login`, {
        username: 'Enkil'
      }, {
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      });
      
      console.log(`✅ Response Status: ${response.status}`);
      
      if (response.status === 200) {
        const data = response.data;
        console.log('📋 Debug Information:');
        console.log(`   Database User:`, data.database_user);
        console.log(`   JWT Payload:`, data.jwt_payload);
        console.log(`   JWT Secret Set:`, data.jwt_secret_set);
        console.log(`   JWT Secret Length:`, data.jwt_secret_length);
        
        // Test if the generated token has correct role
        const tokenRole = data.jwt_payload?.role;
        const dbRole = data.database_user?.role;
        
        console.log('\n🔐 Role Analysis:');
        console.log(`   Database Role: "${dbRole}"`);
        console.log(`   Token Role: "${tokenRole}"`);
        console.log(`   Roles Match: ${dbRole === tokenRole ? '✅ YES' : '❌ NO'}`);
        
        // Authorization test
        const requiredRoles = ['admin', 'editor'];
        const hasPermission = requiredRoles.includes(tokenRole);
        console.log(`   Has Permission: ${hasPermission ? '✅ YES' : '❌ NO'}`);
        
      } else if (response.status === 404) {
        console.log('❌ Debug endpoint not found - server needs restart or deployment');
      } else {
        console.log('❌ Error Response:', response.data);
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Connection refused - server not running');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('❌ Timeout - server not responding');
      } else {
        console.log('❌ Error:', error.message);
      }
    }
  }
  
  console.log('\n📝 Conclusions:');
  console.log('1. Compare the JWT Secret Length between servers');
  console.log('2. Check if Database Role matches Token Role');
  console.log('3. If deployed server differs, redeploy with latest code');
}

testDebugEndpoint();