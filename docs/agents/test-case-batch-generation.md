# Test Case Batch Generation Implementation Plan

## Overview

Optimize test case generation by batching API calls. Instead of making a new API request on every "Regenerate" click, generate multiple test cases upfront and cycle through them locally.

**Current behavior:**
```
Click Generate → API call → Show test case #1
Click Regenerate → API call → Show test case #2
Click Regenerate → API call → Show test case #3
...
```

**Proposed behavior:**
```
Click Generate → API call (batch of 5) → Show test case #1
Click Regenerate → Show test case #2 (instant, from cache)
Click Regenerate → Show test case #3 (instant, from cache)
Click Regenerate → Show test case #4 (instant, prefetch next batch)
Click Regenerate → Show test case #5 (instant)
Click Regenerate → Show test case #6 (from prefetched batch)
...
```

## Code Flow Analysis

### Current Flow

```
┌─────────────────┐    POST /redteam/generate-test    ┌─────────────────┐
│    Frontend     │ ──────────────────────────────────▶│     Backend     │
│                 │    { plugin, strategy, n: 1 }      │                 │
│ TestCaseDialog  │                                    │  redteam.ts     │
│                 │◀────────────────────────────────── │                 │
│                 │    { prompt, context, metadata }   │                 │
└─────────────────┘                                    └─────────────────┘
```

**Key files:**
- `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx` - Frontend orchestration
- `src/app/src/pages/redteam/setup/components/TestCaseDialog.tsx` - UI component
- `src/server/routes/redteam.ts` - Backend API endpoint (line 68-213)

### Backend Analysis

The `/redteam/generate-test` endpoint at `src/server/routes/redteam.ts:68`:

```typescript
// Line 105-116 - Plugin factory generates test cases
const testCases = await pluginFactory.action({
  provider: redteamProvider,
  purpose: config.applicationDefinition.purpose ?? 'general AI assistant',
  injectVar,
  n: 1, // <-- Currently hardcoded to 1
  delayMs: 0,
  config: { ... },
});
```

The `n` parameter already supports batch generation - we just need to:
1. Accept it from the request
2. Return multiple test cases

### Strategy Consideration

**Single-turn strategies** (can be batched):
- `basic`, `base64`, `homoglyph`, `leetspeak`, `rot13`, `hex`, `morse`, etc.
- These transform test cases without needing conversation history

**Multi-turn strategies** (cannot be batched):
- `crescendo`, `goat`, `jailbreak:hydra`, `jailbreak:tree`, etc.
- Each turn depends on the target's previous response
- Must continue using single-generation approach

## Implementation Plan

### Phase 1: Backend Changes

#### 1.1 Update Request Schema

**File:** `src/server/routes/redteam.ts`

```typescript
const TestCaseGenerationSchema = z.object({
  plugin: z.object({ ... }),
  strategy: z.object({ ... }),
  config: z.object({ ... }),
  turn: z.number().int().min(0).optional().default(0),
  maxTurns: z.number().int().min(1).optional(),
  history: z.array(ConversationMessageSchema).optional().default([]),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
  // NEW: Add count parameter for batch generation
  count: z.number().int().min(1).max(10).optional().default(1),
});
```

#### 1.2 Update Endpoint Handler

**File:** `src/server/routes/redteam.ts`

```typescript
redteamRouter.post('/generate-test', async (req: Request, res: Response): Promise<void> => {
  // ... existing validation ...

  const {
    plugin,
    strategy,
    config,
    turn,
    maxTurns,
    history,
    goal: goalOverride,
    stateful,
    count, // NEW
  } = parsedBody.data;

  // For multi-turn strategies, force count to 1
  const effectiveCount = isMultiTurnStrategy(strategy.id) ? 1 : count;

  // Generate multiple test cases
  const testCases = await pluginFactory.action({
    provider: redteamProvider,
    purpose: config.applicationDefinition.purpose ?? 'general AI assistant',
    injectVar,
    n: effectiveCount, // Use count instead of hardcoded 1
    delayMs: 0,
    config: { ... },
  });

  // Apply strategy to ALL test cases
  let finalTestCases = testCases;
  if (!['basic', 'default'].includes(strategy.id)) {
    const strategyFactory = Strategies.find((s) => s.id === strategy.id);
    const strategyTestCases = await strategyFactory.action(
      testCases,
      injectVar,
      strategy.config || {},
      strategy.id,
    );
    if (strategyTestCases && strategyTestCases.length > 0) {
      finalTestCases = strategyTestCases;
    }
  }

  // Return array of test cases for batch requests
  if (effectiveCount > 1) {
    const results = finalTestCases.map((testCase) => ({
      prompt: extractGeneratedPrompt(testCase, injectVar),
      context: `This test case targets the ${plugin.id} plugin...`,
      metadata: testCase.metadata || {},
    }));

    res.json({ testCases: results, count: results.length });
    return;
  }

  // Existing single test case response (backward compatible)
  const testCase = finalTestCases[0];
  res.json({
    prompt: extractGeneratedPrompt(testCase, injectVar),
    context: ...,
    metadata: ...,
  });
});
```

### Phase 2: Frontend Changes

#### 2.1 Add Batch State to Provider

**File:** `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx`

```typescript
// Constants
const BATCH_SIZE = 5;
const PREFETCH_THRESHOLD = 2; // Prefetch when N remaining

// New state for batch management
const [testCaseBatch, setTestCaseBatch] = useState<GeneratedTestCase[]>([]);
const [batchIndex, setBatchIndex] = useState<number>(0);
const [isPrefetching, setIsPrefetching] = useState(false);

// Ref for prefetch abort controller
const prefetchAbortController = useRef<AbortController | null>(null);
```

#### 2.2 Update API Call Function

```typescript
async function callTestGenerationApi(
  plugin: TargetPlugin,
  strategy: TargetStrategy,
  purpose: string | null = null,
  abortController: AbortController,
  history: ConversationMessage[] = [],
  turn: number = 0,
  maxTurns: number = 1,
  count: number = 1, // NEW parameter
) {
  return callApi('/redteam/generate-test', {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({
      plugin,
      strategy,
      config: { applicationDefinition: { purpose } },
      history,
      turn,
      maxTurns,
      count, // NEW
    }),
    signal: AbortSignal.any([...]),
  });
}
```

#### 2.3 Update Generation Logic

```typescript
const generateTestCaseBatch = useCallback(
  async (abortController: AbortController, count: number = BATCH_SIZE) => {
    if (!plugin || !strategy) return;

    // Multi-turn strategies don't support batching
    if (isMultiTurnStrategy(strategy.id)) {
      count = 1;
    }

    try {
      recordEvent('feature_used', {
        feature: 'redteam_generate_test_case_batch',
        plugin: plugin.id,
        strategy: strategy.id,
        count,
      });

      const response = await callTestGenerationApi(
        plugin,
        strategy,
        redTeamConfig.applicationDefinition.purpose ?? null,
        abortController,
        [], // No history for initial batch
        0,
        1,
        count, // Request batch
      );

      const data = await response.json();
      if (data.error) throw new Error(data?.details ?? data.error);

      // Handle batch response
      if (data.testCases && Array.isArray(data.testCases)) {
        return data.testCases as GeneratedTestCase[];
      }

      // Backward compatible: single test case response
      return [{
        prompt: data.prompt,
        context: data.context,
        metadata: data.metadata,
      }];
    } catch (error) {
      // ... error handling ...
    }
  },
  [plugin, strategy, redTeamConfig, recordEvent, toast],
);
```

#### 2.4 Update Regenerate Handler

```typescript
const handleRegenerate = useCallback(
  async (newPluginId?: string) => {
    // If plugin changed, clear batch and start fresh
    if (newPluginId && newPluginId !== plugin?.id) {
      setTestCaseBatch([]);
      setBatchIndex(0);
      // ... existing plugin lookup logic ...
      handleStart(newPlugin, strategy!);
      return;
    }

    // Check if we have more test cases in the batch
    const nextIndex = batchIndex + 1;

    if (nextIndex < testCaseBatch.length) {
      // Use next test case from batch (instant!)
      setBatchIndex(nextIndex);
      setGeneratedTestCases([testCaseBatch[nextIndex]]);

      // Prefetch if running low
      if (testCaseBatch.length - nextIndex <= PREFETCH_THRESHOLD && !isPrefetching) {
        prefetchNextBatch();
      }
      return;
    }

    // Batch exhausted, generate new batch
    handleStart(plugin!, strategy!);
  },
  [plugin, strategy, batchIndex, testCaseBatch, isPrefetching, handleStart],
);
```

#### 2.5 Add Prefetch Logic

```typescript
const prefetchNextBatch = useCallback(async () => {
  if (isPrefetching || !plugin || !strategy) return;
  if (isMultiTurnStrategy(strategy.id)) return; // No prefetch for multi-turn

  setIsPrefetching(true);
  prefetchAbortController.current?.abort();
  prefetchAbortController.current = new AbortController();

  try {
    const newTestCases = await generateTestCaseBatch(
      prefetchAbortController.current,
      BATCH_SIZE,
    );

    if (newTestCases) {
      setTestCaseBatch((prev) => [...prev, ...newTestCases]);
    }
  } catch (error) {
    // Silent fail for prefetch - not critical
    logger.debug('Prefetch failed', { error });
  } finally {
    setIsPrefetching(false);
  }
}, [isPrefetching, plugin, strategy, generateTestCaseBatch]);
```

#### 2.6 Update Initial Generation Effect

```typescript
useEffect(() => {
  if (isGenerating && plugin && strategy && generatedTestCases.length === currentTurn) {
    const abortController = new AbortController();
    testGenerationAbortController.current = abortController;

    // For single-turn strategies, generate batch
    if (!isMultiTurnStrategy(strategy.id)) {
      generateTestCaseBatch(abortController, BATCH_SIZE).then((batch) => {
        if (batch && batch.length > 0) {
          setTestCaseBatch(batch);
          setBatchIndex(0);
          setGeneratedTestCases([batch[0]]);
          setIsGenerating(false);
        }
      });
    } else {
      // Multi-turn: use existing single generation
      generateTestCase(abortController);
    }

    return () => abortController.abort();
  }
}, [isGenerating, plugin, strategy, currentTurn, generatedTestCases.length]);
```

#### 2.7 Update Reset State

```typescript
const resetState = useCallback(() => {
  setPlugin(null);
  setStrategy(null);
  setGeneratedTestCases([]);
  setTargetResponses([]);
  setCurrentTurn(0);
  setMaxTurns(0);
  setIsRunningTest(false);
  setIsGenerating(false);
  // NEW: Reset batch state
  setTestCaseBatch([]);
  setBatchIndex(0);
  setIsPrefetching(false);
  prefetchAbortController.current?.abort();
  // ... existing refs ...
}, []);
```

### Phase 3: UI Enhancements

#### 3.1 Show Batch Progress Indicator

**File:** `src/app/src/pages/redteam/setup/components/TestCaseDialog.tsx`

```typescript
interface TestCaseDialogProps {
  // ... existing props ...
  batchIndex?: number;
  batchTotal?: number;
}

// In the dialog header, show position in batch
{batchTotal && batchTotal > 1 && (
  <Chip
    label={`${batchIndex + 1} of ${batchTotal}`}
    size="small"
    variant="outlined"
    data-testid="batch-position-chip"
  />
)}
```

#### 3.2 Update Regenerate Button Text

```typescript
<Button
  onClick={() => onRegenerate()}
  variant={canAddAdditionalTurns ? 'outlined' : 'contained'}
  loading={isGenerating || isRunningTest}
>
  {canAddAdditionalTurns
    ? 'Start Over'
    : hasMoreInBatch
      ? 'Next'
      : 'Regenerate'}
</Button>
```

## Test Plan

### Backend Tests

**File:** `test/server/routes/redteam.test.ts` (new or existing)

```typescript
describe('POST /redteam/generate-test', () => {
  describe('batch generation', () => {
    it('should generate single test case by default (backward compatible)', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'basic', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prompt');
      expect(response.body).not.toHaveProperty('testCases');
    });

    it('should generate batch of test cases when count > 1', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'basic', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
          count: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('testCases');
      expect(response.body.testCases).toHaveLength(5);
      expect(response.body.count).toBe(5);
    });

    it('should force count=1 for multi-turn strategies', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'crescendo', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
          count: 5, // Should be ignored
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prompt');
      expect(response.body).not.toHaveProperty('testCases');
    });

    it('should apply strategy to all test cases in batch', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'base64', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
          count: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body.testCases).toHaveLength(3);

      // Verify base64 encoding was applied
      for (const testCase of response.body.testCases) {
        expect(isBase64(testCase.prompt)).toBe(true);
      }
    });

    it('should reject count > 10', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'basic', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
          count: 100,
        });

      expect(response.status).toBe(400);
    });

    it('should reject count < 1', async () => {
      const response = await request(app)
        .post('/redteam/generate-test')
        .send({
          plugin: { id: 'harmful:hate', config: {} },
          strategy: { id: 'basic', config: {} },
          config: { applicationDefinition: { purpose: 'test' } },
          count: 0,
        });

      expect(response.status).toBe(400);
    });
  });
});
```

### Frontend Tests

**File:** `src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.test.tsx`

```typescript
describe('TestCaseGenerationProvider batch generation', () => {
  const mockBatchResponse = {
    testCases: [
      { prompt: 'Test 1', context: 'ctx', metadata: {} },
      { prompt: 'Test 2', context: 'ctx', metadata: {} },
      { prompt: 'Test 3', context: 'ctx', metadata: {} },
      { prompt: 'Test 4', context: 'ctx', metadata: {} },
      { prompt: 'Test 5', context: 'ctx', metadata: {} },
    ],
    count: 5,
  };

  beforeEach(() => {
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBatchResponse),
    } as Response);
  });

  it('should request batch of 5 test cases for single-turn strategy', async () => {
    const { result } = renderHook(() => useTestCaseGeneration(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.generateTestCase(
        { id: 'harmful:hate', config: {}, isStatic: false },
        { id: 'basic', config: {}, isStatic: false },
      );
    });

    expect(callApi).toHaveBeenCalledWith(
      '/redteam/generate-test',
      expect.objectContaining({
        body: expect.stringContaining('"count":5'),
      }),
    );
  });

  it('should show first test case from batch initially', async () => {
    // ... test that generatedTestCases[0] is batch[0]
  });

  it('should show next test case from batch on regenerate without API call', async () => {
    const { result } = renderHook(() => useTestCaseGeneration(), {
      wrapper: createWrapper(),
    });

    // Generate initial batch
    await act(async () => {
      await result.current.generateTestCase(
        { id: 'harmful:hate', config: {}, isStatic: false },
        { id: 'basic', config: {}, isStatic: false },
      );
    });

    // Clear mock to track new calls
    vi.mocked(callApi).mockClear();

    // Regenerate - should use cached test case
    await act(async () => {
      result.current.regenerate();
    });

    // Should NOT make a new API call
    expect(callApi).not.toHaveBeenCalled();
  });

  it('should prefetch when batch is running low', async () => {
    // ... test prefetch logic triggers at PREFETCH_THRESHOLD
  });

  it('should make new API call when batch is exhausted', async () => {
    const { result } = renderHook(() => useTestCaseGeneration(), {
      wrapper: createWrapper(),
    });

    // Generate and exhaust batch
    await act(async () => {
      await result.current.generateTestCase(...);
    });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        result.current.regenerate();
      });
    }

    // Clear mock
    vi.mocked(callApi).mockClear();

    // Next regenerate should trigger new batch request
    await act(async () => {
      result.current.regenerate();
    });

    expect(callApi).toHaveBeenCalled();
  });

  it('should clear batch when plugin changes', async () => {
    // ... test that batch is cleared on plugin change
  });

  it('should NOT batch for multi-turn strategies', async () => {
    const { result } = renderHook(() => useTestCaseGeneration(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.generateTestCase(
        { id: 'harmful:hate', config: {}, isStatic: false },
        { id: 'crescendo', config: {}, isStatic: false },
      );
    });

    expect(callApi).toHaveBeenCalledWith(
      '/redteam/generate-test',
      expect.objectContaining({
        body: expect.stringContaining('"count":1'),
      }),
    );
  });
});
```

### Integration Tests

**File:** `test/redteam/generate-test.integration.test.ts`

```typescript
describe('Test case batch generation E2E', () => {
  it('should generate diverse test cases in batch', async () => {
    const response = await callApi('/redteam/generate-test', {
      method: 'POST',
      body: JSON.stringify({
        plugin: { id: 'pii:direct', config: {} },
        strategy: { id: 'basic', config: {} },
        config: { applicationDefinition: { purpose: 'customer service bot' } },
        count: 5,
      }),
    });

    const data = await response.json();

    expect(data.testCases).toHaveLength(5);

    // Verify diversity - prompts should not be identical
    const uniquePrompts = new Set(data.testCases.map(tc => tc.prompt));
    expect(uniquePrompts.size).toBeGreaterThan(1);
  });
});
```

## Performance Expectations

| Metric | Before | After |
|--------|--------|-------|
| API calls per 5 regenerates | 5 | 1 (+ prefetch) |
| Time to show 2nd test case | ~2-3s (API latency) | <50ms (instant) |
| User-perceived responsiveness | Medium | High |

## Rollout Considerations

1. **Feature flag**: Consider adding a feature flag to enable/disable batching
2. **Gradual rollout**: Start with batch size of 3, increase to 5 after validation
3. **Monitoring**: Track batch hit rate (% of regenerates served from cache)
4. **Error handling**: Graceful degradation to single-generation on batch failures

## Future Enhancements

1. **Adaptive batch size**: Adjust based on plugin/strategy complexity
2. **Smarter prefetching**: Predict user behavior to prefetch proactively
3. **Batch persistence**: Store batches in localStorage for session persistence
4. **Diversity scoring**: Ensure batch test cases are sufficiently diverse
