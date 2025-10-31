# Eval Copy Feature - Implementation Plan

**Date:** 2025-10-31
**Author:** Claude Code
**Status:** Design Phase

## Overview

Add the ability to copy/duplicate evaluations in the OSS promptfoo repo, similar to the cloud implementation. This includes backend API, database model methods, and a full frontend UI with reusable dialog components.

## Background

The cloud repo already has this feature (PR #2259). This design adapts it for OSS, accounting for architectural differences:

- **OSS:** Single-user, file-based auth with `getUserEmail()`, SQLite database
- **Cloud:** Multi-tenant with `userId`/`organizationId`, Postgres database

## Database Architecture Analysis

### Core Tables

#### 1. `evalsTable` (Main eval record)
```typescript
{
  id: string (PK)
  createdAt: number
  author: string | null
  description: string | null
  results: json (EvaluateSummaryV2 | {} - legacy field)
  config: json (UnifiedConfig)
  prompts: json (CompletedPrompt[] - with metrics)
  vars: json (string[])
  runtimeOptions: json
  isRedteam: boolean
}
```

#### 2. `evalResultsTable` (Individual test results - many per eval)
```typescript
{
  id: string (PK)
  evalId: string (FK → evalsTable.id)
  createdAt: number
  updatedAt: number
  promptIdx: number
  testIdx: number
  testCase: json (AtomicTestCase)
  prompt: json (Prompt)
  promptId: string | null (FK → promptsTable.id)
  provider: json (ProviderOptions)
  latencyMs: number | null
  cost: number | null
  response: json (ProviderResponse) | null
  error: string | null
  failureReason: number
  success: boolean
  score: number
  gradingResult: json (GradingResult) | null
  namedScores: json (Record<string, number>) | null
  metadata: json (Record<string, string>) | null
}
```

**Important:** Total rows in `evalResultsTable` = distinct tests × number of prompts. For 500 tests with 2 prompts = 1,000 rows.

### Relationship Tables (Junction/Many-to-Many)

#### 3. `evalsToPromptsTable` (eval ↔ prompt)
```typescript
{
  evalId: string (FK → evalsTable.id, cascade delete)
  promptId: string (FK → promptsTable.id)
  PRIMARY KEY (evalId, promptId)
}
```

Links eval to deduplicated prompt records. Must be copied for new eval.

#### 4. `evalsToTagsTable` (eval ↔ tag)
```typescript
{
  evalId: string (FK → evalsTable.id)
  tagId: string (FK → tagsTable.id)
  PRIMARY KEY (evalId, tagId)
}
```

Links eval to deduplicated tags (e.g., `{redteam: true}`). Tags derived from `config.tags`. Must be copied.

#### 5. `evalsToDatasetsTable` (eval ↔ dataset)
```typescript
{
  evalId: string (FK → evalsTable.id)
  datasetId: string (FK → datasetsTable.id)
  PRIMARY KEY (evalId, datasetId)
}
```

Links eval to deduplicated dataset (test cases). Must be copied.

### Shared Reference Tables (NOT Copied)

#### 6. `promptsTable` (Deduplicated prompts)
```typescript
{
  id: string (PK - hash of prompt content)
  createdAt: number
  prompt: string
}
```

**Deduplication Strategy:** ID = `hashPrompt(prompt)`. Multiple evals can reference the same prompt. `onConflictDoNothing()` on insert.

#### 7. `tagsTable` (Deduplicated tags)
```typescript
{
  id: string (PK - sha256 of "key:value")
  name: string
  value: string
  UNIQUE (name, value)
}
```

**Deduplication Strategy:** ID = `sha256("${name}:${value}")`. `onConflictDoNothing()` on insert.

#### 8. `datasetsTable` (Deduplicated test datasets)
```typescript
{
  id: string (PK - sha256 of tests JSON)
  tests: json (TestCase[])
  createdAt: number
}
```

**Deduplication Strategy:** ID = `sha256(JSON.stringify(config.tests))`. `onConflictDoNothing()` on insert.

### Unrelated Tables (Ignored for Copy)

- `tracesTable` / `spansTable` - Execution traces, specific to original eval run
- `configsTable` - Saved configurations, separate from evals
- `modelAuditsTable` - Model audit results, not eval-related

## What Gets Copied?

### ✅ Must Copy (New Records with New IDs)

1. **evalsTable record**
   - ✅ New `id` (via `createEvalId()`)
   - ✅ New `createdAt` timestamp
   - ✅ New `description` (user-provided or default " (Copy)" suffix)
   - ✅ Deep clone `config` (via `structuredClone()`)
   - ✅ Deep clone `prompts` (CompletedPrompt[] with metrics)
   - ✅ Copy `vars` array
   - ✅ Copy `runtimeOptions`
   - ✅ Copy `isRedteam` flag
   - ✅ Set `author` to current user (via `getUserEmail()`)
   - ⚠️ Leave `results` as `{}` (legacy field, not used in v4)

2. **evalResultsTable records** (batched)
   - ✅ All result rows
   - ✅ New `id` for each row (via `randomUUID()`)
   - ✅ New `evalId` (references new eval)
   - ✅ New `createdAt` timestamp
   - ✅ New `updatedAt` timestamp
   - ✅ Copy all data fields (testCase, prompt, provider, response, scores, metadata, etc.)
   - 🔥 **Batch in chunks of 1000 rows** to avoid memory exhaustion

### ✅ Must Copy (Relationships)

3. **evalsToPromptsTable relationships**
   - Query source eval's relationships
   - Insert same promptId references for new evalId
   - Prompts already exist in promptsTable (deduplicated), just relink

4. **evalsToTagsTable relationships**
   - Derive from `config.tags` (same as `Eval.create()` pattern)
   - Insert tag records with `onConflictDoNothing()`
   - Link new evalId to existing/new tagIds

5. **evalsToDatasetsTable relationship**
   - Query source eval's datasetId
   - Link new evalId to same datasetId
   - Dataset already exists (deduplicated by tests hash)

### ❌ Do NOT Copy (Shared Resources)

6. **promptsTable** - Prompts are deduplicated. Reuse existing.
7. **tagsTable** - Tags are deduplicated. Reuse existing.
8. **datasetsTable** - Datasets are deduplicated. Reuse existing.
9. **tracesTable/spansTable** - Execution traces are specific to original run.

## Design: Eval.copy() Method

### Location
`src/models/eval.ts` - Add as instance method on `Eval` class

### Signature
```typescript
async copy(description?: string): Promise<Eval>
```

### Parameters
- `description?: string` - Optional new description for copied eval. If not provided, defaults to `"${originalDescription} (Copy)"`

### Returns
- `Promise<Eval>` - New eval instance with all data copied

### Implementation Strategy

#### Phase 1: Setup and Validation
```typescript
const newEvalId = createEvalId(new Date());
const copyDescription = description || `${this.description || 'Evaluation'} (Copy)`;
const distinctTestCount = await this.getResultsCount(); // For logging/progress
```

#### Phase 2: Create New Eval Structure (No Results Yet)
```typescript
// Deep clone to prevent mutation
const newConfig = structuredClone(this.config);
newConfig.description = copyDescription; // Update config description

const newPrompts = structuredClone(this.prompts);
const newVars = this.vars ? structuredClone(this.vars) : [];
```

#### Phase 3: Insert New Eval Record
```typescript
db.insert(evalsTable).values({
  id: newEvalId,
  createdAt: Date.now(),
  author: getUserEmail(),
  description: copyDescription,
  config: newConfig,
  results: {}, // Empty for v4
  prompts: newPrompts,
  vars: newVars,
  runtimeOptions: sanitizeRuntimeOptions(this.runtimeOptions),
  isRedteam: Boolean(newConfig.redteam),
}).run();
```

#### Phase 4: Copy Relationships + Results in Transaction
```typescript
await getDb().transaction(async (tx) => {
  // 4a. Copy prompts relationships
  const promptRels = await tx
    .select()
    .from(evalsToPromptsTable)
    .where(eq(evalsToPromptsTable.evalId, this.id));

  for (const rel of promptRels) {
    await tx.insert(evalsToPromptsTable).values({
      evalId: newEvalId,
      promptId: rel.promptId,
    }).onConflictDoNothing();
  }

  // 4b. Copy tags relationships (from config.tags)
  if (this.config.tags) {
    for (const [tagKey, tagValue] of Object.entries(this.config.tags)) {
      const tagId = sha256(`${tagKey}:${tagValue}`);

      await tx.insert(tagsTable).values({
        id: tagId,
        name: tagKey,
        value: tagValue,
      }).onConflictDoNothing();

      await tx.insert(evalsToTagsTable).values({
        evalId: newEvalId,
        tagId,
      }).onConflictDoNothing();
    }
  }

  // 4c. Copy dataset relationship
  const datasetRel = await tx
    .select()
    .from(evalsToDatasetsTable)
    .where(eq(evalsToDatasetsTable.evalId, this.id))
    .limit(1);

  if (datasetRel.length > 0) {
    await tx.insert(evalsToDatasetsTable).values({
      evalId: newEvalId,
      datasetId: datasetRel[0].datasetId,
    }).onConflictDoNothing();
  }

  // 4d. Copy results in batches
  const BATCH_SIZE = 1000;
  let offset = 0;
  let copiedCount = 0;

  while (true) {
    const batch = await tx
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, this.id))
      .orderBy(evalResultsTable.id) // Stable ordering
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    const copiedResults = batch.map((result) => ({
      ...result,
      id: randomUUID(),
      evalId: newEvalId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await tx.insert(evalResultsTable).values(copiedResults);

    copiedCount += batch.length;
    offset += BATCH_SIZE;

    logger.debug({
      message: 'Copied batch of eval results',
      sourceEvalId: this.id,
      targetEvalId: newEvalId,
      batchSize: batch.length,
      rowsCopied: copiedCount,
      distinctTestCount,
    });
  }

  logger.info({
    message: 'Eval copy completed successfully',
    sourceEvalId: this.id,
    targetEvalId: newEvalId,
    rowsCopied: copiedCount,
    distinctTestCount,
  });
});
```

#### Phase 5: Return New Eval Instance
```typescript
return await Eval.findById(newEvalId);
```

### Error Handling
- Transaction ensures atomicity - if any step fails, entire copy is rolled back
- Log errors with context (source eval ID, target eval ID)
- Throw error to be caught by API endpoint

### Edge Cases

1. **Empty evals (0 results)**
   - Still creates new eval record
   - Copies relationships
   - Batching loop exits immediately (no results to copy)
   - ✅ Handled

2. **Large evals (>10K results)**
   - Batching prevents memory exhaustion
   - Progress logging every batch
   - Transaction may be long-running but atomic
   - ✅ Handled

3. **Multi-prompt evals**
   - Each test has results × prompts rows
   - Example: 500 tests × 2 prompts = 1,000 rows
   - Batching handles this naturally
   - ✅ Handled

4. **Missing dataset relationship**
   - Some evals may not have dataset
   - Query returns empty array, skip dataset copy
   - ✅ Handled (check length before insert)

5. **Missing tags**
   - Some evals may not have tags in config
   - Skip tag copying if `config.tags` is undefined
   - ✅ Handled (check existence)

6. **Deep mutation issues**
   - Use `structuredClone()` for config/prompts/vars
   - Prevents accidental mutation of source eval
   - ✅ Handled

## Design: API Endpoint

### Route
`POST /api/eval/:id/copy`

### Location
`src/server/routes/eval.ts` - Add to existing `evalRouter`

### Request Schema (Zod)
```typescript
// In src/server/apiSchemas.ts
export const CopyEvalRequestSchema = z.object({
  description: z.string().optional(),
});
```

### Response Schema (Zod)
```typescript
// In src/server/apiSchemas.ts
export const CopyEvalResponseSchema = z.object({
  id: z.string(),
  distinctTestCount: z.number(),
});
```

### Implementation
```typescript
evalRouter.post('/:id/copy', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { description } = CopyEvalRequestSchema.parse(req.body);

    const sourceEval = await Eval.findById(id);
    if (!sourceEval) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    // Get distinct test count for response
    const distinctTestCount = await sourceEval.getResultsCount();

    // Create copy
    const newEval = await sourceEval.copy(description);

    logger.info({
      message: 'Eval copied via API',
      sourceEvalId: id,
      targetEvalId: newEval.id,
      distinctTestCount,
    });

    res.status(201).json({
      id: newEval.id,
      distinctTestCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).message });
      return;
    }

    logger.error({
      message: 'Failed to copy eval',
      error,
      evalId: req.params.id,
    });
    res.status(500).json({ error: 'Failed to copy evaluation' });
  }
});
```

### Status Codes
- `201 Created` - Copy successful
- `400 Bad Request` - Invalid request body (validation error)
- `404 Not Found` - Source eval doesn't exist
- `500 Internal Server Error` - Copy failed (transaction error, database error)

## Design: Frontend UI

### Component Strategy: Reusable Dialog Pattern

The cloud implementation has two separate dialogs:
1. `CopyEvalDialog` - Handles copy with large eval warnings
2. `EditEvalNameDialog` - Handles rename

For OSS, we'll create **one flexible dialog component** that handles both use cases.

### Component: ConfirmEvalNameDialog

**Location:** `src/app/src/pages/eval/components/ConfirmEvalNameDialog.tsx`

**Why Reusable?**
- Both "copy" and "rename" need:
  - Text input for name/description
  - Loading state during API call
  - Error handling
  - Enter/Esc keyboard shortcuts
  - Focus management

**Props:**
```typescript
interface ConfirmEvalNameDialogProps {
  open: boolean;
  onClose: () => void;
  title: string; // "Copy Evaluation" or "Edit Eval Name"
  label: string; // "Description" or "Name"
  currentName: string;
  actionButtonText: string; // "Create Copy" or "Save"
  helperText?: string;
  onConfirm: (newName: string) => Promise<void>;

  // Optional: for large eval warnings (copy only)
  showSizeWarning?: boolean;
  itemCount?: number;
  itemLabel?: string; // "results", "tests", etc.
}
```

**Usage - Copy:**
```typescript
<ConfirmEvalNameDialog
  open={copyDialogOpen}
  onClose={() => setCopyDialogOpen(false)}
  title="Copy Evaluation"
  label="Description"
  currentName={`${config?.description || 'Evaluation'} (Copy)`}
  actionButtonText="Create Copy"
  onConfirm={handleCopyEval}
  showSizeWarning={totalResultsCount > 10000}
  itemCount={totalResultsCount}
  itemLabel="results"
/>
```

**Usage - Rename:**
```typescript
<ConfirmEvalNameDialog
  open={editNameDialogOpen}
  onClose={() => setEditNameDialogOpen(false)}
  title="Edit Eval Name"
  label="Description"
  currentName={config?.description || ''}
  actionButtonText="Save"
  onConfirm={handleSaveEvalName}
/>
```

### Implementation Details

#### State Management
```typescript
const [name, setName] = useState(currentName);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

#### Size Warning Alert (Conditional)
```typescript
{showSizeWarning && itemCount && (
  <Alert
    severity={itemCount > 50000 ? 'warning' : 'info'}
    sx={{ mb: 2 }}
  >
    This evaluation has {itemCount.toLocaleString()} {itemLabel}.
    {itemCount > 50000
      ? ' Copying may take several minutes. Please be patient.'
      : ' Copying may take up to a minute.'}
  </Alert>
)}
```

#### Keyboard Shortcuts
- **Enter** - Confirm (same as clicking action button)
- **Esc** - Cancel (built-in MUI Dialog behavior)

#### Auto-focus and Selection
```typescript
useEffect(() => {
  if (open) {
    setName(currentName);
    setError(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select(); // Select all text
    }, 100);
  }
}, [open, currentName]);
```

### API Integration - Copy Handler

**Location:** `src/app/src/pages/eval/components/ResultsView.tsx`

```typescript
const handleCopyEval = async (description: string) => {
  try {
    const response = await callApi(`/eval/${evalId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });

    const { id: newEvalId, distinctTestCount } = await response.json();

    // Open in new tab (Google Docs pattern)
    window.open(`/eval/${newEvalId}`, '_blank');

    // Show success toast
    showToast(
      `Copied ${distinctTestCount.toLocaleString()} results successfully`,
      'success'
    );
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to copy evaluation');
  }
};
```

### Menu Integration

**Location:** `src/app/src/pages/eval/components/ResultsView.tsx`

Add "Copy" menu item after "Download" menu:

```typescript
<MenuItem onClick={() => {
  handleMenuClose();
  setCopyDialogOpen(true);
}}>
  <ListItemIcon>
    <ContentCopyIcon fontSize="small" />
  </ListItemIcon>
  Copy
</MenuItem>
```

**Icon:** `@mui/icons-material/ContentCopy`

## Testing Strategy

### Backend Tests

**Location:** `test/models/eval.test.ts` (or new file `test/models/eval.copy.test.ts`)

#### Test Cases:
1. ✅ **Basic copy** - Copy eval with 5 tests, verify all fields
2. ✅ **Custom description** - Copy with user-provided description
3. ✅ **Default description** - Copy without description, verify " (Copy)" suffix
4. ✅ **Empty eval** - Copy eval with 0 results
5. ✅ **Large eval** - Copy eval with >1000 results (tests batching)
6. ✅ **Multi-prompt eval** - Copy eval with multiple prompts, verify all results copied
7. ✅ **Deep clone verification** - Mutate copy, verify original unchanged
8. ✅ **Unique IDs** - Verify all result IDs are unique
9. ✅ **Timestamps** - Verify new timestamps on eval and results
10. ✅ **Dataset relationship** - Verify dataset linked correctly
11. ✅ **Tags relationship** - Verify tags copied correctly
12. ✅ **Prompts relationship** - Verify prompt relationships copied

### Frontend Tests

**Location:** `src/app/src/pages/eval/components/ConfirmEvalNameDialog.test.tsx`

#### Test Cases:
1. ✅ **Render with initial value** - Shows currentName in input
2. ✅ **User types new name** - Input updates
3. ✅ **Click action button** - Calls onConfirm with trimmed value
4. ✅ **Press Enter** - Calls onConfirm
5. ✅ **Press Shift+Enter** - Does NOT call onConfirm
6. ✅ **Click Cancel** - Calls onClose without onConfirm
7. ✅ **Empty name** - Disables action button
8. ✅ **Whitespace-only name** - Disables action button
9. ✅ **Loading state** - Shows spinner, disables inputs
10. ✅ **Error state** - Shows error message
11. ✅ **Size warning** - Shows alert when itemCount > 10000
12. ✅ **Focus management** - Auto-focuses and selects text on open

## Implementation Order

### Phase 1: Backend Foundation
1. ✅ Add `Eval.copy()` method in `src/models/eval.ts`
2. ✅ Add request/response schemas in `src/server/apiSchemas.ts`
3. ✅ Add `POST /api/eval/:id/copy` endpoint in `src/server/routes/eval.ts`
4. ✅ Write backend tests in `test/models/eval.test.ts`

### Phase 2: Frontend UI
5. ✅ Create `ConfirmEvalNameDialog.tsx` component
6. ✅ Write component tests in `ConfirmEvalNameDialog.test.tsx`
7. ✅ Add "Copy" menu item in `ResultsView.tsx`
8. ✅ Integrate dialog with API call
9. ✅ Update existing "Edit Name" to use new dialog

### Phase 3: Polish
10. ✅ Add logging throughout (sanitized)
11. ✅ Update CHANGELOG.md
12. ✅ Manual testing with various eval sizes
13. ✅ Verify transaction rollback on error

## Files to Create/Modify

### New Files
- `docs/plans/2025-10-31-eval-copy-design.md` (this file)
- `src/app/src/pages/eval/components/ConfirmEvalNameDialog.tsx`
- `src/app/src/pages/eval/components/ConfirmEvalNameDialog.test.tsx`

### Modified Files
- `src/models/eval.ts` - Add `copy()` method
- `src/server/apiSchemas.ts` - Add request/response schemas
- `src/server/routes/eval.ts` - Add POST endpoint
- `src/app/src/pages/eval/components/ResultsView.tsx` - Add menu item, dialog integration
- `test/models/eval.test.ts` - Add copy tests
- `CHANGELOG.md` - Document new feature

## Open Questions / Decisions Needed

1. ✅ **Batch size** - 1000 rows (matches cloud)
2. ✅ **Transaction timeout** - SQLite default, should be fine for <1M rows
3. ✅ **Progress feedback** - Server-side logging only (no streaming to client)
4. ✅ **Large eval threshold** - Show warning at 10K results, "very large" at 50K
5. ✅ **Open in new tab** - Yes (matches cloud, Google Docs pattern)
6. ✅ **Component reuse** - Create flexible dialog for both copy and rename

## References

- Cloud PR: `promptfoo-cloud#2259`
- Cloud Files:
  - `server/src/models/eval.ts:copy()` method
  - `server/src/routes/results.ts` - POST endpoint
  - `app/src/pages/eval/components/CopyEvalDialog.tsx`
- OSS Files:
  - `src/database/tables.ts` - Schema definitions
  - `src/models/eval.ts` - Eval class and create() pattern
  - `src/server/routes/eval.ts` - Existing eval endpoints

## Success Criteria

✅ Users can copy any eval via UI menu
✅ Copy preserves all results, config, prompts, metrics
✅ Large evals (>10K results) copy without memory issues
✅ Copy opens in new tab for immediate viewing
✅ All tests pass (backend + frontend)
✅ CHANGELOG updated
✅ No secrets logged (use sanitized logging)

---

**Next Step:** Begin implementation Phase 1 (Backend Foundation)
