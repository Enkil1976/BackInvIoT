// Import the exact same middleware code to test it
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Copy the exact authorize function from middleware/auth.js
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log('🔍 [DEBUG] Authorize middleware called with roles:', roles);
    console.log('🔍 [DEBUG] req.user:', req.user);
    
    if (!req.user || !req.user.role) {
      console.log('❌ [DEBUG] No user or role found');
      return res.status(401).json({ error: 'Not authorized to access this resource' });
    }
    
    console.log('🔍 [DEBUG] User role:', req.user.role);
    console.log('🔍 [DEBUG] Required roles:', roles);
    console.log('🔍 [DEBUG] roles.includes(req.user.role):', roles.includes(req.user.role));
    
    if (!roles.includes(req.user.role)) {
      console.log('❌ [DEBUG] Authorization failed');
      return res.status(403).json({ error: 'Forbidden: You do not have the required role to access this resource' });
    }
    
    console.log('✅ [DEBUG] Authorization passed');
    next();
  };
};

// Test the middleware function directly
console.log('🧪 Testing authorize middleware directly...');
console.log('='.repeat(50));

// Mock request object like protect middleware would create
const mockReq = {
  user: {
    id: 7,
    username: 'admin_new',
    role: 'admin'
  },
  method: 'POST',
  originalUrl: '/api/devices'
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`📤 Response: ${code} - ${JSON.stringify(data)}`);
      return mockRes;
    }
  })
};

const mockNext = () => {
  console.log('✅ next() called - middleware passed');
};

console.log('Test 1: authorize([\'admin\', \'editor\'])');
const middleware1 = authorize(['admin', 'editor']);
middleware1(mockReq, mockRes, mockNext);

console.log('\nTest 2: authorize(\'admin\', \'editor\') - spread syntax');
const middleware2 = authorize('admin', 'editor');
middleware2(mockReq, mockRes, mockNext);