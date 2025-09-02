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

      // Convert import statements with JSON assertions to require statements
      content = content.replace(
        /import\s+(\w+)\s+from\s+["']([^"']+\.json)["']\s+with\s+\{\s*type:\s*["']json["']\s*\};?/g,
        (match, varName, jsonPath) => {
          return `const ${varName} = require("${jsonPath}");`;
        },
      );

      // Convert default imports to require statements
      content = content.replace(
        /import\s+(\w+)\s+from\s+["']([^"']+)["'];?/g,
        (match, varName, modulePath) => {
          return `const ${varName} = require("${modulePath}");`;
        },
      );

      // Convert named imports to require statements with destructuring
      content = content.replace(
        /import\s*\{\s*([^}]+)\s*\}\s*from\s+["']([^"']+)["'];?/g,
        (match, namedImports, modulePath) => {
          return `const { ${namedImports} } = require("${modulePath}");`;
        },
      );

      // Convert star imports to require statements
      content = content.replace(
        /import\s*\*\s*as\s+(\w+)\s+from\s+["']([^"']+)["'];?/g,
        (match, varName, modulePath) => {
          return `const ${varName} = require("${modulePath}");`;
        },
      );

      // Convert export statements to module.exports
      content = content.replace(/export\s+default\s+(.*);?/g, 'module.exports = $1;');
      content = content.replace(/export\s*\{\s*([^}]+)\s*\};?/g, (match, namedExports) => {
        return `module.exports = { ${namedExports} };`;
      });
      content = content.replace(/export\s+const\s+(\w+)\s*=/g, 'module.exports.$1 =');
      content = content.replace(/export\s+function\s+(\w+)/g, 'function $1');
      content = content.replace(/export\s+class\s+(\w+)/g, 'class $1');

      // Fix package.json imports to account for dist/cjs/src depth
      content = content.replace(
        /require\(["']\.\.\/package\.json["']\)/g,
        'require("../../../package.json")',
      );
      content = content.replace(
        /require\(["']\.\.\/\.\.\/package\.json["']\)/g,
        'require("../../../../package.json")',
      );

      // Replace relative require statements to use .cjs extensions
      content = content.replace(/require\(["'](\.[^"']*?)["']\)/g, (match, relativePath) => {
        // Don't modify already processed paths, absolute imports, or JSON files
        if (
          relativePath.endsWith('.cjs') ||
          relativePath.endsWith('.json') ||
          relativePath.startsWith('./node_modules') ||
          relativePath.startsWith('../node_modules') ||
          relativePath.startsWith('node:')
        ) {
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
          const matchingFile = files.find(
            (f) => f.startsWith(basename + '.') && f.endsWith('.cjs'),
          );

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
