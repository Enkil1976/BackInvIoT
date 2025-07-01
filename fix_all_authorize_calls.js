const fs = require('fs');
const path = require('path');

function fixAuthorizeCallsInFile(filePath) {
  console.log(`🔧 Fixing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Replace authorize(['role1', 'role2']) with authorize('role1', 'role2')
  content = content.replace(/authorize\(\[([^\]]+)\]\)/g, (match, rolesStr) => {
    changes++;
    // Remove quotes and split by comma, then join with quotes
    const roles = rolesStr.split(',').map(role => role.trim().replace(/['"]/g, ''));
    return `authorize(${roles.map(role => `'${role}'`).join(', ')})`;
  });
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`   ✅ Fixed ${changes} authorize call(s)`);
  } else {
    console.log(`   ℹ️  No changes needed`);
  }
  
  return changes;
}

const routeFiles = [
  'routes/scheduledOperations.js',
  'routes/rules.js', 
  'routes/systemAdmin.js',
  'routes/operations.js'
];

console.log('🔧 Fixing authorize middleware calls...');
console.log('='.repeat(50));

let totalChanges = 0;
for (const file of routeFiles) {
  if (fs.existsSync(file)) {
    totalChanges += fixAuthorizeCallsInFile(file);
  } else {
    console.log(`❌ File not found: ${file}`);
  }
}

console.log(`\n📊 Summary: Fixed ${totalChanges} total authorize call(s)`);
console.log('\n🚀 Next steps:');
console.log('1. Test device creation locally');
console.log('2. If it works, deploy the fixes to the server');