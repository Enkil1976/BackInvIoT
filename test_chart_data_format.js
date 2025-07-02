const axios = require('axios');

async function testChartDataFormat() {
  console.log('📊 Testing Chart Data Format and Ordering');
  console.log('='.repeat(60));
  
  const baseURL = 'https://proyectos-iot.onrender.com';
  
  try {
    // 1. Login first
    console.log('1. Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'admin_new',
      password: 'AdminPass123!'
    });
    
    const token = loginResponse.data.token;
    console.log('   ✅ Login successful');
    
    // 2. Get chart data for temhum1
    console.log('\n2. Fetching chart data for temhum1...');
    const chartResponse = await axios.get(`${baseURL}/api/chart/temhum1`, {
      headers: { 'Authorization': `Bearer ${token}` },
      validateStatus: () => true
    });
    
    console.log(`   Status: ${chartResponse.status}`);
    
    if (chartResponse.status === 200) {
      const data = chartResponse.data;
      console.log(`   ✅ Data received: ${data.length} records`);
      
      // Analyze the first few records
      console.log('\n3. Analyzing timestamp format:');
      const sample = data.slice(0, 5);
      
      sample.forEach((record, index) => {
        console.log(`   Record ${index + 1}:`);
        console.log(`     ID: ${record.id}`);
        console.log(`     received_at: ${record.received_at}`);
        console.log(`     temperatura: ${record.temperatura}°C`);
        console.log(`     humedad: ${record.humedad}%`);
        
        // Check if received_at is properly formatted
        const date = new Date(record.received_at);
        const isValid = !isNaN(date.getTime());
        console.log(`     Parsed date: ${isValid ? date.toLocaleString('es-ES', { timeZone: 'America/Santiago' }) : 'INVALID'}`);
        console.log('     ---');
      });
      
      // Check chronological order
      console.log('\n4. Checking chronological order:');
      let isChronological = true;
      for (let i = 1; i < Math.min(data.length, 10); i++) {
        const prev = new Date(data[i-1].received_at);
        const curr = new Date(data[i].received_at);
        
        if (prev > curr) {
          isChronological = false;
          console.log(`   ❌ Order issue at index ${i}: ${prev.toISOString()} > ${curr.toISOString()}`);
        }
      }
      
      if (isChronological) {
        console.log('   ✅ Data is in chronological order (oldest to newest)');
      }
      
      // Show time range
      const firstRecord = data[0];
      const lastRecord = data[data.length - 1];
      const firstTime = new Date(firstRecord.received_at);
      const lastTime = new Date(lastRecord.received_at);
      
      console.log('\n5. Time range:');
      console.log(`   Oldest: ${firstTime.toLocaleString('es-ES', { timeZone: 'America/Santiago' })}`);
      console.log(`   Newest: ${lastTime.toLocaleString('es-ES', { timeZone: 'America/Santiago' })}`);
      console.log(`   Duration: ${Math.round((lastTime - firstTime) / (1000 * 60 * 60))} hours`);
      
    } else {
      console.log('   ❌ Failed to fetch chart data');
      console.log('   Error:', chartResponse.data);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log('   Response data:', error.response.data);
    }
  }
}

testChartDataFormat();