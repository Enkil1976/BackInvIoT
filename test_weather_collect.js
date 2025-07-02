const axios = require('axios');

async function testWeatherCollection() {
  try {
    console.log('🔐 Logging in as admin...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:4000/api/auth/login', {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Successfully logged in');
    
    // Collect weather data
    console.log('🌤️ Collecting weather data...');
    const collectResponse = await axios.post('http://localhost:4000/api/weather/collect', {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Weather data collected successfully:');
    console.log(JSON.stringify(collectResponse.data, null, 2));
    
    // Check latest data
    console.log('📊 Checking latest weather data...');
    const latestResponse = await axios.get('http://localhost:4000/api/weather/latest');
    
    console.log('✅ Latest weather data:');
    console.log(JSON.stringify(latestResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testWeatherCollection();