# Fix: Support environment variables in provider config while preserving runtime variable templates

## Problem

PR #6007 introduced environment variable rendering in provider configs, but it broke runtime variable substitution by rendering ALL templates at provider load time. This caused issues with:

1. **HTTP Provider**: Explicitly designed for runtime templating with `{{ vars.* }}` in request bodies
2. **Any provider using runtime variables**: Variables like `{{ vars.userMessage }}` were rendered to empty strings at load time, preventing per-test customization

The root cause was calling `renderVarsInObject(config, {})` with an empty context, which renders all Nunjucks templates and replaces undefined variables with empty strings.

## Solution

This PR implements selective template rendering that:

1. **Renders `{{ env.* }}` templates at provider load time** - Allows constructors to access real environment values (e.g., `{{ env.AZURE_ENDPOINT }}`)
2. **Preserves `{{ vars.* }}` and other templates for runtime** - Keeps them as literal strings for per-test customization at `callApi()` time

### Implementation

Added `renderEnvOnlyInObject()` function in `src/util/index.ts`:

- Uses regex to match ONLY `{{ env.VAR_NAME }}` and `{{ env['VAR_NAME'] }}` patterns
- Gets env values from Nunjucks globals (same source as full rendering)
- Leaves all other templates untouched as literal strings
- Recursively processes objects and arrays

Updated `loadApiProvider()` in `src/providers/index.ts`:

- Calls `renderEnvOnlyInObject()` on config and id before passing to provider constructors
- Preserves all non-env templates for runtime rendering

## Testing

### Unit Tests (10 new test cases)

Added comprehensive tests in `test/util/index.test.ts`:

- ✅ Renders env vars while preserving vars templates
- ✅ Handles nested objects and arrays
- ✅ Supports bracket notation (`{{ env['VAR_NAME'] }}`)
- ✅ Respects `PROMPTFOO_DISABLE_TEMPLATING` flag
- ✅ Preserves prompt and other template types
- ✅ Real-world Azure provider config scenario

### Integration Test

Added test in `test/providers/index.test.ts`:

- ✅ Verifies Azure provider gets env values resolved in constructor
- ✅ Confirms runtime vars preserved in config body for per-test customization

### Test Results

```bash
npm test -- test/util/index.test.ts --coverage --randomize
# Result: All 94 tests passed (10 new tests for renderEnvOnlyInObject)
```

## Use Cases Fixed

### Azure Provider (Constructor needs env vars)

```yaml
providers:
  - id: azure:chat:gpt-4
    config:
      apiHost: '{{ env.AZURE_ENDPOINT }}'  # ✅ Resolved at load time
      apiVersion: '{{ env.API_VERSION }}'  # ✅ Resolved at load time
```

### HTTP Provider (Runtime vars for per-test customization)

```yaml
providers:
  - id: http://localhost:3000/api
    config:
      body:
        message: '{{ vars.userMessage }}'  # ✅ Preserved for runtime
        userId: '{{ vars.userId }}'        # ✅ Preserved for runtime
```

### Mixed Templates (Both env and vars)

```yaml
providers:
  - id: azure:chat:{{ env.MY_DEPLOYMENT }}  # ✅ Env resolved at load
    config:
      apiHost: '{{ env.AZURE_ENDPOINT }}'   # ✅ Env resolved at load
      body:
        query: '{{ vars.userQuery }}'       # ✅ Vars preserved for runtime
```

## Files Changed

- `src/util/index.ts` - Added `renderEnvOnlyInObject()` function
- `src/providers/index.ts` - Updated `loadApiProvider()` to use selective rendering
- `test/util/index.test.ts` - Added 10 unit tests
- `test/providers/index.test.ts` - Added integration test
- `CHANGELOG.md` - Documented the fix

## Related

- Fixes the regression introduced in PR #6007
- Supersedes revert in PR #6029
- Resolves Discord issue where Azure provider couldn't use env vars in config
