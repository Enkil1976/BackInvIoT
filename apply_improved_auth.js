const fs = require('fs');

console.log('🔧 Applying improved authentication middleware...');

// Read the improved auth file
const improvedAuth = fs.readFileSync('./middleware/improved_auth.js', 'utf8');

// Backup current auth
const currentAuth = fs.readFileSync('./middleware/auth.js', 'utf8');
fs.writeFileSync('./middleware/auth_backup.js', currentAuth);
console.log('✅ Current auth backed up to auth_backup.js');

// Apply improved auth
fs.writeFileSync('./middleware/auth.js', improvedAuth);
console.log('✅ Improved auth applied to auth.js');

console.log('\n🎯 Changes Applied:');
console.log('1. ✅ Real-time role validation from database');
console.log('2. ✅ Logs role changes when detected');
console.log('3. ✅ Case-insensitive role comparison');
console.log('4. ✅ Better error messages with role info');
console.log('5. ✅ Backward compatible with existing routes');

console.log('\n📝 Next steps:');
console.log('1. Restart your server');
console.log('2. Test device creation');
console.log('3. Check logs for role validation messages');
console.log('4. If issues, restore: cp auth_backup.js auth.js');