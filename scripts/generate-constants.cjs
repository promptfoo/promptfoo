const fs = require('fs');
const path = require('path');

// Get the PostHog key from environment
const posthogKey = process.env.PROMPTFOO_POSTHOG_KEY || '';

const constantsTemplate = `// This file is auto-generated during build. Do not edit manually.
// Generated at: ${new Date().toISOString()}
export const POSTHOG_KEY = '${posthogKey}';
`;

const outputPath = path.join(__dirname, '../src/generated-constants.ts');

try {
  // Ensure the directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, constantsTemplate, 'utf8');
  
  // Also generate version file
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const versionCode = `// This file is auto-generated during build to include the current version
export const version = '${packageJson.version}';`;
  fs.writeFileSync(path.join(__dirname, '../src/version.ts'), versionCode, 'utf8');
  
  console.log('Generated constants file');
} catch (error) {
  console.error('✗ Failed to generate constants file:', error);
  process.exit(1);
}
