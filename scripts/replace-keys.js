/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const path = require('path');

if (!process.env.PROMPTFOO_POSTHOG_KEY) {
  console.error('Error: PROMPTFOO_POSTHOG_KEY environment variable must be set during build');
  process.exit(1);
}

const filePath = path.join(__dirname, '../dist/src/telemetry.js');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace the environment variable with the actual key
  content = content.replace(
    'process.env.PROMPTFOO_POSTHOG_KEY',
    `'${process.env.PROMPTFOO_POSTHOG_KEY}'`,
  );

  fs.writeFileSync(filePath, content);
  console.log('replace-keys.js: Successfully run');
} catch (error) {
  console.error('Error replacing PostHog key:', error);
  process.exit(1);
}
