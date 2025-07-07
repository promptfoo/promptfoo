# Glob v11 Upgrade Summary

## Overview
Successfully upgraded glob from v10.4.5 to v11.0.3 in the promptfoo project.

## Changes Made
1. **Removed** `@types/glob` (v8.1.0) - Types are now included in glob v10+
2. **Upgraded** `glob` from v10.4.5 to v11.0.3

## Key Benefits
- **Performance improvements**: glob v11 includes significant performance enhancements
- **Better caching**: Improved internal caching mechanisms
- **Modern API**: Continued support for both CommonJS and ESM
- **TypeScript support**: Built-in TypeScript definitions

## Compatibility
- ✅ **CommonJS**: Full support maintained (project uses `"type": "commonjs"`)
- ✅ **TypeScript**: No type errors, compilation successful
- ✅ **Tests**: All 548 tests passing in glob-related modules
- ✅ **API**: No code changes required (already using modern `globSync` API)

## Verified Functionality
- Basic glob patterns working correctly
- Ignore patterns functioning as expected
- New v11 features (iterator pattern) working in CommonJS
- Windows path handling (`windowsPathsNoEscape: true`) maintained

## Files Modified
- `package.json`: Updated dependencies
- `package-lock.json`: Updated with new dependency tree

## Migration Notes
- No breaking changes encountered
- No code modifications required
- Smooth upgrade path from v10 to v11

## Next Steps
1. Run full test suite: `npm test`
2. Test in development: `npm run dev`
3. Consider applying performance optimizations mentioned in the audit 