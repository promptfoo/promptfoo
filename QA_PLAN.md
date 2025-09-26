# Promptfoo Auto-Update QA Plan

## **Implementation Comparison: Promptfoo vs Gemini CLI**

### **✅ Features We Have (Parity)**

| Feature                       | Gemini CLI                              | Promptfoo                                                   | Status    |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------- | --------- |
| Update Detection              | `update-notifier`                       | `update-notifier`                                           | ✅ Match  |
| Package Manager Detection     | 9 types                                 | 10 types                                                    | ✅ Match+ |
| Environment Variable Controls | `disableUpdateNag`, `disableAutoUpdate` | `PROMPTFOO_DISABLE_UPDATE`, `PROMPTFOO_DISABLE_AUTO_UPDATE` | ✅ Match  |
| Development Mode Skip         | `DEV=true`                              | `NODE_ENV=development`                                      | ✅ Match  |
| Git Repository Detection      | ✅                                      | ✅                                                          | ✅ Match  |
| Event-Driven Architecture     | EventEmitter                            | EventEmitter                                                | ✅ Match  |
| Spawn Process Updates         | ✅                                      | ✅                                                          | ✅ Match  |
| Error Handling                | Graceful degradation                    | Graceful degradation                                        | ✅ Match  |
| Non-blocking Startup          | ✅                                      | ✅                                                          | ✅ Match  |

### **🔄 Key Differences**

| Aspect                     | Gemini CLI                            | Promptfoo                     | Impact                                      |
| -------------------------- | ------------------------------------- | ----------------------------- | ------------------------------------------- |
| **Nightly Support**        | Dual channel (@nightly + @latest)     | Single channel (@latest only) | 🟡 Minor - Promptfoo doesn't have nightlies |
| **UI Integration**         | React components (UpdateNotification) | Console logging only          | 🟡 Minor - CLI-focused                      |
| **Timeout Behavior**       | 60-second UI timeout                  | No timeout (console only)     | 🟡 Minor                                    |
| **Package Name Detection** | Homebrew: `gemini-cli`                | Homebrew: `promptfoo`         | ✅ Correct                                  |
| **Docker Detection**       | No explicit Docker support            | Explicit Docker detection     | 🟢 Enhancement                              |

### **🧪 QA Test Plan**

## **Phase 1: Core Functionality Tests**

### **1.1 Update Detection Logic**

```bash
# Test 1: Development mode skip
NODE_ENV=development node dist/src/main.js --version
# Expected: No update check should occur

# Test 2: Production mode check
NODE_ENV=production node dist/src/main.js --version
# Expected: Update check should run (may find no updates in git repo)

# Test 3: Force update check by mocking newer version
# Create test script that mocks package.json with old version
```

### **1.2 Environment Variable Controls**

```bash
# Test 4: Disable all updates
PROMPTFOO_DISABLE_UPDATE=true node dist/src/main.js --version
# Expected: No update check or messages

# Test 5: Disable auto-update only
PROMPTFOO_DISABLE_AUTO_UPDATE=true node dist/src/main.js --version
# Expected: Update check runs, shows message, but no auto-update

# Test 6: Default behavior
node dist/src/main.js --version
# Expected: Full update check and auto-update behavior
```

### **1.3 Installation Method Detection**

```bash
# Test 7: Current git repo detection
pwd # Should be in promptfoo git repo
node -e "const {getInstallationInfo} = require('./dist/src/updates/installationInfo'); console.log(getInstallationInfo(process.cwd(), false));"
# Expected: packageManager: 'unknown', updateMessage: 'git pull'

# Test 8-15: Package Manager Detection (requires setup)
```

## **Phase 2: Package Manager Simulation Tests**

### **2.1 Create Test Environments**

```bash
# Test 8: NPM Global Simulation
mkdir -p /tmp/test-npm/lib/node_modules/promptfoo
# Symlink and test from this path

# Test 9: Homebrew Simulation (macOS only)
# Test on system with homebrew installed

# Test 10: Local project install
mkdir -p /tmp/test-project/node_modules/promptfoo
cd /tmp/test-project && echo '{"name":"test","dependencies":{"promptfoo":"*"}}' > package.json
# Test from this context
```

### **2.2 Path Detection Tests**

```bash
# Test each package manager path detection:
# - /.npm/_npx → NPX
# - /.pnpm/global → PNPM
# - /.yarn/global → YARN
# - /.bun/bin → BUN
# - /.bun/install/cache → BUNX
# - /project/node_modules → Local install
# - Default → NPM global
```

## **Phase 3: Edge Cases & Error Handling**

### **3.1 Network & Error Conditions**

```bash
# Test 16: Network failure simulation
# Mock network timeout/failure in test

# Test 17: Malformed package.json
echo 'invalid json' > /tmp/test-package.json
# Test with mocked readFileSync

# Test 18: Missing package.json
# Test with file not found scenario

# Test 19: Spawn process failure
# Mock spawn to return error code
```

### **3.2 Permission & System Tests**

```bash
# Test 20: No write permissions
# Test in directory without write access

# Test 21: Missing brew command
# Test on system without homebrew

# Test 22: Docker environment
DOCKER=true node dist/src/main.js --version
# Or create /.dockerenv file
```

## **Phase 4: Integration & User Experience**

### **4.1 Command Integration**

```bash
# Test 23-30: Run update check with various commands
node dist/src/main.js eval --help
node dist/src/main.js init --help
node dist/src/main.js view --help
# etc. - ensure update check doesn't interfere
```

### **4.2 Timing & Performance**

```bash
# Test 31: Startup time impact
time node dist/src/main.js --help
# Should be minimal impact (non-blocking)

# Test 32: Verbose logging
PROMPTFOO_DISABLE_UPDATE=false node dist/src/main.js --verbose --version
# Check for debug messages
```

## **Phase 5: Comparison Testing**

### **5.1 Side-by-Side Behavior Comparison**

```bash
# Install both CLIs globally:
npm install -g promptfoo
npm install -g @google/gemini-cli

# Test similar scenarios on both:
promptfoo --version
gemini --version

# Compare:
# - Update message format
# - Timing of messages
# - Installation detection accuracy
# - Error handling behavior
```

### **5.2 Feature Parity Verification**

| Test Case              | Expected Behavior        | Gemini CLI Result | Promptfoo Result |
| ---------------------- | ------------------------ | ----------------- | ---------------- |
| Git repo detection     | "git pull" message       | ✅                | ❓               |
| NPM global detection   | "npm install -g" command | ✅                | ❓               |
| Homebrew detection     | "brew upgrade" message   | ✅                | ❓               |
| Development skip       | No update check          | ✅                | ❓               |
| Network error handling | Graceful failure         | ✅                | ❓               |

## **Phase 6: Production Readiness**

### **6.1 Real-World Scenarios**

```bash
# Test 33: Publish test version to npm
# npm publish (test version)
# Install globally and test real update

# Test 34: Version comparison edge cases
# Test with pre-release versions
# Test with malformed versions

# Test 35: Long-running CLI sessions
# Test update behavior during long operations
```

### **6.2 Security & Safety**

```bash
# Test 36: Command injection prevention
# Verify spawn commands are properly escaped

# Test 37: Path traversal prevention
# Test with malicious path inputs

# Test 38: Process cleanup
# Verify background processes are cleaned up properly
```

## **Quick Validation Script**

Create a comprehensive test script:

```javascript
#!/usr/bin/env node
// qa-test.js

const { getInstallationInfo } = require('./dist/src/updates/installationInfo');
const { checkForUpdates } = require('./dist/src/updates/updateCheck');

console.log('🧪 Promptfoo Auto-Update QA Test Suite');
console.log('=====================================\n');

// Test 1: Installation Detection
console.log('1. Installation Detection:');
const info = getInstallationInfo(process.cwd(), false);
console.log('   Package Manager:', info.packageManager);
console.log('   Is Global:', info.isGlobal);
console.log('   Update Command:', info.updateCommand || 'None');
console.log('   Update Message:', info.updateMessage || 'None');

// Test 2: Environment Variables
console.log('\n2. Environment Variables:');
console.log('   PROMPTFOO_DISABLE_UPDATE:', process.env.PROMPTFOO_DISABLE_UPDATE || 'undefined');
console.log(
  '   PROMPTFOO_DISABLE_AUTO_UPDATE:',
  process.env.PROMPTFOO_DISABLE_AUTO_UPDATE || 'undefined',
);
console.log('   NODE_ENV:', process.env.NODE_ENV || 'undefined');

// Test 3: Update Check
console.log('\n3. Update Check Test:');
checkForUpdates()
  .then((result) => {
    if (result) {
      console.log('   ✅ Update available:', result.message);
    } else {
      console.log('   ℹ️  No update or check skipped');
    }
  })
  .catch((err) => {
    console.log('   ❌ Update check failed:', err.message);
  });
```

## **Success Criteria**

### **Must Have (P0)**

- ✅ All unit tests pass
- ✅ CLI builds and runs without errors
- ✅ Update detection works in appropriate environments
- ✅ Environment variables properly control behavior
- ✅ Git repository detection works correctly
- ✅ No startup performance regression

### **Should Have (P1)**

- ✅ Accurate package manager detection for major PMs (npm, yarn, pnpm)
- ✅ Proper error handling for network failures
- ✅ Homebrew detection works on macOS
- ✅ Non-blocking behavior during CLI operations

### **Nice to Have (P2)**

- ✅ Docker environment detection
- ✅ Bun/Bunx support
- ✅ Comprehensive edge case handling
- ✅ Performance optimization

---

**Next Steps:**

1. Run the quick validation script
2. Execute Phase 1 tests systematically
3. Set up test environments for Phase 2
4. Compare behavior with Gemini CLI in Phase 5
5. Document any discrepancies and decide on fixes
