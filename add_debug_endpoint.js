const fs = require('fs');

// Add a debug endpoint to the auth routes
const debugEndpoint = `

// DEBUG ENDPOINT - Remove in production
router.post('/debug-login', async (req, res) => {
  try {
    const { username } = req.body;
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, username, email, role FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Create JWT with current database role
    const JWT_SECRET = process.env.JWT_SECRET;
    const payload = { 
      id: user.id, 
      sub: user.id.toString(),
      username: user.username, 
      role: user.role 
    };
    const debugToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    
    // Verify the token immediately
    const verified = jwt.verify(debugToken, JWT_SECRET);
    
    res.json({
      success: true,
      database_user: user,
      jwt_payload: payload,
      verified_payload: verified,
      debug_token: debugToken,
      jwt_secret_set: !!JWT_SECRET,
      jwt_secret_length: JWT_SECRET ? JWT_SECRET.length : 0
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});`;

// Read current auth.js file
const authFilePath = './routes/auth.js';
let authContent = fs.readFileSync(authFilePath, 'utf8');

// Check if debug endpoint already exists
if (authContent.includes('debug-login')) {
  console.log('❌ Debug endpoint already exists in auth.js');
  return;
}

// Add the debug endpoint before module.exports
const moduleExportIndex = authContent.lastIndexOf('module.exports');
if (moduleExportIndex === -1) {
  console.log('❌ Could not find module.exports in auth.js');
  return;
}

// Insert debug endpoint
const newContent = authContent.slice(0, moduleExportIndex) + 
                  debugEndpoint + '\n\n' + 
                  authContent.slice(moduleExportIndex);

// Write back to file
fs.writeFileSync(authFilePath, newContent);

console.log('✅ Debug endpoint added to auth.js');
console.log('📋 Endpoint: POST /api/auth/debug-login');
console.log('📋 Body: { "username": "Enkil" }');
console.log('');
console.log('🚀 Next steps:');
console.log('1. Restart the server');
console.log('2. Test the debug endpoint');
console.log('3. Compare local vs deployed server responses');