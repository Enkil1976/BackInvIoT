require('dotenv').config();
const redis = require('./config/redis');

async function clearUserSessions() {
  console.log('🧹 Clearing Redis sessions for user...');
  console.log('='.repeat(50));
  
  try {
    // Clear all sessions for user ID 2 (Enkil)
    const userId = 2;
    
    console.log(`1. Searching for sessions for user ID: ${userId}`);
    
    // Get all keys that match the session pattern for this user
    const sessionKeys = await redis.keys(`session:${userId}:*`);
    
    console.log(`   Found ${sessionKeys.length} session(s)`);
    
    if (sessionKeys.length > 0) {
      console.log('   Sessions found:');
      sessionKeys.forEach(key => {
        console.log(`      - ${key}`);
      });
      
      // Delete all sessions for this user
      console.log('\n2. Deleting old sessions...');
      const deleted = await redis.del(...sessionKeys);
      console.log(`   ✅ Deleted ${deleted} session(s)`);
    } else {
      console.log('   No sessions found to delete');
    }
    
    // Also clear any general cache that might be interfering
    console.log('\n3. Clearing any auth-related cache...');
    const authKeys = await redis.keys('auth:*');
    if (authKeys.length > 0) {
      await redis.del(...authKeys);
      console.log(`   ✅ Cleared ${authKeys.length} auth cache entries`);
    }
    
    console.log('\n📝 Next steps:');
    console.log('1. Clear browser localStorage');
    console.log('2. Login again with "Enkil"');
    console.log('3. Server will generate fresh JWT token');
    console.log('4. No cached sessions will interfere');
    
  } catch (error) {
    console.error('❌ Error clearing sessions:', error.message);
  } finally {
    await redis.disconnect();
  }
}

clearUserSessions();