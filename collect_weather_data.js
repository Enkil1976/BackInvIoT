const axios = require('axios');

async function collectMultipleWeatherData() {
  try {
    console.log('🔐 Logging in as admin...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:4000/api/auth/login', {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Successfully logged in');
    
    // Collect weather data multiple times (simulate historical data)
    for (let i = 0; i < 5; i++) {
      console.log(`🌤️ Collecting weather data (${i + 1}/5)...`);
      
      const collectResponse = await axios.post('http://localhost:4000/api/weather/collect', {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Collection ${i + 1} successful:`, collectResponse.data.data.id);
      
      // Wait a few seconds between collections
      if (i < 4) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Check how many records we have now
    console.log('📊 Checking total weather records...');
    const latestResponse = await axios.get('http://localhost:4000/api/weather/latest?limit=10');
    
    console.log('✅ Weather data records:');
    if (latestResponse.data.data) {
      if (Array.isArray(latestResponse.data.data)) {
        console.log(`Total records: ${latestResponse.data.data.length}`);
        latestResponse.data.data.forEach((record, index) => {
          console.log(`${index + 1}. ID: ${record.id}, Temp: ${record.temperatura}°C, Humid: ${record.humedad}%, Time: ${record.received_at}`);
        });
      } else {
        console.log('Single record:', latestResponse.data.data);
      }
    }
    
    // Test chart endpoint
    console.log('📈 Testing chart endpoint...');
    const chartResponse = await axios.get('http://localhost:4000/api/weather/chart?hours=24');
    console.log(`Chart data: ${chartResponse.data.length} records`);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

collectMultipleWeatherData();