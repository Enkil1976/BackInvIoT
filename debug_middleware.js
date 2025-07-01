// Test the authorize middleware function
const { authorize } = require('./middleware/auth');

console.log('🔍 Middleware Debug:');

// Test how authorize function is called
const middlewareFunction = authorize(['admin', 'editor']);
console.log('  - authorize function type:', typeof authorize);
console.log('  - middleware function type:', typeof middlewareFunction);

// Test the roles array
const roles = ['admin', 'editor'];
console.log('  - roles array:', roles);
console.log('  - roles includes admin:', roles.includes('admin'));
console.log('  - roles includes editor:', roles.includes('editor'));

// Simulate the middleware call
const mockReq = {
  user: { username: 'Enkil', role: 'admin' },
  method: 'POST',
  originalUrl: '/api/devices'
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`  - Response: ${code} - ${JSON.stringify(data)}`);
      return mockRes;
    }
  })
};

const mockNext = () => {
  console.log('  - ✅ Next() called - Authorization passed');
};

console.log('\n🧪 Testing middleware with mock admin user:');
try {
  middlewareFunction(mockReq, mockRes, mockNext);
} catch (error) {
  console.log('  - ❌ Error:', error.message);
}