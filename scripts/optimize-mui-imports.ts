import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface ImportInfo {
  components: string[];
  hasAlpha?: boolean;
  hasUseTheme?: boolean;
  hasStyled?: boolean;
  hasOtherUtils?: string[];
}

const SPECIAL_EXPORTS = {
  alpha: '@mui/material/styles',
  useTheme: '@mui/material/styles',
  styled: '@mui/material/styles',
  useMediaQuery: '@mui/material/useMediaQuery',
  AlertColor: '@mui/material/Alert', // This is actually a type
  Theme: '@mui/material/styles',
  ThemeProvider: '@mui/material/styles',
  createTheme: '@mui/material/styles',
};

// Add a mapping for special imports that need specific handling
const SPECIAL_IMPORTS: Record<string, string> = {
  'AlertColor': 'import type { AlertColor } from \'@mui/material/Alert\';',
  'ThemeProvider': 'import { ThemeProvider } from \'@mui/material/styles\';',
  'createTheme': 'import { createTheme } from \'@mui/material/styles\';',
  'Theme': 'import type { Theme } from \'@mui/material/styles\';',
};

async function findFiles(): Promise<string[]> {
  const patterns = ['src/app/src/**/*.ts', 'src/app/src/**/*.tsx', 'site/src/**/*.ts', 'site/src/**/*.tsx'];
  const files: string[] = [];
  
  for (const pattern of patterns) {
    const matches = await glob(pattern, { ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*'] });
    files.push(...matches);
  }
  
  return files;
}

function parseImports(content: string): ImportInfo {
  const importRegex = /import\s*(?:type\s+)?{\s*([^}]+)\s*}\s*from\s*['"]@mui\/material['"]/g;
  const typeImportRegex = /import\s*type\s*{\s*([^}]+)\s*}\s*from\s*['"]@mui\/material['"]/g;
  
  const components: string[] = [];
  let hasAlpha = false;
  let hasUseTheme = false;
  let hasStyled = false;
  const otherUtils: string[] = [];
  
  let match;
  
  // Handle regular imports
  while ((match = importRegex.exec(content)) !== null) {
    const imports = match[1].split(',').map(i => i.trim()).filter(Boolean);
    
    for (const imp of imports) {
      const cleanImport = imp.replace(/\s*type\s+/, '');
      
      if (cleanImport === 'alpha') {
        hasAlpha = true;
      } else if (cleanImport === 'useTheme') {
        hasUseTheme = true;
      } else if (cleanImport === 'styled') {
        hasStyled = true;
      } else if (SPECIAL_EXPORTS[cleanImport as keyof typeof SPECIAL_EXPORTS]) {
        otherUtils.push(cleanImport);
      } else {
        components.push(imp); // Keep the original with 'type' prefix if present
      }
    }
  }
  
  // Handle type-only imports
  importRegex.lastIndex = 0;
  while ((match = typeImportRegex.exec(content)) !== null) {
    const imports = match[1].split(',').map(i => i.trim()).filter(Boolean);
    
    for (const imp of imports) {
      if (SPECIAL_EXPORTS[imp as keyof typeof SPECIAL_EXPORTS]) {
        otherUtils.push(`type ${imp}`);
      } else {
        components.push(`type ${imp}`);
      }
    }
  }
  
  return { components, hasAlpha, hasUseTheme, hasStyled, otherUtils };
}

function generateOptimizedImports(importInfo: ImportInfo): string[] {
  const imports: string[] = [];
  
  // Group components and type imports separately
  const regularComponents: string[] = [];
  const typeComponents: string[] = [];
  const specialImportsNeeded: Set<string> = new Set();
  
  for (const comp of importInfo.components) {
    // Check if this is a special import
    if (SPECIAL_IMPORTS[comp.replace('type ', '')]) {
      specialImportsNeeded.add(comp.replace('type ', ''));
      continue;
    }
    
    if (comp.startsWith('type ')) {
      typeComponents.push(comp.replace('type ', ''));
    } else {
      regularComponents.push(comp);
    }
  }
  
  // Add regular component imports
  for (const comp of regularComponents) {
    imports.push(`import ${comp} from '@mui/material/${comp}';`);
  }
  
  // Add type imports
  for (const comp of typeComponents) {
    imports.push(`import type { ${comp} } from '@mui/material/${comp}';`);
  }
  
  // Handle special exports from styles
  const styleImports: string[] = [];
  const styleTypeImports: string[] = [];
  
  if (importInfo.hasAlpha) styleImports.push('alpha');
  if (importInfo.hasUseTheme) styleImports.push('useTheme');
  if (importInfo.hasStyled) styleImports.push('styled');
  
  // Check other utils for style imports
  for (const util of importInfo.otherUtils || []) {
    const isType = util.startsWith('type ');
    const cleanUtil = util.replace('type ', '');
    
    // Skip if it has a special import
    if (SPECIAL_IMPORTS[cleanUtil]) {
      specialImportsNeeded.add(cleanUtil);
      continue;
    }
    
    if (SPECIAL_EXPORTS[cleanUtil as keyof typeof SPECIAL_EXPORTS] === '@mui/material/styles') {
      if (isType || cleanUtil === 'Theme') {
        styleTypeImports.push(cleanUtil);
      } else {
        styleImports.push(cleanUtil);
      }
    } else if (SPECIAL_EXPORTS[cleanUtil as keyof typeof SPECIAL_EXPORTS]) {
      // Handle other special exports
      const importPath = SPECIAL_EXPORTS[cleanUtil as keyof typeof SPECIAL_EXPORTS];
      if (isType) {
        imports.push(`import type { ${cleanUtil} } from '${importPath}';`);
      } else {
        imports.push(`import ${cleanUtil} from '${importPath}';`);
      }
    }
  }
  
  // Add style imports
  if (styleImports.length > 0) {
    imports.push(`import { ${styleImports.join(', ')} } from '@mui/material/styles';`);
  }
  
  if (styleTypeImports.length > 0) {
    // Add type imports separately
    for (const typeImport of styleTypeImports) {
      imports.push(`import type { ${typeImport} } from '@mui/material/styles';`);
    }
  }
  
  // Add special imports
  for (const special of specialImportsNeeded) {
    if (SPECIAL_IMPORTS[special]) {
      imports.push(SPECIAL_IMPORTS[special]);
    }
  }
  
  return imports;
}

function convertFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if file has @mui/material imports to convert
  if (!content.includes("from '@mui/material'")) {
    return false;
  }
  
  const importInfo = parseImports(content);
  
  if (importInfo.components.length === 0 && 
      !importInfo.hasAlpha && 
      !importInfo.hasUseTheme && 
      !importInfo.hasStyled &&
      (!importInfo.otherUtils || importInfo.otherUtils.length === 0)) {
    return false;
  }
  
  // Replace the old import with optimized imports
  let newContent = content;
  
  // Remove the old import statements
  newContent = newContent.replace(
    /import\s*(?:type\s+)?{\s*[^}]+\s*}\s*from\s*['"]@mui\/material['"]\s*;?\s*\n?/g,
    ''
  );
  
  // Find where to insert new imports (after the last import statement)
  const importRegex = /^import\s+.*$/gm;
  const imports: RegExpExecArray[] = [];
  let match;
  
  while ((match = importRegex.exec(newContent)) !== null) {
    imports.push(match);
  }
  
  const lastImportIndex = imports.length > 0 
    ? imports[imports.length - 1].index! + imports[imports.length - 1][0].length
    : 0;
  
  // Generate optimized imports
  const optimizedImports = generateOptimizedImports(importInfo);
  
  // Insert the new imports
  newContent = 
    newContent.slice(0, lastImportIndex) + 
    '\n' + optimizedImports.join('\n') + 
    newContent.slice(lastImportIndex);
  
  // Clean up extra newlines
  newContent = newContent.replace(/\n{3,}/g, '\n\n');
  
  fs.writeFileSync(filePath, newContent);
  
  return true;
}

async function main() {
  console.log('🔍 Finding files with @mui/material imports...');
  
  const files = await findFiles();
  console.log(`Found ${files.length} TypeScript/React files to check`);
  
  let convertedCount = 0;
  const convertedFiles: string[] = [];
  
  for (const file of files) {
    try {
      if (convertFile(file)) {
        convertedCount++;
        convertedFiles.push(file);
        console.log(`✅ Converted: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Error converting ${file}:`, error);
    }
  }
  
  console.log(`\n✨ Conversion complete!`);
  console.log(`📊 Converted ${convertedCount} files`);
  
  if (convertedFiles.length > 0) {
    console.log('\n📝 Converted files:');
    convertedFiles.forEach(file => console.log(`   - ${file}`));
  }
}

main().catch(console.error); 