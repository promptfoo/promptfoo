/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const path = require('path');

// Update paths for the new build structure
const cjsFilePath = path.join(__dirname, '../dist/cjs/src/telemetry.js');
const esmFilePath = path.join(__dirname, '../dist/esm/src/telemetry.js');

function replaceKeys(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');

      // Replace the environment variable with the actual key
      content = content.replace(
        'process.env.PROMPTFOO_POSTHOG_KEY',
        `'${process.env.PROMPTFOO_POSTHOG_KEY}'`,
      );

      fs.writeFileSync(filePath, content);
      console.log(`Successfully replaced PostHog key in ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error replacing PostHog key in ${filePath}:`, error);
    return false;
  }
}

// Try to replace keys in both CJS and ESM builds
const cjsSuccess = replaceKeys(cjsFilePath);
const esmSuccess = replaceKeys(esmFilePath);

if (!cjsSuccess && !esmSuccess) {
  console.error('Failed to replace PostHog keys in both CJS and ESM builds');
  process.exit(1);
} else {
  console.log('replace-keys.js: Successfully run');
}
