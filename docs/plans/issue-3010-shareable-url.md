# Implementation Plan: Shareable URL Support for Node.js Package

**GitHub Issue:** #3010
**Title:** Add shareable URL support to `evaluate()` function
**Priority:** Feature Request

## Problem Statement

When using the Node.js package API with `sharing: true`, the evaluation runs successfully but no shareable URL is returned. The CLI provides this functionality, but the library API does not.

```javascript
const results = await promptfoo.evaluate({
  prompts: [prompt],
  providers: [provider],
  tests: tests,
  writeLatestResults: true,
  sharing: true, // Accepted but not acted upon
});

// results.shareableUrl is undefined - user has no way to get the URL
```

## Solution Overview

Add sharing functionality to the `evaluate()` function in `src/index.ts` that:

1. Uploads the evaluation to the sharing server when `sharing: true`
2. Returns the shareable URL as part of the result
3. Maintains backward compatibility (existing code continues to work)

## Implementation Details

### Phase 1: Add `shareableUrl` Property to Eval Class

**File:** `src/models/eval.ts`

Add a new optional property to store the shareable URL:

```typescript
export default class Eval {
  // ... existing properties ...

  /**
   * The shareable URL for this evaluation, if it has been shared.
   * Set by the evaluate() function when sharing is enabled.
   */
  shareableUrl?: string;

  // ... rest of class ...
}
```

**Rationale:**

- Adding to the Eval class maintains the existing return type
- Property is optional, so backward compatible
- Follows the existing pattern (`shared` boolean is already on Eval)

### Phase 2: Update `evaluate()` Function

**File:** `src/index.ts`

Import the sharing utilities:

```typescript
import { createShareableUrl, isSharingEnabled } from './share';
import logger from './logger';
```

After the evaluation completes (after line 137), add sharing logic:

```typescript
// Run the eval!
const ret = await doEvaluate(
  { ...constructedTestSuite, providerPromptMap: parsedProviderPromptMap },
  evalRecord,
  { eventSource: 'library', isRedteam: Boolean(testSuite.redteam), ...options },
);

// Handle sharing if enabled
if (testSuite.writeLatestResults && testSuite.sharing) {
  if (isSharingEnabled(ret)) {
    try {
      const shareableUrl = await createShareableUrl(ret, { silent: true });
      if (shareableUrl) {
        ret.shareableUrl = shareableUrl;
        ret.shared = true;
        logger.debug(`Eval shared successfully: ${shareableUrl}`);
      }
    } catch (error) {
      // Don't fail the evaluation if sharing fails
      logger.warn(`Failed to create shareable URL: ${error}`);
    }
  } else {
    logger.debug('Sharing requested but not enabled (check cloud config or sharing settings)');
  }
}

if (testSuite.outputPath) {
  // ... existing output handling ...
}

return ret;
```

**Key Design Decisions:**

1. **Silent mode:** Use `{ silent: true }` to suppress progress bars and "Sharing to:" messages
2. **Non-blocking errors:** Sharing failures log a warning but don't fail the evaluation
3. **Prerequisites check:** Only attempt sharing if:
   - `writeLatestResults: true` (data must be persisted)
   - `sharing` is truthy (explicitly requested)
   - `isSharingEnabled(ret)` returns true (cloud/server configured)

### Phase 3: Update Type Definitions

**File:** `src/types/index.ts`

The `EvaluateSummaryV3` type doesn't need changes since we're adding `shareableUrl` to the `Eval` class which is what's actually returned. However, we should update the documentation comment:

```typescript
export interface EvaluateSummaryV3 {
  version: 3;
  timestamp: string;
  results: EvaluateResult[];
  prompts: CompletedPrompt[];
  stats: EvaluateStats;
}
```

**Note:** The `evaluate()` function returns an `Eval` object, not `EvaluateSummaryV3`. The `Eval` class has a `toEvaluateSummary()` method for conversion. Documentation may need clarification.

### Phase 4: Add Unit Tests

**File:** `test/index.test.ts`

Add new test cases in the `describe('evaluate function')` block:

```typescript
describe('sharing functionality', () => {
  let createShareableUrlMock: ReturnType<typeof vi.fn>;
  let isSharingEnabledMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mock('../src/share', () => ({
      createShareableUrl: vi.fn(),
      isSharingEnabled: vi.fn(),
    }));

    const share = await import('../src/share');
    createShareableUrlMock = vi.mocked(share.createShareableUrl);
    isSharingEnabledMock = vi.mocked(share.isSharingEnabled);
  });

  it('should create shareable URL when sharing is enabled', async () => {
    const mockUrl = 'https://app.promptfoo.dev/eval/test-123';
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(mockUrl);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    const result = await evaluate(testSuite);

    expect(createShareableUrlMock).toHaveBeenCalledWith(expect.anything(), { silent: true });
    expect(result.shareableUrl).toBe(mockUrl);
    expect(result.shared).toBe(true);
  });

  it('should not share when writeLatestResults is false', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: false,
      sharing: true,
    };

    await evaluate(testSuite);

    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should not share when sharing is not enabled', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: false,
    };

    await evaluate(testSuite);

    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should handle sharing errors gracefully', async () => {
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockRejectedValue(new Error('Network error'));

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    // Should not throw
    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBeUndefined();
    expect(result.shared).toBeFalsy();
  });

  it('should handle null URL from createShareableUrl', async () => {
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(null);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBeUndefined();
  });

  it('should support sharing config object', async () => {
    const mockUrl = 'https://custom.server.com/eval/test-123';
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(mockUrl);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: {
        apiBaseUrl: 'https://custom.server.com/api',
        appBaseUrl: 'https://custom.server.com',
      },
    };

    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBe(mockUrl);
  });
});
```

### Phase 5: Update Example

**File:** `examples/node-package/full-eval.js`

Add sharing demonstration:

```javascript
const results = await promptfoo.evaluate({
  prompts,
  providers,
  tests,
  writeLatestResults: true,
  // Uncomment to enable sharing (requires cloud account or self-hosted server)
  // sharing: true,
});

console.log('RESULTS:');
const resultsString = JSON.stringify(results, null, 2);
console.log(resultsString);

// Display shareable URL if available
if (results.shareableUrl) {
  console.log('\nView results online:', results.shareableUrl);
}
```

### Phase 6: Update Documentation

**File:** `site/docs/usage/node-package.md`

Add a new section after the example:

````markdown
## Sharing Results

To get a shareable URL for your evaluation results, enable sharing in your test suite:

```js
const results = await promptfoo.evaluate({
  prompts: ['Your prompt here'],
  providers: ['openai:gpt-5-mini'],
  tests: [{ vars: { input: 'test' } }],
  writeLatestResults: true, // Required for sharing
  sharing: true,
});

if (results.shareableUrl) {
  console.log('View results at:', results.shareableUrl);
  // Example: https://app.promptfoo.dev/eval/abc123
}
```
````

### Requirements

Sharing requires:

- `writeLatestResults: true` - Results must be persisted locally
- A Promptfoo Cloud account, OR
- A self-hosted Promptfoo server

### Custom Sharing Server

For self-hosted deployments, configure the sharing endpoints:

```js
const results = await promptfoo.evaluate({
  // ... prompts, providers, tests ...
  writeLatestResults: true,
  sharing: {
    apiBaseUrl: 'https://your-server.com/api',
    appBaseUrl: 'https://your-server.com',
  },
});
```

### Notes

- Sharing requires either a Promptfoo Cloud account or a self-hosted server
- Sharing is asynchronous but `evaluate()` waits for it to complete
- If sharing fails, the evaluation still succeeds (warning logged)

````

## Testing Strategy

### Unit Tests
- Test sharing enabled with valid config
- Test sharing disabled scenarios
- Test error handling
- Test with sharing config object

### Manual Testing
```bash
# Test with cloud account
cd examples/node-package
node full-eval.js

# Verify shareableUrl is present in output
````

### Integration Test (Optional)

Could add to `test/integration/` but requires cloud credentials or mock server.

## Backward Compatibility

| Scenario                    | Before       | After                            |
| --------------------------- | ------------ | -------------------------------- |
| No sharing config           | Returns Eval | Returns Eval (unchanged)         |
| `sharing: true`, no cloud   | Returns Eval | Returns Eval, logs debug message |
| `sharing: true`, with cloud | Returns Eval | Returns Eval with `shareableUrl` |
| `sharing: false`            | Returns Eval | Returns Eval (unchanged)         |

The change is **fully backward compatible** because:

1. `shareableUrl` is an optional property
2. Existing code that doesn't check for it continues to work
3. Sharing only happens when explicitly requested

## File Changes Summary

| File                                 | Change Type  | Description                                |
| ------------------------------------ | ------------ | ------------------------------------------ |
| `src/models/eval.ts`                 | Add property | Add `shareableUrl?: string`                |
| `src/index.ts`                       | Add logic    | Import share utils, add sharing after eval |
| `test/index.test.ts`                 | Add tests    | New test suite for sharing functionality   |
| `examples/node-package/full-eval.js` | Update       | Add sharing example (commented)            |
| `site/docs/usage/node-package.md`    | Add section  | Document sharing feature                   |

## Implementation Order

1. **src/models/eval.ts** - Add `shareableUrl` property
2. **src/index.ts** - Add sharing logic
3. **test/index.test.ts** - Add unit tests
4. **Run tests** - `npm test test/index.test.ts`
5. **examples/node-package/full-eval.js** - Update example
6. **site/docs/usage/node-package.md** - Update documentation
7. **Manual test** - Run example with cloud account

## Edge Cases

1. **Cloud not configured:** `isSharingEnabled()` returns false, no sharing attempted
2. **Network failure:** Error caught, warning logged, eval continues
3. **`writeLatestResults: false`:** Skip sharing entirely (data not persisted)
4. **`sharing` is object:** Passed through to `createShareableUrl()` via eval config
5. **`createShareableUrl` returns null:** No URL set, `shared` stays false

## Open Questions

1. **Should we add `shareableUrl` to `EvaluateSummaryV3` type?**
   - Current: Only on `Eval` class
   - The `toEvaluateSummary()` method could include it
   - Recommendation: Keep it on `Eval` for now, document that `evaluate()` returns `Eval`

2. **Should sharing be fire-and-forget or awaited?**
   - Current plan: Awaited (user gets URL immediately)
   - Alternative: Background with callback
   - Recommendation: Await for simplicity, consistent with outputPath handling
