require('dotenv').config();

console.log('🔍 Environment Variables Check:');
console.log('='.repeat(40));

const requiredVars = [
  'JWT_SECRET',
  'PG_URI',
  'REDIS_HOST',
  'REDIS_PORT'
];

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const displayValue = varName.includes('SECRET') || varName.includes('URI') 
      ? `${value.substring(0, 10)}...` 
      : value;
    console.log(`✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

console.log('\n🔍 JWT Secret Analysis:');
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret) {
  console.log(`   Length: ${jwtSecret.length}`);
  console.log(`   Starts with: ${jwtSecret.substring(0, 5)}...`);
  console.log(`   Is default: ${jwtSecret === 'supersecret' ? 'YES (INSECURE!)' : 'NO'}`);
} else {
  console.log('   ❌ JWT_SECRET not configured');
}