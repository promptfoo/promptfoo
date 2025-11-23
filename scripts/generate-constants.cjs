const fs = require('fs');
const path = require('path');

// Get the PostHog key from environment
const posthogKey = process.env.PROMPTFOO_POSTHOG_KEY || '';

// Get the version and engines from package.json
const packageJson = require('../package.json');
const version = packageJson.version;
const engines = packageJson.engines;

const constantsTemplate = `// This file is auto-generated during build. Do not edit manually.
// Generated at: ${new Date().toISOString()}
export const VERSION = '${version}';
export const POSTHOG_KEY = '${posthogKey}';
export const ENGINES = ${JSON.stringify(engines, null, 2)} as const;
`;

const generatedDir = path.join(__dirname, '../src/generated');
const outputPath = path.join(generatedDir, 'constants.ts');

try {
  // Ensure the directory exists
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, constantsTemplate, 'utf8');
  console.log('Generated constants file at src/generated/constants.ts');
} catch (error) {
  console.error('✗ Failed to generate constants file:', error);
  process.exit(1);
}
