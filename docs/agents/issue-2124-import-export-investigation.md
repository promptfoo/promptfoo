# Issue #2124: Import/Export Data Loss Investigation

## Objective

Determine exactly where data is lost in the export -> import -> re-export cycle by comparing database records at each stage.

## Test Plan

### Phase 1: Baseline Capture

1. Select a test eval with meaningful data (10+ results)
2. Capture complete database state for that eval:
   - `evals` table record (all columns)
   - `eval_results` table records (all columns)
   - `evals_to_prompts` junction table
   - `evals_to_datasets` junction table
   - `evals_to_tags` junction table
   - `prompts` table (related records)
   - `datasets` table (related records)

### Phase 2: Export Analysis

1. Export the eval to JSON using `promptfoo export eval`
2. Analyze the exported JSON structure:
   - What fields are present at top level?
   - What's in `results`?
   - What's in `metadata`?
   - What's in `config`?
3. Compare against database schema - identify missing fields

### Phase 3: Import Analysis

1. Import the exported JSON to a fresh context
2. Capture the new database state
3. Compare field-by-field:
   - evalId preservation
   - createdAt preservation
   - author preservation
   - description preservation
   - config preservation
   - results count
   - results data integrity
   - junction table relationships

### Phase 4: Re-Export Comparison

1. Export the imported eval
2. Compare original export vs re-export:
   - Structural differences
   - Data differences
   - Field value differences

## Expected Issues to Find

Based on code analysis:

1. **evalId not preserved** - import uses `evalData.id` but export outputs `evalId`
2. **createdAt not preserved** - import uses `evalData.createdAt` but export puts it in `metadata.evaluationCreatedAt`
3. **author not preserved** - import uses `evalData.author` but export puts it in `metadata.author`
4. **Potential data loss in eval_results** - need to verify all fields survive the cycle
5. **Junction table relationships** - are prompts/datasets/tags preserved?

## Database Schema Reference

```sql
-- evals table
id TEXT PRIMARY KEY
created_at INTEGER
author TEXT
description TEXT
results TEXT (JSON)
config TEXT (JSON)
prompts TEXT (JSON)
vars TEXT (JSON)
runtime_options TEXT (JSON)
is_redteam INTEGER

-- eval_results table
id TEXT PRIMARY KEY
created_at INTEGER
updated_at INTEGER
eval_id TEXT (FK -> evals.id)
prompt_idx INTEGER
test_idx INTEGER
test_case TEXT (JSON)
prompt TEXT (JSON)
prompt_id TEXT (FK -> prompts.id)
provider TEXT (JSON)
latency_ms INTEGER
cost REAL
... (many more fields)
```

## Test Eval

Using: `eval-5Qb-2025-12-15T00:18:49` (10 results, has description)

## Execution Commands

```bash
# Phase 1: Capture baseline
sqlite3 ~/.promptfoo/promptfoo.db "SELECT * FROM evals WHERE id = 'eval-5Qb-2025-12-15T00:18:49';"
sqlite3 ~/.promptfoo/promptfoo.db "SELECT COUNT(*) FROM eval_results WHERE eval_id = 'eval-5Qb-2025-12-15T00:18:49';"

# Phase 2: Export
npm run local -- export eval eval-5Qb-2025-12-15T00:18:49 -o /tmp/test-export.json

# Phase 3: Import (after clearing or using different db)
npm run local -- import /tmp/test-export.json

# Phase 4: Re-export and compare
npm run local -- export eval <new-id> -o /tmp/test-reexport.json
diff /tmp/test-export.json /tmp/test-reexport.json
```

## Findings

Investigation completed 2025-12-15.

### Test Setup
- Original eval: `eval-5Qb-2025-12-15T00:18:49`
- Exported to: `/tmp/pf-test-export.json`
- Imported as: `eval-07E-2025-12-15T04:59:09` (NEW ID!)
- Re-exported to: `/tmp/pf-test-reexport.json`

### evalId Preservation
- [x] Original ID preserved on import? **NO - New ID generated**
- [x] ID format unchanged? N/A - completely different ID

**Root Cause:** Import code uses `evalData.id` but export outputs `evalId`

```
Original: eval-5Qb-2025-12-15T00:18:49
Imported: eval-07E-2025-12-15T04:59:09
```

### Timestamp Preservation
- [x] createdAt matches original? **NO - Defaults to import time**
- [x] Or defaults to import time? **YES**

**Root Cause:** Import uses `evalData.createdAt` (undefined) but export puts timestamp in `metadata.evaluationCreatedAt`

```
Original: 2025-12-15T00:18:49.291Z
Imported: 2025-12-15T04:59:09.715Z (import time)
```

### Author Preservation
- [x] Author string preserved? **NO - Defaults to "Unknown"**
- [x] Or defaults to "Unknown"? **YES**

**Root Cause:** Import uses `evalData.author` (undefined) but export puts author in `metadata.author`

```
Original: (empty string)
Imported: "Unknown"
```

### Results Data Integrity
- [x] All results imported? **YES - 10/10**
- [x] All result fields preserved? **YES**
- [x] Scores match? **YES**
- [x] Grading results match? **YES**

Results data is fully preserved through the cycle.

### Config Preservation
- [x] Full config preserved? **YES**
- [x] Tests array preserved? **YES**
- [x] Provider config preserved? **YES**

### Relationship Tables
- [x] prompts table populated? **YES**
- [x] evals_to_prompts junction populated? **YES (2 records)**
- [x] datasets table populated? **YES**
- [x] evals_to_datasets junction populated? **YES (1 record)**
- [x] tags preserved? **N/A (no tags in test eval)**

## Summary of Data Loss

| Field | Original | After Import | Status |
|-------|----------|--------------|--------|
| evalId | `eval-5Qb-...` | `eval-07E-...` | **LOST** |
| createdAt | `00:18:49` | `04:59:09` | **LOST** |
| author | `""` | `"Unknown"` | **LOST** |
| description | ✓ | ✓ | Preserved |
| config | ✓ | ✓ | Preserved |
| results (10) | ✓ | ✓ | Preserved |
| prompts junction | ✓ | ✓ | Preserved |
| datasets junction | ✓ | ✓ | Preserved |

## Root Cause Analysis

The export format uses these field names:
```json
{
  "evalId": "eval-XXX",           // ID is here
  "metadata": {
    "evaluationCreatedAt": "...", // Timestamp is here
    "author": "..."               // Author is here
  }
}
```

But the import code (src/commands/import.ts) looks for:
```typescript
id: evalData.id,                    // undefined!
createdAt: evalData.createdAt,      // undefined!
author: evalData.author || 'Unknown' // undefined!
```

## Recommended Fix

### Option A: Minimal Fix (3 field mappings)

Update `src/commands/import.ts` to extract data from correct locations:

```typescript
// Extract from correct export locations
const importId = evalData.evalId || evalData.id;
const importCreatedAt = evalData.metadata?.evaluationCreatedAt
  ? new Date(evalData.metadata.evaluationCreatedAt)
  : evalData.createdAt
    ? new Date(evalData.createdAt)
    : new Date();
const importAuthor = evalData.metadata?.author || evalData.author || 'Unknown';
```

### Option B: Complete Fix (with collision handling)

Same as Option A, plus:
1. Check if eval with `importId` already exists before insert
2. Provide clear error message if collision occurs
3. Add `--new-id` flag to force new ID generation

### Recommendation

Implement Option B for best user experience:
- Fixes the data loss bugs
- Prevents silent duplicate creation
- Provides clear error messages
- Gives users control via flag

## Files to Modify

1. `src/commands/import.ts` - Main fix location
2. `test/commands/import.test.ts` - Update tests to verify preservation
3. `site/docs/` - Document the behavior (optional)

---

## Deep Investigation: Additional Findings (2025-12-15 05:08)

### Complete Field Analysis

#### evals Table Fields

| Field | Original | After Import | Status | Notes |
|-------|----------|--------------|--------|-------|
| id | `eval-5Qb-...` | `eval-p0P-...` | **LOST** | Bug: wrong field name |
| created_at | `00:18:49` | `05:08:03` | **LOST** | Bug: wrong field location |
| author | `""` | `"Unknown"` | **LOST** | Bug: wrong field location |
| description | ✓ | ✓ | OK | |
| results | ✓ | ✓ | OK | |
| config | ✓ | ✓ | OK | |
| prompts | ✓ | ✓ | OK | |
| vars | `["body","keyword","metricCategory"]` | `[]` | **LOST** | Not passed to Eval.create() |
| runtime_options | `{showProgressBar:true,...}` | null | **LOST** | Not passed to Eval.create() |
| is_redteam | 0 | 0 | OK | |
| is_favorite | 0 | 0 | OK | Not exported (user pref) |

#### eval_results Fields

| Field | Status | Notes |
|-------|--------|-------|
| All scalar fields | OK | score, success, latency, cost, etc. |
| test_case | OK | Full test case preserved |
| prompt | OK | Prompt preserved |
| response | OK | Full response preserved |
| grading_result | OK | Full grading results preserved |
| provider | **PARTIAL** | `provider.config` intentionally stripped |
| metadata | OK | |

### Data Loss Categories

#### 1. Critical Bugs (MUST FIX)
- `evalId` - Import reads wrong field
- `createdAt` - Import reads wrong field
- `author` - Import reads wrong field

#### 2. Missing Parameters (SHOULD FIX)
- `vars` - Not passed to `Eval.create()` on import
- `runtime_options` - Not passed to `Eval.create()` on import

Note: `vars` can be reconstructed from results, but for perfect round-trip fidelity we should preserve it.

#### 3. Intentionally Stripped (BY DESIGN - DO NOT FIX)
- `provider.config` - Stripped in `toEvaluateResult()` for security (may contain API keys)

#### 4. User Preferences (NOT EXPORTED - OK)
- `is_favorite` - User preference, not eval data

### Code Analysis: Where Data is Lost

**Export path (toEvaluateResult in evalResult.ts:348):**
```typescript
provider: { id: this.provider.id, label: this.provider.label },
// Intentionally strips provider.config for security
```

**Import path (import.ts:22-27):**
```typescript
const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
  id: evalData.id,           // BUG: should be evalData.evalId
  createdAt: evalData.createdAt,  // BUG: should be metadata.evaluationCreatedAt
  author: evalData.author || 'Unknown',  // BUG: should check metadata.author
  completedPrompts: evalData.results.prompts,
  // MISSING: vars not passed
  // MISSING: runtimeOptions not passed (though not in export)
});
```

---

## Implementation Plan

### Phase 1: Fix Critical Import Bugs

**File:** `src/commands/import.ts`

1. Extract `evalId` from correct location: `evalData.evalId || evalData.id`
2. Extract `createdAt` from correct location: `evalData.metadata?.evaluationCreatedAt`
3. Extract `author` from correct location: `evalData.metadata?.author`
4. Add collision detection before insert
5. Add `--new-id` flag for forced new ID generation

### Phase 2: Fix Missing Parameters

1. Derive `vars` from results on import (extract unique var keys from test cases)
2. Document that `runtime_options` are not preserved (runtime-only settings)

### Phase 3: Update Tests

**File:** `test/commands/import.test.ts`

1. Update test to verify evalId is preserved
2. Add test for createdAt preservation
3. Add test for author preservation
4. Add test for collision handling
5. Add test for --new-id flag

### Phase 4: Update Test Fixture

**File:** `test/__fixtures__/sample-export.json`

Ensure the fixture has all the fields we're testing (evalId, metadata.evaluationCreatedAt, metadata.author)

---

## Final Verification (2025-12-15 00:31)

Complete round-trip test with `sample-export.json`:

| Field | Original Export | After Import | After Re-Export |
|-------|-----------------|--------------|-----------------|
| evalId | `eval-WJi-2025-10-01T20:08:11` | `eval-WJi-2025-10-01T20:08:11` | `eval-WJi-2025-10-01T20:08:11` |
| createdAt | `2025-10-01T20:08:11.168Z` | `2025-10-01T20:08:11.168Z` | `2025-10-01T20:08:11.168Z` |
| author | `steve@promptfoo.dev` | `steve@promptfoo.dev` | `steve@promptfoo.dev` |
| description | ✓ | ✓ | ✓ |
| vars | N/A | `["riddle"]` | (derived) |
| results (4) | ✓ | ✓ | ✓ |

**All critical fields are now preserved through the export/import cycle.**

### Tests Added
- `should successfully import the sample export file preserving evalId`
- `should preserve createdAt timestamp from metadata`
- `should derive vars from results`
- `should preserve author from metadata`
- `should reject import when eval already exists`
- `should allow import with --new-id flag when eval already exists`

All 9 tests pass.

## Final Fix Summary

```typescript
// src/commands/import.ts - Updated logic

// 1. Extract from correct locations with fallbacks
const importId = evalData.evalId || evalData.id;
const importCreatedAt = evalData.metadata?.evaluationCreatedAt
  ? new Date(evalData.metadata.evaluationCreatedAt)
  : evalData.createdAt
    ? new Date(evalData.createdAt)
    : new Date();
const importAuthor = evalData.metadata?.author || evalData.author;

// 2. Derive vars from results (for round-trip fidelity)
const vars = [...new Set(
  evalData.results.results.flatMap(r => Object.keys(r.vars || {}))
)];

// 3. Check for collision (if not --new-id)
if (importId && !cmdObj.newId) {
  const existing = await Eval.findById(importId);
  if (existing) {
    logger.error(`Eval ${importId} already exists. Use --new-id to import with a new ID.`);
    process.exit(1);
  }
}

// 4. Create eval with correct parameters
const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
  id: cmdObj.newId ? undefined : importId,
  createdAt: importCreatedAt,
  author: importAuthor,
  completedPrompts: evalData.results.prompts,
  vars,
});
```
