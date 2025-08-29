# Fix Vertex AI Provider Response Schema File Loading Issue

## Issue Summary

**GitHub Issue**: #5409 - Response schema file not working with Vertex AI provider

**Problem**: The Vertex AI provider doesn't process the top-level `responseSchema` configuration when using `file://` protocol. While `generationConfig.response_schema` works directly, the convenient `responseSchema: file://schema.json` syntax fails.

**Expected Behavior**:

```yaml
providers:
  - id: vertex:gemini-2.5-flash
    config:
      responseSchema: file://schema.json # Should work
```

**Current Workaround**:

```yaml
providers:
  - id: vertex:gemini-2.5-flash
    config:
      generationConfig:
        response_schema: file://schema.json # Works but inconsistent
```

## Root Cause Analysis

### Key Findings

1. **AI Studio Provider Implementation** (`src/providers/google/ai.studio.ts:292-305`):
   - ✅ Handles top-level `responseSchema` properly
   - ✅ Uses `maybeLoadFromExternalFile()` for file loading
   - ✅ Uses `renderVarsInObject()` for variable substitution
   - ✅ Sets both `response_schema` and `response_mime_type`
   - ✅ Validates conflicts between `responseSchema` and `generationConfig.response_schema`

2. **Vertex Provider Implementation** (`src/providers/google/vertex.ts:306-322`):
   - ❌ Missing logic to handle top-level `responseSchema`
   - ✅ Spreads `config.generationConfig` correctly (line 316)
   - ❌ No file loading for response schemas
   - ❌ No validation for schema conflicts

3. **Technical Gap**:
   - Vertex provider lacks the 15-line code block that AI Studio uses to process `responseSchema`
   - Both providers use the same underlying API format
   - File loading utilities (`maybeLoadFromExternalFile`, `renderVarsInObject`) are available but not imported in Vertex

## Solution Approaches

### Solution 1: Direct Port from AI Studio (Recommended)

**Approach**: Copy the exact responseSchema handling logic from AI Studio to Vertex.

**Implementation**:

- Add required imports to `src/providers/google/vertex.ts`
- Insert responseSchema processing logic in `callGeminiApi()` method
- Add same validation and error handling

**Pros**:

- ✅ Exact feature parity with AI Studio
- ✅ Maintains consistent API across Google providers
- ✅ Proven implementation (has tests and works in production)
- ✅ Minimal code changes (~20 lines)
- ✅ No breaking changes

**Cons**:

- ❌ Code duplication between providers

**Effort**: Low (1-2 hours)
**Risk**: Very Low

### Solution 2: Extract to Shared Utility

**Approach**: Create a shared utility function for responseSchema processing.

**Implementation**:

- Create `processResponseSchema()` in `src/providers/google/util.ts`
- Update both AI Studio and Vertex to use shared function
- Maintain backward compatibility

**Pros**:

- ✅ DRY principle - eliminates code duplication
- ✅ Easier to maintain and test
- ✅ Future Google providers can reuse
- ✅ Consistent behavior guaranteed

**Cons**:

- ❌ Larger refactor affecting multiple files
- ❌ Risk of breaking AI Studio (requires careful testing)
- ❌ More complex implementation

**Effort**: Medium (4-6 hours)
**Risk**: Medium

### Solution 3: Configuration Preprocessor

**Approach**: Add configuration preprocessing that converts `responseSchema` to `generationConfig.response_schema` before provider instantiation.

**Implementation**:

- Modify provider factory/configuration loading
- Transform config early in the pipeline
- All Google providers benefit automatically

**Pros**:

- ✅ No provider-specific code changes
- ✅ Benefits all Google providers
- ✅ Clean separation of concerns

**Cons**:

- ❌ Complex configuration transformation logic
- ❌ Harder to debug configuration issues
- ❌ May affect other provider behaviors unexpectedly
- ❌ Violates principle of explicit configuration

**Effort**: High (8-12 hours)
**Risk**: High

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Solution 1)

**Priority**: High
**Timeline**: 1-2 hours

1. **Update Vertex Provider Imports**:

   ```typescript
   // Add to existing imports in src/providers/google/vertex.ts
   import { maybeLoadFromExternalFile } from '../../util/file';
   import { renderVarsInObject } from '../../util';
   ```

2. **Add Response Schema Processing**:
   - Insert logic after line 321 in `callGeminiApi()` method
   - Copy exact implementation from AI Studio:292-305
   - Maintain same error handling and validation

3. **Testing Strategy**:
   - Add unit tests to `test/providers/google/vertex.test.ts`
   - Test file loading with `file://` protocol
   - Test variable substitution in schema paths
   - Test conflict validation
   - Test JSON schema parsing
   - Integration test with actual Vertex API

### Phase 2: Code Quality Improvement (Optional)

**Priority**: Medium
**Timeline**: 4-6 hours

1. **Extract Shared Utility**:
   - Create `processResponseSchema()` function
   - Refactor both providers to use shared function
   - Comprehensive testing of both providers

2. **Documentation Updates**:
   - Update provider documentation
   - Add examples with `file://` protocol
   - Document schema format requirements

### Testing Requirements

#### Unit Tests

- [x] Test `responseSchema` with JSON string
- [x] Test `responseSchema` with `file://` protocol
- [x] Test variable substitution in file paths
- [x] Test conflict detection with `generationConfig.response_schema`
- [x] Test error handling for non-existent files
- [x] Test JSON parsing errors

#### Integration Tests

- [x] End-to-end test with real schema file
- [x] Verify structured output generation
- [x] Test with complex nested schemas
- [x] Compatibility with existing `generationConfig.response_schema` usage

#### Edge Cases

- [x] Empty schema files
- [x] Invalid JSON schemas
- [x] File permissions issues
- [x] Relative vs absolute file paths
- [x] Schema files with template variables

## Files to Modify

### Core Implementation

- `src/providers/google/vertex.ts` - Add responseSchema processing logic
- `src/providers/google/vertex.ts` - Add required imports

### Testing

- `test/providers/google/vertex.test.ts` - Add comprehensive test coverage
- Create test schema files in `test/fixtures/schemas/`

### Documentation (Optional)

- `site/docs/providers/vertex.md` - Update with responseSchema examples

## Risk Mitigation

1. **Backward Compatibility**: Implementation maintains all existing behavior
2. **Feature Parity**: Exact port ensures consistent behavior with AI Studio
3. **Testing Coverage**: Comprehensive tests prevent regressions
4. **Incremental Deployment**: Can be deployed independently of other changes

## Success Criteria

- [x] `responseSchema: file://schema.json` works with Vertex provider
- [x] Existing `generationConfig.response_schema` continues to work
- [x] Error messages match AI Studio provider behavior
- [x] File loading supports all existing file formats (JSON, YAML)
- [x] Variable substitution works in file paths
- [x] All tests pass
- [x] No breaking changes to existing configurations

## Estimated Timeline

**Total Effort**: 2-3 hours for complete implementation and testing
**Complexity**: Low - straightforward port of existing functionality
**Risk Level**: Very Low - minimal code changes with proven implementation

This fix will provide immediate relief for users experiencing the issue while maintaining code quality and backward compatibility.
