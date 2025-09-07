# ModelAudit Integration Audit - Task Report

## Executive Summary

**Status: 🔴 CRITICAL ISSUES FOUND**

The current promptfoo integration with modelaudit has significant compatibility issues that likely prevent the `scan-model` command from functioning correctly. Multiple CLI arguments that promptfoo attempts to pass to modelaudit do not exist in the current version (v0.2.5).

## Key Findings

### 🔴 Critical CLI Argument Mismatches

**19 arguments that promptfoo passes but don't exist in modelaudit CLI:**

| Promptfoo Argument | Status | ModelAudit Equivalent |
|-------------------|--------|-----------------------|
| `--registry-uri` | ❌ Missing | N/A |
| `--max-file-size` | ❌ Missing | `--max-size` |
| `--max-total-size` | ❌ Missing | N/A |
| `--jfrog-api-token` | ❌ Missing | Uses env vars |
| `--jfrog-access-token` | ❌ Missing | Uses env vars |
| `--max-download-size` | ❌ Missing | N/A |
| `--cache-dir` | ❌ Missing | N/A |
| `--preview` | ❌ Missing | `--dry-run` |
| `--all-files` | ❌ Missing | N/A |
| `--selective` | ❌ Missing | N/A |
| `--stream` | ❌ Missing | N/A |
| `--skip-files` | ❌ Missing | N/A |
| `--no-skip-files` | ❌ Missing | N/A |
| `--strict-license` | ❌ Missing | N/A |
| `--no-large-model-support` | ❌ Missing | N/A |
| `--no-progress` | ❌ Missing | N/A |
| `--progress-log` | ❌ Missing | N/A |
| `--progress-format` | ❌ Missing | N/A |
| `--progress-interval` | ❌ Missing | N/A |

### ✅ Working Arguments (Properly Mapped)

| Promptfoo Argument | ModelAudit Equivalent | Status |
|-------------------|----------------------|--------|
| `--blacklist` | `--blacklist` | ✅ |
| `--format` | `--format` | ✅ |
| `--output` | `--output` | ✅ |
| `--timeout` | `--timeout` | ✅ |
| `--verbose` | `--verbose` | ✅ |
| `--sbom` | `--sbom` | ✅ |

### 🟡 Documentation Issues

1. **Outdated documentation**: Site documentation shows many CLI options that don't exist in current modelaudit
2. **Incorrect examples**: Usage examples reference non-existent arguments
3. **Missing format options**: Documentation shows only "text" and "json" formats, but modelaudit also supports "sarif"

## Current ModelAudit CLI Interface (v0.2.5)

**Complete list of actual modelaudit scan command options:**

```bash
modelaudit scan [OPTIONS] PATHS...

Core Output Control:
  --format, -f         Output format (text, json, or sarif) [default: auto-detected]
  --output, -o         Output file path (prints to stdout if not specified)
  --verbose, -v        Enable verbose output
  --quiet, -q          Silence detection messages

Security Behavior:
  --blacklist, -b      Additional blacklist patterns to check against model names
  --strict             Strict mode: fail on warnings, scan all file types, strict license validation

Progress & Reporting:
  --progress           Force enable progress reporting (auto-detected by default)
  --sbom               Write CycloneDX SBOM to the specified file

Override Smart Detection:
  --timeout, -t        Override auto-detected timeout in seconds
  --max-size          Override auto-detected size limits (e.g., 10GB, 500MB)

Preview/Debugging:
  --dry-run           Preview what would be scanned/downloaded without actually doing it
  --no-cache          Force disable caching (overrides smart detection)
```

## Immediate Action Items

### 1. 🚨 Fix Promptfoo CLI Integration
**Priority: CRITICAL**
**Files to modify:** `src/commands/modelScan.ts`

**Remove unsupported arguments:**
- Remove all 19 non-existent arguments from the promptfoo CLI definition
- Update the command implementation to only pass valid arguments to modelaudit

**Specific changes needed:**
```typescript
// REMOVE these options from lines 31-80 in modelScan.ts:
- '--registry-uri'
- '--max-file-size' 
- '--max-total-size'
- '--jfrog-api-token'
- '--jfrog-access-token'  
- '--max-download-size'
- '--cache-dir'
- '--preview' (replace with --dry-run)
- '--all-files'
- '--selective'
- '--stream'
- '--skip-files'
- '--no-skip-files'
- '--strict-license'
- '--no-large-model-support'
- '--no-progress'
- '--progress-log'
- '--progress-format'
- '--progress-interval'

// UPDATE these argument mappings:
- Replace '--max-file-size' with '--max-size'
- Replace '--preview' with '--dry-run'
```

### 2. 📚 Update Site Documentation
**Priority: HIGH**
**Files to modify:** 
- `site/docs/model-audit/index.md` (lines 158-180)
- `site/docs/model-audit/usage.md` (lines 110-133, 461-571)

**Changes needed:**
1. Remove all references to non-existent CLI arguments
2. Update the options table to reflect actual modelaudit capabilities
3. Fix format options to include "sarif"
4. Update all examples to use correct arguments

### 3. 🧪 Add Integration Testing
**Priority: HIGH**
**Files to modify:** `test/commands/modelScan.test.ts`

**Add tests for:**
- Verify that promptfoo only passes valid arguments to modelaudit
- Test argument mapping correctness  
- Mock modelaudit responses and verify parsing
- Test edge cases (missing modelaudit, invalid arguments, etc.)

### 4. 🔍 Update Type Definitions
**Priority: MEDIUM**
**Files to modify:** 
- `src/types/modelAudit.ts`
- `src/app/src/pages/model-audit/ModelAudit.types.ts`

**Changes needed:**
- Remove type definitions for non-existent options
- Update interface to match actual modelaudit capabilities

## Testing Strategy

### Manual Testing Required
1. **Install modelaudit v0.2.5** in test environment
2. **Test basic functionality:**
   ```bash
   promptfoo scan-model test-model.pkl
   promptfoo scan-model test-model.pkl --format json
   promptfoo scan-model test-model.pkl --verbose --timeout 60
   ```
3. **Verify error handling** for missing modelaudit installation
4. **Test database integration** with `--no-write` flag

### Automated Testing Required
1. **Unit tests** for argument mapping
2. **Integration tests** with mocked modelaudit responses  
3. **CLI validation tests** to ensure no invalid arguments are passed

## Implementation Timeline

### Phase 1: Critical Fixes (Week 1)
- [ ] Fix promptfoo CLI integration (`src/commands/modelScan.ts`)
- [ ] Update type definitions
- [ ] Manual testing of basic functionality

### Phase 2: Documentation Updates (Week 1-2)
- [ ] Update site documentation
- [ ] Fix all examples and usage patterns
- [ ] Review and update help text

### Phase 3: Testing & Validation (Week 2)
- [ ] Add comprehensive test coverage
- [ ] Automated integration testing
- [ ] Performance testing with large models

### Phase 4: Enhancement Opportunities (Week 3+)
- [ ] Consider adding web UI support for new options
- [ ] Evaluate adding configuration file support
- [ ] Consider modelaudit version compatibility checking

## Risk Assessment

**Without fixes:**
- 🔴 **HIGH RISK**: `scan-model` command likely completely broken
- 🔴 **HIGH RISK**: Users getting confusing error messages  
- 🔴 **HIGH RISK**: Documentation misleading users

**With fixes:**
- 🟢 **LOW RISK**: Core functionality should work properly
- 🟡 **MEDIUM RISK**: Some advanced features may not be available

## Success Criteria

1. ✅ All promptfoo CLI arguments map to valid modelaudit options
2. ✅ Documentation accurately reflects current capabilities  
3. ✅ Integration tests pass with real modelaudit installation
4. ✅ No invalid arguments passed to modelaudit subprocess
5. ✅ Error handling works properly for edge cases

## Additional Recommendations

### 1. Version Compatibility Strategy
Consider implementing version checking to detect modelaudit CLI changes:

```typescript
// Check modelaudit version and adjust arguments accordingly
const version = await getModelAuditVersion();
if (version.startsWith('0.2.')) {
  // Use 0.2.x compatible arguments
} else if (version.startsWith('0.3.')) {
  // Use 0.3.x compatible arguments  
}
```

### 2. Configuration Abstraction
Consider creating an abstraction layer that maps promptfoo concepts to modelaudit arguments:

```typescript
interface ScanConfig {
  maxFileSize?: string; // Maps to --max-size in modelaudit
  enablePreview?: boolean; // Maps to --dry-run in modelaudit
  // etc.
}
```

### 3. Backward Compatibility
If some removed features are valuable to users, consider:
- Implementing them in promptfoo directly
- Providing clear migration guidance
- Adding deprecation warnings before removal

## Conclusion

The modelaudit integration requires immediate attention to restore functionality. The fixes are straightforward but critical for user experience. Priority should be given to the CLI argument fixes, followed by documentation updates and comprehensive testing.

**Next Steps:** Begin with Phase 1 critical fixes to restore basic functionality, then proceed with documentation and testing improvements.