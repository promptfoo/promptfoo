# Migration Plan: fs to fs/promises

## Overview
This document outlines the plan to migrate from synchronous fs operations to async fs/promises across the promptfoo codebase. We'll migrate one file at a time, testing after each change.

## Already Migrated
- ✅ `src/commands/init.ts` - Already uses `fs/promises`

## Files to Migrate (46 total)

### Priority 1: Simple Files (Low Risk)
These files have minimal fs operations and are good starting points:

1. **src/prompts/processors/markdown.ts**
   - `readFileSync` (line 6)
   - Single read operation, simple async conversion

2. **src/prompts/processors/csv.ts**
   - `readFileSync` (line 23)
   - Single read operation

3. **src/prompts/processors/text.ts**
   - `readFileSync` (line 14)
   - Single read operation

4. **src/prompts/processors/json.ts**
   - `readFileSync` (line 15)
   - Single read operation

5. **src/prompts/processors/jsonl.ts**
   - `readFileSync` (line 12)
   - Single read operation

6. **src/prompts/processors/yaml.ts**
   - `readFileSync` (line 19)
   - Single read operation

7. **src/prompts/processors/jinja.ts**
   - `readFileSync` (line 14)
   - Single read operation

### Priority 2: Utility Files (Medium Risk)
These are heavily used utilities that need careful migration:

8. **src/util/file.ts**
   - `readFileSync` (lines 79, 117, 121)
   - `existsSync` (line 117)
   - Critical file loading utility

9. **src/assertions/utils.ts**
   - `readFileSync` (line 61)
   - Single read operation

10. **src/assertions/index.ts**
    - `readFileSync` (line 474)
    - Single read for loading assertions

### Priority 3: Cache and Database (Medium Risk)
11. **src/cache.ts**
    - `existsSync` (line 26)
    - `mkdirSync` (line 28)
    - Directory creation logic

12. **src/database/signal.ts**
    - `writeFileSync` (lines 16, 30)
    - `existsSync` (line 28)
    - Database signaling

### Priority 4: Configuration Files (High Risk)
These handle configuration and need careful async handling:

13. **src/globalConfig/globalConfig.ts**
    - `writeFileSync` (lines 15, 35)
    - `existsSync` (lines 25, 32)
    - `readFileSync` (line 26)
    - `mkdirSync` (line 33)
    - Global config management

14. **src/util/config/load.ts**
    - `readFileSync` (lines 166, 501)
    - `existsSync` (line 233)
    - Config loading logic

15. **src/util/config/manage.ts**
    - `existsSync` (line 16)
    - `mkdirSync` (line 17)
    - `writeFileSync` (line 52)
    - Config management

### Priority 5: Test Case Management (High Risk)
16. **src/util/testCaseReader.ts**
    - `readFileSync` (lines 46, 141, 184, 198, 214, 247, 350, 353)
    - Multiple reads, critical for test loading

### Priority 6: Command Files (High Risk)
17. **src/commands/eval.ts**
    - `existsSync` (line 135)
    - `statSync` (line 135)
    - Command execution logic

18. **src/commands/import.ts**
    - `readFileSync` (line 19)
    - Import functionality

19. **src/commands/debug.ts**
    - `existsSync` (line 48)
    - Debug command

20. **src/commands/generate/assertions.ts**
    - `writeFileSync` (lines 71, 95)
    - `readFileSync` (line 87)
    - Assertion generation

21. **src/commands/generate/dataset.ts**
    - `writeFileSync` (lines 69, 71, 97)
    - `readFileSync` (line 87)
    - Dataset generation

### Priority 7: Red Team Commands (High Risk)
22. **src/redteam/commands/init.ts**
    - `existsSync` (line 212)
    - `mkdirSync` (line 213)
    - `writeFileSync` (lines 612, 615)

23. **src/redteam/commands/generate.ts**
    - `readFileSync` (lines 52, 116, 380, 453)
    - `existsSync` (line 112)
    - `writeFileSync` (line 372)

24. **src/redteam/commands/discover.ts**
    - `existsSync` (line 322)

25. **src/redteam/commands/poison.ts**
    - `readdirSync` (line 42)
    - `statSync` (line 46)
    - `readFileSync` (line 94)
    - `mkdirSync` (lines 112, 139)
    - `writeFileSync` (lines 119, 170)
    - `existsSync` (lines 148, 149)

26. **src/redteam/index.ts**
    - `existsSync` (line 132)
    - `readFileSync` (lines 137, 139, 141)

27. **src/redteam/shared.ts**
    - `mkdirSync` (line 63)
    - `writeFileSync` (line 64)
    - `existsSync` (line 88)

### Priority 8: Provider Files (High Risk)
28. **src/providers/index.ts**
    - `readFileSync` (lines 57, 159)
    - Provider loading

29. **src/providers/pythonCompletion.ts**
    - `readFileSync` (line 108)
    - Python provider

30. **src/providers/golangCompletion.ts**
    - `existsSync` (line 57)
    - `readFileSync` (line 74)
    - `mkdirSync` (lines 109, 130)
    - `readdirSync` (line 110)
    - `copyFileSync` (lines 117, 131)
    - Golang provider with file operations

31. **src/providers/scriptCompletion.ts**
    - `existsSync` (line 46)
    - `statSync` (line 46)
    - `readFileSync` (line 47)
    - Script execution

32. **src/providers/http.ts**
    - `readFileSync` (lines 142, 168, 266)
    - `existsSync` (lines 259, 262)
    - HTTP provider with cert loading

### Priority 9: Python Integration (High Risk)
33. **src/python/wrapper.ts**
    - `writeFileSync` (line 25)
    - `unlinkSync` (line 34)
    - Temp file handling

34. **src/python/pythonUtils.ts**
    - `writeFileSync` (line 154)
    - `readFileSync` (line 181)
    - `unlinkSync` (line 219)
    - Python execution utilities

### Priority 10: Strategy Files (Medium Risk)
35. **src/redteam/strategies/simpleImage.ts**
    - `writeFileSync` (line 188)
    - Image generation

36. **src/redteam/strategies/simpleVideo.ts**
    - `existsSync` (lines 46, 57, 60)
    - `mkdirSync` (line 47)
    - `writeFileSync` (lines 53, 231)
    - `unlinkSync` (lines 58, 61)
    - `readFileSync` (line 94)
    - Video generation with temp files

### Priority 11: Plugin Files (Low Risk)
37. **src/redteam/plugins/donotanswer.ts**
    - `readFileSync` (line 54)
    - Dataset loading

38. **src/redteam/plugins/xstest.ts**
    - `readFileSync` (line 55)
    - Dataset loading

### Priority 12: Large/Complex Files (Very High Risk)
39. **src/util/index.ts**
    - `existsSync` (line 120)
    - `mkdirSync` (line 121)
    - `writeFileSync` (lines 133, 155, 171, 198, 219)
    - `appendFileSync` (lines 151, 202)
    - `readFileSync` (lines 185, 238)
    - `statSync` (line 421)
    - Core utility file with many operations

40. **src/evaluatorHelpers.ts**
    - `readFileSync` (lines 38, 186, 209, 217)
    - Evaluation helpers

41. **src/fetch.ts**
    - `readFileSync` (line 117)
    - Certificate loading

42. **src/onboarding.ts**
    - `existsSync` (lines 285, 341)
    - `writeFileSync` (line 332)
    - `mkdirSync` (line 342)
    - Onboarding flow

### Priority 13: Server Routes (High Risk)
43. **src/server/routes/modelAudit.ts**
    - `existsSync` (lines 54, 120)
    - `statSync` (line 60)
    - Server endpoint

### Priority 14: MCP Tools (Low Risk)
44. **src/commands/mcp/tools/generateDataset.ts**
    - `writeFileSync` (line 101)
    - Tool output

45. **src/commands/mcp/tools/generateTestCases.ts**
    - `writeFileSync` (line 130)
    - Tool output

46. **src/prompts/processors/python.ts**
    - `readFileSync` (line 90)
    - Python prompt processing

## Migration Strategy

1. Start with Priority 1 files (simple, single operations)
2. Run tests after each file migration
3. Fix any broken tests before proceeding
4. Move to higher priority groups only after lower ones are stable
5. Pay special attention to:
   - Error handling changes (sync try/catch → async try/catch)
   - Function signatures (sync → async)
   - Import statement updates
   - Removing `Sync` suffixes
   - Adding `await` keywords
   - Updating function declarations to `async`

## Common Patterns to Replace

```typescript
// Before
import fs from 'fs';
const content = fs.readFileSync(path, 'utf8');

// After
import fs from 'fs/promises';
const content = await fs.readFile(path, 'utf8');
```

```typescript
// Before
if (fs.existsSync(path)) { ... }

// After
try {
  await fs.access(path);
  // File exists
} catch {
  // File doesn't exist
}
```

```typescript
// Before
fs.mkdirSync(path, { recursive: true });

// After
await fs.mkdir(path, { recursive: true });
```

## Notes
- Some files may require significant refactoring to properly handle async operations
- Watch for cascading effects where making one function async requires updating all callers
- Consider using `node:fs/promises` prefix during migration for clarity