#!/usr/bin/env node

/**
 * Script de prueba para la configuración de ubicación meteorológica
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

// Credenciales de prueba (ajustar según tu configuración)
const TEST_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

async function testWeatherConfiguration() {
  console.log('🌤️ Testing Weather Location Configuration...\n');

  try {
    // 1. Login para obtener token
    console.log('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_CREDENTIALS);
    
    if (!loginResponse.data.token) {
      throw new Error('No token received from login');
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Obtener configuración actual
    console.log('2. 📋 Getting current weather configuration...');
    try {
      const configResponse = await axios.get(`${BASE_URL}/api/weather/config`, { headers });
      console.log('✅ Current weather config:');
      console.log(JSON.stringify(configResponse.data, null, 2));
      console.log('');
    } catch (error) {
      console.log('❌ Error getting config:', error.response?.data || error.message);
      console.log('');
    }

    // 3. Probar una ubicación
    console.log('3. 🧪 Testing a location...');
    const testLocation = 'Santiago, Chile';
    try {
      const testResponse = await axios.post(`${BASE_URL}/api/weather/test-location`, 
        { location: testLocation }, 
        { headers }
      );
      console.log(`✅ Test location "${testLocation}" successful:`);
      console.log(JSON.stringify(testResponse.data, null, 2));
      console.log('');
    } catch (error) {
      console.log(`❌ Error testing location "${testLocation}":`, error.response?.data || error.message);
      console.log('');
    }

    // 4. Actualizar configuración
    console.log('4. 💾 Updating weather location...');
    const newLocation = 'Valparaíso, Chile';
    try {
      const updateResponse = await axios.put(`${BASE_URL}/api/weather/config`, 
        { location: newLocation }, 
        { headers }
      );
      console.log(`✅ Location updated to "${newLocation}":`);
      console.log(JSON.stringify(updateResponse.data, null, 2));
      console.log('');
    } catch (error) {
      console.log(`❌ Error updating location to "${newLocation}":`, error.response?.data || error.message);
      console.log('');
    }

    // 5. Verificar configuración actualizada
    console.log('5. 🔍 Verifying updated configuration...');
    try {
      const verifyResponse = await axios.get(`${BASE_URL}/api/weather/config`, { headers });
      console.log('✅ Updated weather config:');
      console.log(JSON.stringify(verifyResponse.data, null, 2));
      console.log('');
    } catch (error) {
      console.log('❌ Error verifying config:', error.response?.data || error.message);
      console.log('');
    }

    // 6. Probar datos meteorológicos actuales
    console.log('6. 🌡️ Testing current weather data...');
    try {
      const weatherResponse = await axios.get(`${BASE_URL}/api/weather/current`);
      console.log('✅ Current weather data:');
      console.log(JSON.stringify(weatherResponse.data, null, 2));
      console.log('');
    } catch (error) {
      console.log('❌ Error getting current weather:', error.response?.data || error.message);
      console.log('');
    }

    console.log('✅ Weather configuration test completed!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Ejecutar prueba
testWeatherConfiguration();