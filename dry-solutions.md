# DRY Solutions for Python Dereferencing Issue

## Current Pattern Analysis

All Python handlers follow identical pattern:
```typescript
runPython(filePath, functionName, args)
```

But after dereferencing, they receive file content instead of file paths.

## DRY Solution Options

### Option A: Smart Python Wrapper (Recommended)

Create a centralized wrapper that handles both file paths and dereferenced content:

```typescript
// src/python/smartPythonRunner.ts
export async function runPythonSmart(
  pathOrContent: string, 
  functionName: string, 
  args: any[]
): Promise<any> {
  // Detect if this is file content (dereferenced) or file path
  if (pathOrContent.startsWith('def ') || pathOrContent.includes('def ')) {
    // Handle dereferenced file content
    return await handlePythonContent(pathOrContent, functionName, args);
  } else {
    // Handle file path (original behavior)
    return await runPython(pathOrContent, functionName, args);
  }
}

async function handlePythonContent(content: string, functionName: string, args: any[]): Promise<any> {
  // Extract or default function name
  const funcMatch = content.match(/def\s+(\w+)\s*\(/);
  const actualFunctionName = funcMatch ? funcMatch[1] : functionName;
  
  // Create wrapper script and execute
  const script = `${content}

def main(*args):
    return ${actualFunctionName}(*args)`;
    
  return await runPythonCode(script, 'main', args);
}
```

**Usage**: Replace `runPython` with `runPythonSmart` across all handlers - **1 line change each**!

### Option B: Enhanced Dereferencing with Selective Skipping

Create a smarter dereferencing system:

```typescript
// src/util/file.ts - Enhanced
const PYTHON_CONTEXTS = [
  { key: 'value', condition: (parent: any) => parent?.type === 'python' },
  { key: 'transform', condition: (value: any) => value?.endsWith?.('.py') },
  { pattern: /\.py(?::\w+)?$/ }, // General .py file pattern
];

function shouldSkipPythonDereferencing(parentObj: any, key: string, value: string): boolean {
  if (!value?.startsWith?.('file://')) return false;
  
  return PYTHON_CONTEXTS.some(ctx => {
    if (ctx.key && ctx.condition) {
      return key === ctx.key && ctx.condition(parentObj);
    }
    if (ctx.pattern) {
      return ctx.pattern.test(value);
    }
    return false;
  });
}
```

### Option C: Python Handler Factory

Create a factory that wraps any Python handler:

```typescript
// src/python/handlerFactory.ts
export function withPythonSupport<T extends (...args: any[]) => any>(
  handler: T,
  pathArgIndex: number = 0
): T {
  return ((...args: any[]) => {
    const pathOrContent = args[pathArgIndex];
    
    if (typeof pathOrContent === 'string' && pathOrContent.includes('def ')) {
      // Handle dereferenced content
      return handleDereferencedPython(handler, args, pathArgIndex);
    }
    
    return handler(...args);
  }) as T;
}

// Usage:
export const pythonPromptFunction = withPythonSupport(
  (filePath: string, functionName: string, context: any) => {
    return runPython(filePath, functionName, [context]);
  }
);
```

### Option D: Middleware Pattern

Create a middleware system for Python handlers:

```typescript
// src/python/middleware.ts
const pythonMiddleware = (pathOrContent: string, functionName: string, args: any[]) => {
  // Pre-process: detect and handle dereferenced content
  if (pathOrContent.includes('def ')) {
    return { 
      pathOrContent: createTempPythonFile(pathOrContent), 
      functionName, 
      args,
      cleanup: () => deleteTempFile()
    };
  }
  return { pathOrContent, functionName, args };
};

export const runPythonWithMiddleware = middleware(runPython, [pythonMiddleware]);
```

## Recommendation: Option A (Smart Python Wrapper)

**Why Option A is best:**

1. **Minimal Changes**: Replace `runPython` → `runPythonSmart` (1-line change per file)
2. **Zero Risk**: Fallback to original behavior for file paths  
3. **DRY**: Single implementation handles all cases
4. **Backward Compatible**: No breaking changes
5. **Testable**: Easy to unit test both paths
6. **Clear Intent**: Function name indicates smart behavior

**Implementation Plan:**

1. Create `src/python/smartPythonRunner.ts` 
2. Replace imports across 5 files:
   ```diff
   - import { runPython } from '../python/pythonUtils';
   + import { runPythonSmart as runPython } from '../python/smartPythonRunner';
   ```
3. **Done!** All handlers now handle both file paths and dereferenced content

**Benefits:**
- ✅ Fixes all 5 Python constructs
- ✅ DRY - single implementation  
- ✅ Minimal code changes
- ✅ Zero breaking changes
- ✅ Maintains existing APIs
- ✅ Easy to test and debug