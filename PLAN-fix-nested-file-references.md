# Implementation Plan: Fix Nested file:// References in Vars

**Issue:** #1613 - File content not loaded when used in vars dict
**PR to Replace:** #6456 (has critical backward compatibility issues)

---

## Problem Statement

When `file://` references are used in nested vars objects, the file content is not loaded:

```yaml
tests:
  - vars:
      reporting_period:
        current:
          period: '2023-12-31'
        previous:
          report: file://data/report.txt # ❌ Not loaded - stays as string
```

The current code only processes top-level vars:

```typescript
for (const [varName, value] of Object.entries(vars)) {
  if (typeof value === 'string' && value.startsWith('file://')) {
    // Only top-level string values are processed
  }
}
```

---

## Why PR #6456 Failed

The PR reused `processConfigFileReferences()` which processes ALL file:// refs (including top-level) with config-style behavior:

| File Type | Expected (Top-Level)                      | PR Behavior (Broken)     |
| --------- | ----------------------------------------- | ------------------------ |
| JS files  | `fn(varName, basePrompt, vars, provider)` | `fn()` - no args         |
| Python    | `get_var(varName, basePrompt, vars)`      | `get_config()` - no args |
| Images    | base64 data URL                           | Throws "Unsupported"     |
| PDFs      | Text extraction                           | Throws "Unsupported"     |
| YAML      | `JSON.stringify(parsed)`                  | Returns raw object       |

**Result:** 18 test failures, all CI jobs failing.

---

## Solution: Two-Pass Processing

### Core Insight

Top-level and nested `file://` references need **different treatment**:

1. **Top-level** → Full existing behavior (JS with args, images, PDFs, etc.)
2. **Nested** → Simpler loading (text, JSON, YAML only)

### Strategy

1. **First pass:** Process NESTED file:// refs only, SKIP top-level
2. **Second pass:** Existing loop handles top-level with full functionality

This maintains **100% backward compatibility** for top-level refs.

---

## Implementation Details

### Step 1: Create New Helper Functions

**Location:** `src/evaluatorHelpers.ts` (or new file `src/util/nestedFileReference.ts`)

#### 1.1 Supported Extensions Constant

```typescript
const NESTED_SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '']);
```

#### 1.2 Nested File Loader

```typescript
import { parseFileUrl } from './util/functions/loadFunction';

/**
 * Loads a file reference from a nested vars context.
 * Only supports text-based files (.txt, .md, .json, .yaml, .yml).
 * For other file types (images, PDFs, JS, Python), users should use top-level vars.
 */
async function loadNestedFileReference(fileRef: string, basePath: string): Promise<any> {
  const { filePath } = parseFileUrl(fileRef);
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!NESTED_SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported file type "${extension}" in nested vars. ` +
        `Nested file:// references support: .txt, .md, .json, .yaml, .yml. ` +
        `For ${extension} files (images, scripts, PDFs), use a top-level var instead.`,
    );
  }

  const content = await fs.promises.readFile(resolvedPath, 'utf8');

  if (extension === '.json') {
    return JSON.parse(content);
  } else if (extension === '.yaml' || extension === '.yml') {
    return yaml.load(content);
  } else {
    // .txt, .md, or no extension - return as string
    return content;
  }
}
```

#### 1.3 Recursive Processor (Key Function)

```typescript
/**
 * Recursively processes file:// references in nested vars objects.
 *
 * IMPORTANT: Top-level file:// references are intentionally SKIPPED.
 * They are left for the existing loop in renderPrompt() which handles
 * JS/Python with arguments, images, PDFs, and other special cases.
 *
 * @param obj - The vars object (or nested part of it)
 * @param basePath - Base path for resolving file references
 * @param isTopLevel - Whether we're at the root level of vars
 * @returns The processed object with nested file:// refs resolved
 */
async function processNestedVarsFileReferences(
  obj: any,
  basePath: string,
  isTopLevel: boolean = true,
): Promise<any> {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle strings
  if (typeof obj === 'string') {
    // Only process if NOT top-level and is a file:// reference
    if (!isTopLevel && obj.startsWith('file://')) {
      return await loadNestedFileReference(obj, basePath);
    }
    return obj;
  }

  // Handle arrays - array items are never "top-level" in the varName sense
  if (Array.isArray(obj)) {
    const result = [];
    for (const item of obj) {
      result.push(await processNestedVarsFileReferences(item, basePath, false));
    }
    return result;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isTopLevel && typeof value === 'string' && value.startsWith('file://')) {
        // PRESERVE top-level file:// strings for the existing loop
        result[key] = value;
      } else {
        // Recurse for nested content
        result[key] = await processNestedVarsFileReferences(value, basePath, false);
      }
    }
    return result;
  }

  // Primitives (numbers, booleans) pass through unchanged
  return obj;
}
```

### Step 2: Integrate into renderPrompt

**Location:** `src/evaluatorHelpers.ts`, in the `renderPrompt` function

```typescript
export async function renderPrompt(
  prompt: Prompt,
  vars: Record<string, string | object>,
  nunjucksFilters?: NunjucksFilterMap,
  provider?: ApiProvider,
  skipRenderVars?: string[],
): Promise<string> {
  const nunjucks = getNunjucksEngine(nunjucksFilters);

  let basePrompt = prompt.raw;

  // ========== NEW CODE START ==========
  // Step 1: Process NESTED file:// references only
  // Top-level refs are preserved for the existing loop below
  const basePath = cliState.basePath || '';
  vars = await processNestedVarsFileReferences(
    vars,
    path.resolve(process.cwd(), basePath),
    true, // isTopLevel = true for the root vars object
  );
  // ========== NEW CODE END ==========

  // Step 2: Load files - existing code handles top-level with full functionality
  // (JS with varName/basePrompt/vars/provider args, Python, images, PDFs, etc.)
  for (const [varName, value] of Object.entries(vars)) {
    if (typeof value === 'string' && value.startsWith('file://')) {
      // ... EXISTING CODE UNCHANGED ...
    }
  }

  // ... rest of function unchanged ...
}
```

### Step 3: Add Comprehensive Tests

**Location:** `test/evaluatorHelpers.test.ts`

```typescript
describe('nested file:// references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Core Functionality ====================

  it('should load text files in nested vars objects', async () => {
    const prompt = toPrompt('Report: {{ reporting_period.previous.report }}');
    const vars = {
      reporting_period: {
        current: { period: '2023-12-31' },
        previous: {
          period: '2024-02-15',
          report: 'file://data/report.txt',
        },
      },
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('Report content here');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Report: Report content here');
    expect(fs.promises.readFile).toHaveBeenCalledWith(
      expect.stringContaining('data/report.txt'),
      'utf8',
    );
  });

  it('should load JSON files in nested vars and parse them', async () => {
    const prompt = toPrompt('Config: {{ settings.db.host }}');
    const vars = {
      settings: {
        db: 'file://config/database.json',
      },
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(
      JSON.stringify({ host: 'localhost', port: 5432 }),
    );

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Config: localhost');
  });

  it('should load YAML files in nested vars and parse them', async () => {
    const prompt = toPrompt('Server: {{ config.server.host }}');
    const vars = {
      config: {
        server: 'file://config/server.yaml',
      },
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('host: example.com\nport: 8080');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Server: example.com');
  });

  it('should handle deeply nested file references', async () => {
    const prompt = toPrompt('Data: {{ a.b.c.d.content }}');
    const vars = {
      a: { b: { c: { d: { content: 'file://deep/file.txt' } } } },
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('Deep content');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Data: Deep content');
  });

  it('should handle file references in arrays', async () => {
    const prompt = toPrompt('Items: {{ items[0] }}, {{ items[1] }}');
    const vars = {
      items: ['file://item1.txt', 'file://item2.txt'],
    };

    vi.spyOn(fs.promises, 'readFile')
      .mockResolvedValueOnce('First')
      .mockResolvedValueOnce('Second');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Items: First, Second');
  });

  it('should handle arrays of objects with file references', async () => {
    const prompt = toPrompt('{{ documents[0].content }}');
    const vars = {
      documents: [
        { name: 'doc1', content: 'file://doc1.txt' },
        { name: 'doc2', content: 'file://doc2.txt' },
      ],
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('Document 1 content');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Document 1 content');
  });

  // ==================== Error Cases ====================

  it('should throw clear error for unsupported file types in nested vars', async () => {
    const prompt = toPrompt('Image: {{ gallery.photo }}');
    const vars = {
      gallery: { photo: 'file://images/photo.jpg' },
    };

    await expect(renderPrompt(prompt, vars, {})).rejects.toThrow(
      /Unsupported file type "\.jpg" in nested vars/,
    );
    await expect(renderPrompt(prompt, vars, {})).rejects.toThrow(/use a top-level var instead/);
  });

  it('should throw clear error for PDF in nested vars', async () => {
    const vars = { docs: { report: 'file://report.pdf' } };

    await expect(renderPrompt(toPrompt('{{ docs.report }}'), vars, {})).rejects.toThrow(
      /Unsupported file type "\.pdf" in nested vars/,
    );
  });

  it('should throw clear error for JS in nested vars', async () => {
    const vars = { dynamic: { value: 'file://generate.js' } };

    await expect(renderPrompt(toPrompt('{{ dynamic.value }}'), vars, {})).rejects.toThrow(
      /Unsupported file type "\.js" in nested vars/,
    );
  });

  // ==================== Backward Compatibility (CRITICAL) ====================

  it('should still pass arguments to top-level JS file references', async () => {
    const prompt = toPrompt('Value: {{ dynamic }}');
    const vars = { dynamic: 'file:///path/to/script.js' };

    // Mock the JS module to verify it receives correct arguments
    const mockJsFunction = vi.fn().mockReturnValue({ output: 'Generated value' });
    mockDynamicModule('/path/to/script.js', mockJsFunction);

    const result = await renderPrompt(prompt, vars, {}, mockApiProvider);

    expect(result).toBe('Value: Generated value');
    expect(mockJsFunction).toHaveBeenCalledWith(
      'dynamic', // varName
      expect.any(String), // basePrompt
      expect.any(Object), // vars
      mockApiProvider, // provider
    );
  });

  it('should still convert top-level images to base64 data URLs', async () => {
    const prompt = toPrompt('Image: {{ photo }}');
    const vars = { photo: 'file://image.jpg' };

    // Mock file read to return JPEG magic bytes
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAA', 'base64'),
    );

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toContain('data:image/jpeg;base64,');
  });

  it('should still stringify top-level YAML files', async () => {
    const prompt = toPrompt('Config: {{ config }}');
    const vars = { config: 'file://config.yaml' };

    vi.spyOn(fs, 'readFileSync').mockReturnValue('key: value\nother: 123');

    const result = await renderPrompt(prompt, vars, {});

    // Top-level YAML is stringified to JSON
    expect(result).toBe('Config: {"key":"value","other":123}');
  });

  // ==================== Mixed Scenarios ====================

  it('should handle both top-level and nested file references correctly', async () => {
    const prompt = toPrompt('Top: {{ top_file }}, Nested: {{ data.inner }}');
    const vars = {
      top_file: 'file://top.txt',
      data: { inner: 'file://nested.txt' },
    };

    // Nested uses fs.promises.readFile
    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('Nested content');
    // Top-level uses fs.readFileSync
    vi.spyOn(fs, 'readFileSync').mockReturnValue('Top content');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Top: Top content, Nested: Nested content');
  });

  it('should preserve non-file values in nested objects', async () => {
    const prompt = toPrompt('{{ data.name }}: {{ data.content }}');
    const vars = {
      data: {
        name: 'Report', // Plain string - not a file
        count: 42, // Number
        active: true, // Boolean
        content: 'file://report.txt', // File reference
      },
    };

    vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('File content');

    const result = await renderPrompt(prompt, vars, {});

    expect(result).toBe('Report: File content');
  });
});
```

---

## File Changes Summary

| File                            | Changes                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/evaluatorHelpers.ts`       | Add `processNestedVarsFileReferences`, `loadNestedFileReference`, integrate into `renderPrompt` |
| `test/evaluatorHelpers.test.ts` | Add comprehensive test suite for nested file:// refs                                            |

---

## Execution Checklist

- [ ] 1. Create `loadNestedFileReference` function
- [ ] 2. Create `processNestedVarsFileReferences` function
- [ ] 3. Add integration call in `renderPrompt` (before existing loop)
- [ ] 4. Add core functionality tests
- [ ] 5. Add error case tests
- [ ] 6. Add backward compatibility regression tests
- [ ] 7. Add mixed scenario tests
- [ ] 8. Run full test suite: `npm test`
- [ ] 9. Run linter: `npm run lint`
- [ ] 10. Run formatter: `npm run format`
- [ ] 11. Manual testing with example config from issue #1613

---

## Verification Commands

```bash
# Run specific test file
npx vitest run test/evaluatorHelpers.test.ts

# Run tests matching pattern
npx vitest run -t "nested file"

# Run all tests
npm test

# Lint and format
npm run l && npm run f
```

---

## Why This Approach Is Correct

1. **100% Backward Compatible** - Top-level refs handled exactly as before
2. **Fixes Issue #1613** - Nested text/JSON/YAML files now work
3. **Clear Error Messages** - Users know to use top-level for images/JS/Python
4. **Extensible** - Can add more nested types later if needed
5. **Well Tested** - Comprehensive test coverage including regression tests
6. **Simple to Understand** - Two-pass approach is intuitive

---

## Future Considerations

If users request nested support for more file types:

1. **Images in nested vars** - Add to `NESTED_SUPPORTED_EXTENSIONS`, handle base64 encoding
2. **JS/Python in nested vars** - Would need to decide on calling convention (no args? path as varName?)
3. **PDFs in nested vars** - Add PDF text extraction to nested loader

These should be separate PRs with explicit design decisions.
