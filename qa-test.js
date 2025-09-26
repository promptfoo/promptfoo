#!/usr/bin/env node
// qa-test.js - Comprehensive QA test for auto-update functionality

const { getInstallationInfo } = require('./dist/src/updates/installationInfo');
const { checkForUpdates } = require('./dist/src/updates/updateCheck');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Promptfoo Auto-Update QA Test Suite');
console.log('=====================================\n');

// Test 1: Installation Detection
console.log('1. Installation Detection:');
try {
  const info = getInstallationInfo(process.cwd(), false);
  console.log('   ✅ Package Manager:', info.packageManager);
  console.log('   ✅ Is Global:', info.isGlobal);
  console.log('   ✅ Update Command:', info.updateCommand || 'None');
  console.log('   ✅ Update Message:', info.updateMessage || 'None');
} catch (err) {
  console.log('   ❌ Installation detection failed:', err.message);
}

// Test 2: Environment Variables
console.log('\n2. Environment Variables:');
console.log('   PROMPTFOO_DISABLE_UPDATE:', process.env.PROMPTFOO_DISABLE_UPDATE || 'undefined');
console.log(
  '   PROMPTFOO_DISABLE_AUTO_UPDATE:',
  process.env.PROMPTFOO_DISABLE_AUTO_UPDATE || 'undefined',
);
console.log('   NODE_ENV:', process.env.NODE_ENV || 'undefined');

// Test 3: Package.json Reading
console.log('\n3. Package.json Detection:');
try {
  const packagePath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  console.log('   ✅ Package Name:', packageJson.name);
  console.log('   ✅ Current Version:', packageJson.version);
} catch (err) {
  console.log('   ❌ Package.json read failed:', err.message);
}

// Test 4: CLI Path Detection
console.log('\n4. CLI Path Detection:');
console.log('   CLI Path (argv[1]):', process.argv[1] || 'undefined');
console.log('   Working Directory:', process.cwd());
console.log('   Git Repository:', fs.existsSync('.git') ? 'Yes' : 'No');

// Test 5: Platform Detection
console.log('\n5. Platform Detection:');
console.log('   Platform:', process.platform);
console.log('   Architecture:', process.arch);
console.log('   Node Version:', process.version);

// Test 6: Update Check (async)
console.log('\n6. Update Check Test:');
checkForUpdates()
  .then((result) => {
    if (result) {
      console.log('   ✅ Update available:', result.message);
      console.log('   Current:', result.update.current);
      console.log('   Latest:', result.update.latest);
    } else {
      console.log('   ℹ️  No update available or check skipped');
    }
  })
  .catch((err) => {
    console.log('   ❌ Update check failed:', err.message);
  })
  .finally(() => {
    console.log('\n7. Environment Tests:');

    // Test with different NODE_ENV values
    const originalNodeEnv = process.env.NODE_ENV;

    console.log('   Testing NODE_ENV=development...');
    process.env.NODE_ENV = 'development';
    checkForUpdates()
      .then((result) => {
        console.log('   Development mode result:', result ? 'Update found' : 'Skipped/None');

        console.log('   Testing NODE_ENV=production...');
        process.env.NODE_ENV = 'production';
        return checkForUpdates();
      })
      .then((result) => {
        console.log('   Production mode result:', result ? 'Update found' : 'Skipped/None');

        // Restore original NODE_ENV
        if (originalNodeEnv) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }

        console.log('\n8. CLI Integration Test:');
        try {
          // Test that CLI still works with update system
          const output = execSync('node dist/src/main.js --version', {
            encoding: 'utf8',
            timeout: 5000,
          });
          console.log('   ✅ CLI Version Command:', output.trim());
        } catch (err) {
          console.log('   ❌ CLI execution failed:', err.message);
        }

        console.log('\n🎉 QA Test Suite Complete!');
        console.log('\nNext Steps:');
        console.log('1. Run specific package manager tests');
        console.log('2. Test with different installation contexts');
        console.log('3. Verify error handling edge cases');
        console.log('4. Compare with Gemini CLI behavior');
      })
      .catch((err) => {
        console.log('   ❌ Environment test failed:', err.message);
      });
  });
