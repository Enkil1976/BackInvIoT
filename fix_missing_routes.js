const fs = require('fs');
const path = require('path');

console.log('🔍 Analyzing route files vs server.js imports...');

// Get all route files
const routesDir = './routes';
const routeFiles = fs.readdirSync(routesDir)
  .filter(file => file.endsWith('.js'))
  .map(file => file.replace('.js', ''));

console.log('\n📁 Route files found:');
routeFiles.forEach(file => console.log(`   - ${file}.js`));

// Read server.js
const serverContent = fs.readFileSync('./server.js', 'utf8');

console.log('\n📋 Route imports in server.js:');
const importedRoutes = [];
routeFiles.forEach(file => {
  const importPattern = new RegExp(`require\\(['"]\\./routes/${file}['"]\\)`, 'g');
  if (serverContent.match(importPattern)) {
    console.log(`   ✅ ${file} - IMPORTED`);
    importedRoutes.push(file);
  } else {
    console.log(`   ❌ ${file} - NOT IMPORTED`);
  }
});

console.log('\n🚀 Route mountings in server.js:');
const mountPatterns = [
  /app\.use\(['"]([^'"]+)['"],\s*(\w+)\)/g
];

let match;
const mountedRoutes = [];
for (const pattern of mountPatterns) {
  while ((match = pattern.exec(serverContent)) !== null) {
    console.log(`   ✅ ${match[1]} -> ${match[2]}`);
    mountedRoutes.push(match[2]);
  }
}

console.log('\n🔧 Missing imports/mounts:');
const missing = routeFiles.filter(file => !importedRoutes.includes(file));
if (missing.length > 0) {
  console.log('Missing route imports:');
  missing.forEach(file => {
    console.log(`   const ${file}Routes = require('./routes/${file}');`);
  });
  
  console.log('\nMissing route mounts:');
  missing.forEach(file => {
    const mountPath = file === 'index' ? '/api' : `/api/${file}`;
    console.log(`   app.use('${mountPath}', ${file}Routes);`);
  });
} else {
  console.log('All route files are imported!');
}