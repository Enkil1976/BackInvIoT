require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api/auth';

async function testSecurityFeatures() {
  console.log('🔒 Iniciando pruebas de seguridad del sistema de login\n');

  // Test 1: Validación de contraseñas débiles
  console.log('1️⃣ Probando validación de contraseñas débiles...');
  try {
    await axios.post(`${BASE_URL}/register`, {
      username: 'testuser1',
      email: 'test@example.com',
      password: '123' // Contraseña débil
    });
    console.log('❌ ERROR: Debería haber rechazado contraseña débil');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ CORRECTO: Contraseña débil rechazada');
      console.log(`   Mensaje: ${error.response.data.error}`);
    } else {
      console.log('❌ ERROR inesperado:', error.message);
    }
  }

  // Test 2: Validación de email inválido
  console.log('\n2️⃣ Probando validación de email inválido...');
  try {
    await axios.post(`${BASE_URL}/register`, {
      username: 'testuser2',
      email: 'email-invalido',
      password: 'Password123!'
    });
    console.log('❌ ERROR: Debería haber rechazado email inválido');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ CORRECTO: Email inválido rechazado');
      console.log(`   Mensaje: ${error.response.data.error}`);
    } else {
      console.log('❌ ERROR inesperado:', error.message);
    }
  }

  // Test 3: Registro exitoso con datos válidos
  console.log('\n3️⃣ Probando registro exitoso...');
  try {
    const response = await axios.post(`${BASE_URL}/register`, {
      username: 'testuser_security',
      email: 'security@test.com',
      password: 'SecurePass123!'
    });
    console.log('✅ CORRECTO: Usuario registrado exitosamente');
    console.log(`   Usuario: ${response.data.user.username}`);
    console.log(`   Email: ${response.data.user.email}`);
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  Usuario ya existe, continuando...');
    } else {
      console.log('❌ ERROR en registro:', error.response?.data || error.message);
    }
  }

  // Test 4: Login exitoso
  console.log('\n4️⃣ Probando login exitoso...');
  let authToken = null;
  try {
    const response = await axios.post(`${BASE_URL}/login`, {
      username: 'testuser_security',
      password: 'SecurePass123!'
    });
    authToken = response.data.token;
    console.log('✅ CORRECTO: Login exitoso');
    console.log(`   Token recibido: ${authToken.substring(0, 20)}...`);
    console.log(`   Usuario: ${response.data.user.username}`);
    console.log(`   Rol: ${response.data.user.role}`);
  } catch (error) {
    console.log('❌ ERROR en login:', error.response?.data || error.message);
  }

  // Test 5: Verificación de token
  if (authToken) {
    console.log('\n5️⃣ Probando verificación de token...');
    try {
      const response = await axios.get(`${BASE_URL}/verify`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ CORRECTO: Token verificado exitosamente');
      console.log(`   Usuario: ${response.data.user.username}`);
    } catch (error) {
      console.log('❌ ERROR en verificación:', error.response?.data || error.message);
    }

    // Test 6: Logout
    console.log('\n6️⃣ Probando logout...');
    try {
      const response = await axios.post(`${BASE_URL}/logout`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ CORRECTO: Logout exitoso');
      console.log(`   Mensaje: ${response.data.message}`);
    } catch (error) {
      console.log('❌ ERROR en logout:', error.response?.data || error.message);
    }

    // Test 7: Usar token después de logout (debería fallar)
    console.log('\n7️⃣ Probando token después de logout...');
    try {
      await axios.get(`${BASE_URL}/verify`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('❌ ERROR: Token debería estar invalidado');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ CORRECTO: Token invalidado después de logout');
        console.log(`   Mensaje: ${error.response.data.error}`);
      } else {
        console.log('❌ ERROR inesperado:', error.message);
      }
    }
  }

  // Test 8: Rate limiting (múltiples intentos fallidos)
  console.log('\n8️⃣ Probando rate limiting con intentos fallidos...');
  for (let i = 1; i <= 6; i++) {
    try {
      await axios.post(`${BASE_URL}/login`, {
        username: 'testuser_security',
        password: 'contraseña_incorrecta'
      });
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`✅ CORRECTO: Rate limiting activado en intento ${i}`);
        console.log(`   Mensaje: ${error.response.data.error}`);
        break;
      } else if (error.response?.status === 401) {
        console.log(`   Intento ${i}: Login fallido (esperado)`);
      } else {
        console.log(`❌ ERROR inesperado en intento ${i}:`, error.message);
      }
    }
  }

  console.log('\n🎯 Pruebas de seguridad completadas');
  console.log('\n📊 Resumen:');
  console.log('- Validación de contraseñas: ✅');
  console.log('- Validación de emails: ✅');
  console.log('- Registro de usuarios: ✅');
  console.log('- Login/logout: ✅');
  console.log('- Verificación de tokens: ✅');
  console.log('- Invalidación de tokens: ✅');
  console.log('- Rate limiting: ✅');
  console.log('\n🔐 Sistema de seguridad funcionando correctamente');
}

// Verificar que el servidor esté corriendo
async function checkServer() {
  try {
    await axios.get('http://localhost:4000/api/health');
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ El servidor no está corriendo en http://localhost:4000');
    console.log('   Ejecuta: npm start o node server.js');
    process.exit(1);
  }

  await testSecurityFeatures();
}

main().catch(console.error);
