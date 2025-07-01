require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function createAdminUser() {
  console.log('🔐 Creating new admin user...');
  
  try {
    // User details - modify as needed
    const userData = {
      username: 'admin_new',
      email: 'admin@invernadero.com',
      password: 'AdminPass123!', // Change this to a secure password
      role: 'admin'
    };
    
    console.log(`Creating user: ${userData.username}`);
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [userData.username, userData.email]
    );
    
    if (existingUser.rows.length > 0) {
      console.log('❌ User already exists with this username or email');
      return;
    }
    
    // Hash password
    console.log('🔒 Hashing password...');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
    
    // Insert user
    const query = `
      INSERT INTO users (username, email, password_hash, role, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, username, email, role, created_at
    `;
    
    const result = await pool.query(query, [
      userData.username,
      userData.email,
      hashedPassword,
      userData.role
    ]);
    
    const newUser = result.rows[0];
    
    console.log('✅ Admin user created successfully!');
    console.log('📋 User details:');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Username: ${newUser.username}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Role: ${newUser.role}`);
    console.log(`   Created: ${newUser.created_at}`);
    
    console.log('\n🔑 Login credentials:');
    console.log(`   Username: ${userData.username}`);
    console.log(`   Password: ${userData.password}`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Use these credentials to login in the frontend');
    console.log('2. Try creating a device again');
    console.log('3. The new JWT token will have the correct admin role');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.code === '23505') {
      console.log('   Duplicate key violation - user already exists');
    }
  } finally {
    await pool.end();
  }
}

createAdminUser();