const fs = require('fs');
const path = require('path');

function fixCjsImports(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      fixCjsImports(fullPath);
    } else if (item.name.endsWith('.cjs')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Replace relative require statements to use .cjs extensions  
      content = content.replace(/require\(["'](\.[^"']*?)["']\)/g, (match, relativePath) => {
        // Don't modify already processed paths, absolute imports, or JSON files
        if (relativePath.endsWith('.cjs') || 
            relativePath.endsWith('.json') ||
            relativePath.startsWith('./node_modules') || 
            relativePath.startsWith('../node_modules') ||
            relativePath.startsWith('node:')) {
          return match;
        }
        
        // Remove .js extension if present
        const cleanPath = relativePath.replace(/\.js$/, '');
        
        // Check if this is a directory import by checking if an index.cjs file exists
        const targetPath = path.resolve(path.dirname(fullPath), cleanPath);
        const indexPath = path.join(targetPath, 'index.cjs');
        
        if (fs.existsSync(indexPath)) {
          // This is a directory import - point to index.cjs explicitly
          return `require("${cleanPath}/index.cjs")`;
        } else if (fs.existsSync(targetPath + '.cjs')) {
          // This is a file import - add .cjs extension
          return `require("${cleanPath}.cjs")`;
        } else {
          // Check if there's a file with an existing extension that we need to add .cjs to
          const dirPath = path.dirname(targetPath);
          const basename = path.basename(targetPath);
          const files = fs.readdirSync(dirPath);
          const matchingFile = files.find(f => f.startsWith(basename + '.') && f.endsWith('.cjs'));
          
          if (matchingFile) {
            const relativeName = matchingFile.replace(/\.cjs$/, '');
            return `require("${path.join(path.dirname(cleanPath), relativeName)}.cjs")`;
          }
          
          // Default case - just add .cjs
          return `require("${cleanPath}.cjs")`;
        }
      });
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

if (require.main === module) {
  const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');
  console.log('Fixing CJS imports...');
  fixCjsImports(cjsDir);
  console.log('CJS imports fixed!');
}