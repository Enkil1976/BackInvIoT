#!/usr/bin/env node

/**
 * Script de prueba para la configuración de coordenadas de ubicación meteorológica
 * Prueba específicamente subestaciones eléctricas usando coordenadas precisas
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

// Credenciales de prueba
const TEST_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// Subestaciones eléctricas de Chile con coordenadas
const SUBSTATIONS = [
  { name: 'S/E Alto Jahuel 500kV', coords: '-33.2167,-70.7333', region: 'Región Metropolitana' },
  { name: 'S/E Los Vilos 220kV', coords: '-31.9167,-71.5167', region: 'Región de Coquimbo' },
  { name: 'S/E Maitencillo 500kV', coords: '-33.0833,-71.4333', region: 'Región de Valparaíso' },
  { name: 'S/E Cardones 220kV', coords: '-24.7833,-70.1167', region: 'Región de Antofagasta' },
  { name: 'S/E Charrúa 500kV', coords: '-36.7333,-73.1167', region: 'Región del Biobío' },
  { name: 'S/E Temuco 220kV', coords: '-38.7333,-72.6000', region: 'Región de La Araucanía' }
];

async function testWeatherCoordinates() {
  console.log('🌤️ Testing Weather Coordinates Configuration...\n');

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

    // 2. Probar cada subestación
    for (let i = 0; i < SUBSTATIONS.length; i++) {
      const substation = SUBSTATIONS[i];
      console.log(`${i + 2}. 🧪 Testing ${substation.name} (${substation.coords})...`);
      
      try {
        // Probar la ubicación por coordenadas
        const testResponse = await axios.post(`${BASE_URL}/api/weather/test-location`, 
          { location: substation.coords }, 
          { headers }
        );
        
        console.log(`✅ Coordinates ${substation.coords} valid:`)
        console.log(`   📍 Location: ${testResponse.data.locationInfo.name}, ${testResponse.data.locationInfo.region}, ${testResponse.data.locationInfo.country}`);
        console.log(`   🌡️ Current: ${testResponse.data.currentWeather.temperatura}°C, ${testResponse.data.currentWeather.condicion}`);
        console.log(`   📊 Coords: ${testResponse.data.locationInfo.lat}, ${testResponse.data.locationInfo.lon}`);
        console.log('');
      } catch (error) {
        console.log(`❌ Error testing ${substation.name}:`, error.response?.data?.message || error.message);
        console.log('');
      }

      // Pausa para no saturar la API
      if (i < SUBSTATIONS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 3. Configurar una subestación específica
    const selectedSubstation = SUBSTATIONS[0]; // Alto Jahuel
    console.log(`${SUBSTATIONS.length + 2}. 💾 Setting weather location to ${selectedSubstation.name}...`);
    
    try {
      const updateResponse = await axios.put(`${BASE_URL}/api/weather/config`, 
        { location: selectedSubstation.coords }, 
        { headers }
      );
      
      console.log(`✅ Location updated to coordinates: ${selectedSubstation.coords}`);
      console.log('Configuration:', JSON.stringify(updateResponse.data.config, null, 2));
      console.log('');
    } catch (error) {
      console.log(`❌ Error updating location:`, error.response?.data || error.message);
      console.log('');
    }

    // 4. Verificar datos meteorológicos con coordenadas
    console.log(`${SUBSTATIONS.length + 3}. 🌡️ Getting weather data for configured coordinates...`);
    try {
      const weatherResponse = await axios.get(`${BASE_URL}/api/weather/current`);
      console.log('✅ Current weather data from coordinates:');
      console.log('Location:', weatherResponse.data.data.location);
      console.log('Weather:', {
        temperatura: weatherResponse.data.data.current.temperatura,
        humedad: weatherResponse.data.data.current.humedad,
        condicion: weatherResponse.data.data.current.condicion,
        viento: weatherResponse.data.data.current.velocidad_viento
      });
      console.log('');
    } catch (error) {
      console.log('❌ Error getting current weather:', error.response?.data || error.message);
      console.log('');
    }

    // 5. Probar formato de coordenadas inválido
    console.log(`${SUBSTATIONS.length + 4}. 🚫 Testing invalid coordinate format...`);
    try {
      await axios.post(`${BASE_URL}/api/weather/test-location`, 
        { location: '999,999' }, // Coordenadas inválidas
        { headers }
      );
    } catch (error) {
      console.log('✅ Invalid coordinates properly rejected:', error.response?.data?.message || error.message);
      console.log('');
    }

    console.log('✅ Weather coordinates testing completed!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Ejecutar prueba
testWeatherCoordinates();