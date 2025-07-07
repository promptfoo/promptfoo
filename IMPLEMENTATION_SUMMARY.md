# Build Constants Improvement Implementation

## Summary

This implementation improves how build-time constants (specifically the PostHog key) are handled in the promptfoo project by using post-compilation injection instead of source file mutation.

## Changes Made

1. **Removed file mutation during build**
   - Previously: `generate-constants.js` would overwrite `src/generated-constants.ts` during build
   - Now: Source files remain unchanged, constants are injected into compiled output

2. **Created `scripts/inject-build-constants.js`**
   - Runs after TypeScript compilation
   - Modifies `dist/src/generated-constants.js` to replace environment variable references with actual values
   - Handles multiple constants if needed (extensible design)

3. **Updated build process**
   - Removed `generate-constants` script and `postbuild` git checkout workaround
   - Build now runs: `tsc && node scripts/inject-build-constants.js && ...`

4. **Added comprehensive tests**
   - Updated existing tests to verify source file remains unchanged
   - Added new tests for the injection script functionality

## Benefits

1. **Cleaner version control**: Source files are never modified during build
2. **No git conflicts**: Developers can't accidentally commit built versions
3. **Simpler workflow**: No need for post-build git checkout
4. **Better developer experience**: Clear separation between dev and production behavior
5. **Extensible**: Easy to add more build-time constants in the future

## How It Works

### Development
```typescript
// src/generated-constants.ts
export const POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
```

### Build Process
```bash
# 1. TypeScript compiles to JavaScript
tsc

# 2. Injection script modifies the compiled output
PROMPTFOO_POSTHOG_KEY="your-key" node scripts/inject-build-constants.js

# Result in dist/src/generated-constants.js:
exports.POSTHOG_KEY = 'your-key';
```

### Production
The distributed package contains the injected values, so runtime environment variables are not needed.

## Testing

```bash
# Run tests
npm test -- test/generated-constants.test.ts
npm test -- test/inject-build-constants.test.ts

# Build with a key
PROMPTFOO_POSTHOG_KEY="test-key" npm run build

# Build without a key (defaults to empty string)
npm run build
``` 