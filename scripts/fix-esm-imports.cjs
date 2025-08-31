const fs = require('fs');
const path = require('path');

function fixEsmImports(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      fixEsmImports(fullPath);
    } else if (item.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Fix import statements - handle both named and default imports
      content = content.replace(
        /import\s+(?:[^{][^"']*|{[^}]*})\s+from\s+["'](\.[^"']*?)["']/g,
        (match, specifier) => {
          if (
            specifier.endsWith('.js') ||
            specifier.endsWith('.json') ||
            specifier.includes('node_modules') ||
            specifier.startsWith('node:')
          ) {
            return match;
          }

          // Check if this is a directory import
          const targetPath = path.resolve(path.dirname(fullPath), specifier);
          const indexPath = path.join(targetPath, 'index.js');

          if (fs.existsSync(indexPath)) {
            // Directory import - add /index.js
            const newMatch = match
              .replace(`"${specifier}"`, `"${specifier}/index.js"`)
              .replace(`'${specifier}'`, `'${specifier}/index.js'`);
            console.log(`ESM: ${specifier} -> ${specifier}/index.js`);
            modified = true;
            return newMatch;
          } else if (fs.existsSync(targetPath + '.js')) {
            // File import - add .js
            const newMatch = match
              .replace(`"${specifier}"`, `"${specifier}.js"`)
              .replace(`'${specifier}'`, `'${specifier}.js'`);
            console.log(`ESM: ${specifier} -> ${specifier}.js`);
            modified = true;
            return newMatch;
          } else {
            // Check for files with other extensions (like .node.js)
            const dirPath = path.dirname(targetPath);
            const basename = path.basename(targetPath);
            if (fs.existsSync(dirPath)) {
              const files = fs.readdirSync(dirPath);
              const matchingFile = files.find(
                (f) => f.startsWith(basename + '.') && f.endsWith('.js'),
              );

              if (matchingFile) {
                const relativeName = matchingFile;
                const newSpecifier = path.join(path.dirname(specifier), relativeName);
                const newMatch = match
                  .replace(`"${specifier}"`, `"${newSpecifier}"`)
                  .replace(`'${specifier}'`, `'${newSpecifier}'`);
                console.log(`ESM: ${specifier} -> ${newSpecifier}`);
                modified = true;
                return newMatch;
              }
            }
          }

          // Default - just add .js
          const newMatch = match
            .replace(`"${specifier}"`, `"${specifier}.js"`)
            .replace(`'${specifier}'`, `'${specifier}.js'`);
          console.log(`ESM: ${specifier} -> ${specifier}.js`);
          modified = true;
          return newMatch;
        },
      );

      // Fix specific node_modules imports that need .js extensions in ESM
      content = content.replace(
        /import\s+(?:[^{][^"']*|{[^}]*})\s+from\s+["'](semver\/[^"']*)["']/g,
        (match, specifier) => {
          if (specifier.endsWith('.js')) {
            return match;
          }
          const newMatch = match
            .replace(`"${specifier}"`, `"${specifier}.js"`)
            .replace(`'${specifier}'`, `'${specifier}.js'`);
          console.log(`ESM: ${specifier} -> ${specifier}.js`);
          modified = true;
          return newMatch;
        },
      );

      // Fix export...from statements
      content = content.replace(
        /export\s*{[^}]*}\s*from\s*["'](\.[^"']*?)["']/g,
        (match, specifier) => {
          if (
            specifier.endsWith('.js') ||
            specifier.endsWith('.json') ||
            specifier.includes('node_modules') ||
            specifier.startsWith('node:')
          ) {
            return match;
          }

          // Check if this is a directory import
          const targetPath = path.resolve(path.dirname(fullPath), specifier);
          const indexPath = path.join(targetPath, 'index.js');

          if (fs.existsSync(indexPath)) {
            // Directory import - add /index.js
            const newMatch = match
              .replace(`"${specifier}"`, `"${specifier}/index.js"`)
              .replace(`'${specifier}'`, `'${specifier}/index.js'`);
            console.log(`ESM export: ${specifier} -> ${specifier}/index.js`);
            modified = true;
            return newMatch;
          } else if (fs.existsSync(targetPath + '.js')) {
            // File import - add .js
            const newMatch = match
              .replace(`"${specifier}"`, `"${specifier}.js"`)
              .replace(`'${specifier}'`, `'${specifier}.js'`);
            console.log(`ESM export: ${specifier} -> ${specifier}.js`);
            modified = true;
            return newMatch;
          } else {
            // Default - just add .js
            const newMatch = match
              .replace(`"${specifier}"`, `"${specifier}.js"`)
              .replace(`'${specifier}'`, `'${specifier}.js'`);
            console.log(`ESM export: ${specifier} -> ${specifier}.js`);
            modified = true;
            return newMatch;
          }
        },
      );

      // Fix export * from statements
      content = content.replace(/export\s*\*\s*from\s*["'](\.[^"']*?)["']/g, (match, specifier) => {
        if (
          specifier.endsWith('.js') ||
          specifier.endsWith('.json') ||
          specifier.includes('node_modules') ||
          specifier.startsWith('node:')
        ) {
          return match;
        }

        // Check if this is a directory import
        const targetPath = path.resolve(path.dirname(fullPath), specifier);
        const indexPath = path.join(targetPath, 'index.js');

        if (fs.existsSync(indexPath)) {
          // Directory import - add /index.js
          const newMatch = match
            .replace(`"${specifier}"`, `"${specifier}/index.js"`)
            .replace(`'${specifier}'`, `'${specifier}/index.js'`);
          console.log(`ESM export *: ${specifier} -> ${specifier}/index.js`);
          modified = true;
          return newMatch;
        } else if (fs.existsSync(targetPath + '.js')) {
          // File import - add .js
          const newMatch = match
            .replace(`"${specifier}"`, `"${specifier}.js"`)
            .replace(`'${specifier}'`, `'${specifier}.js'`);
          console.log(`ESM export *: ${specifier} -> ${specifier}.js`);
          modified = true;
          return newMatch;
        } else {
          // Default - just add .js
          const newMatch = match
            .replace(`"${specifier}"`, `"${specifier}.js"`)
            .replace(`'${specifier}'`, `'${specifier}.js'`);
          console.log(`ESM export *: ${specifier} -> ${specifier}.js`);
          modified = true;
          return newMatch;
        }
      });

      // Fix JSON imports to use import attributes
      content = content.replace(
        /(import\s+(?:{[^}]*}|[^{\s][^"']*)\s+from\s+["'][^"']*\.json["'](?!\s*with\s))/g,
        (match) => {
          console.log(`ESM: Adding JSON import attribute to: ${match}`);
          modified = true;
          return match + " with { type: 'json' }";
        },
      );

      // Fix dynamic imports
      content = content.replace(/import\s*\(\s*["'](\.[^"']*?)["']\s*\)/g, (match, specifier) => {
        if (
          specifier.endsWith('.js') ||
          specifier.endsWith('.json') ||
          specifier.includes('node_modules') ||
          specifier.startsWith('node:')
        ) {
          return match;
        }

        const targetPath = path.resolve(path.dirname(fullPath), specifier);
        const indexPath = path.join(targetPath, 'index.js');

        if (fs.existsSync(indexPath)) {
          console.log(`ESM dynamic: ${specifier} -> ${specifier}/index.js`);
          modified = true;
          return match
            .replace(`"${specifier}"`, `"${specifier}/index.js"`)
            .replace(`'${specifier}'`, `'${specifier}/index.js'`);
        } else {
          console.log(`ESM dynamic: ${specifier} -> ${specifier}.js`);
          modified = true;
          return match
            .replace(`"${specifier}"`, `"${specifier}.js"`)
            .replace(`'${specifier}'`, `'${specifier}.js'`);
        }
      });

      if (modified) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

function validateEsmImports(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  let hasIssues = false;

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (validateEsmImports(fullPath)) {
        hasIssues = true;
      }
    } else if (item.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for relative imports without extensions
      const badImports = content.match(
        /(?:import\s*(?:{[^}]*}\s*from\s*|[^{]*from\s*)|import\s*\(\s*|export\s*(?:{[^}]*}|\*)\s*from\s*)["'](\.[^"']*?)["']/g,
      );

      if (badImports) {
        const problematic = badImports.filter((imp) => {
          const match = imp.match(/["'](\.[^"']*?)["']/);
          if (!match) return false;
          const spec = match[1];
          return (
            !spec.endsWith('.js') &&
            !spec.endsWith('.json') &&
            !spec.includes('node_modules') &&
            !spec.startsWith('node:')
          );
        });

        if (problematic.length > 0) {
          console.error(`❌ ${fullPath} has extensionless relative imports:`);
          problematic.forEach((imp) => console.error(`   ${imp}`));
          hasIssues = true;
        }
      }
    }
  }

  return hasIssues;
}

if (require.main === module) {
  const command = process.argv[2];
  const esmDir = path.join(__dirname, '..', 'dist', 'esm');

  if (command === 'fix') {
    console.log('Fixing ESM imports...');
    fixEsmImports(esmDir);
    console.log('ESM imports fixed!');
  } else if (command === 'validate') {
    console.log('Validating ESM imports...');
    const hasIssues = validateEsmImports(esmDir);
    if (hasIssues) {
      console.error('❌ ESM validation failed!');
      process.exit(1);
    } else {
      console.log('✅ ESM validation passed!');
    }
  } else {
    console.error('Usage: node fix-esm-imports.cjs [fix|validate]');
    process.exit(1);
  }
}

module.exports = { fixEsmImports, validateEsmImports };
