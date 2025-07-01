require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { protect, authorize } = require('./middleware/auth');
const logger = require('./config/logger');

const app = express();
app.use(cors());
app.use(express.json());

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`\n🔍 [DEBUG] ${req.method} ${req.path}`);
  console.log('📋 [DEBUG] Headers:', {
    authorization: req.headers.authorization,
    'content-type': req.headers['content-type']
  });
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 [DEBUG] Body:', req.body);
  }
  next();
});

// Debug the exact same middleware chain as devices
app.post('/debug/devices', protect, authorize(['admin', 'editor']), (req, res) => {
  console.log('✅ [DEBUG] Authorization passed!');
  console.log('👤 [DEBUG] User:', req.user);
  res.json({ 
    success: true, 
    message: 'Authorization successful',
    user: req.user 
  });
});

// Test endpoint without authorization
app.post('/debug/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
});

const PORT = 4001; // Different port to avoid conflicts
app.listen(PORT, () => {
  console.log(`🚀 Debug server running on port ${PORT}`);
  console.log('🧪 Test with:');
  console.log(`   POST http://localhost:${PORT}/debug/devices`);
  console.log('   Headers: Authorization: Bearer YOUR_JWT_TOKEN');
});

module.exports = app;