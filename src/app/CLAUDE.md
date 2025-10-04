# Frontend Application

**What this is:** React-based web UI (Vite + TypeScript + MUI). Separate workspace from main codebase.

## 🚨 CRITICAL: API Calls

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';

// ✅ CORRECT - Handles dev/prod API URLs
const data = await callApi('/traces/evaluation/123');

// ❌ WRONG - Will fail in development
const data = await fetch('/api/traces/evaluation/123');
```

**Why:** `callApi` handles API base URL differences between dev (proxy to localhost:3000) and production.

## Tech Stack

- **React 18** + **TypeScript** + **Vite** (not Next.js, not CRA)
- **Vitest** for testing (NOT Jest - main codebase uses Jest)
- **MUI (Material-UI)** - Component library
- **Zustand** - State management (not Redux)
- **React Router v7** - Routing
- **Socket.io Client** - Real-time updates

## Directory Structure

```
src/app/src/
├── components/    # Reusable UI components
├── pages/        # Route pages
├── hooks/        # Custom React hooks
├── store/        # Zustand state stores
├── contexts/     # React contexts
└── utils/        # Including the critical api.ts
```

## Development

```bash
npm run dev:app    # From root
npm run dev        # From src/app/
```

Runs on `http://localhost:5173` (Vite default).

## Testing

### Running Tests

```bash
# From src/app/
npm run test       # Run all tests

# From project root
npm run test:app

# Run specific test file
npm run test -- src/components/JsonTextField.test.tsx

# Run tests in watch mode (development)
npm run test -- --watch

# Run with coverage
npm run test -- --coverage
```

**Note:** This is **Vitest**, not Jest. Different API, different config.

### Vitest vs Jest Differences

**Import from vitest:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

**NOT from @jest/globals** (that's for the main codebase).

### Writing Vitest Tests

**Basic component test:**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const onAction = vi.fn();
    render(<MyComponent onAction={onAction} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

**Testing with MUI theme:**

```typescript
import { ThemeProvider, createTheme } from '@mui/material/styles';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('MyMuiComponent', () => {
  it('should render with theme', () => {
    renderWithTheme(<MyMuiComponent />);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
```

**Mocking functions:**

```typescript
import { vi } from 'vitest';

// Mock a function
const mockFn = vi.fn();

// Mock a module
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn().mockResolvedValue({ data: 'test' }),
}));

// Spy on a function
const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
```

**Testing async operations:**

```typescript
import { waitFor } from '@testing-library/react';

it('should load data', async () => {
  render(<DataComponent />);

  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### Test Configuration

- **Config**: `src/app/vite.config.ts` (see `test:` section)
- **Setup**: `src/app/src/setupTests.ts` (runs before all tests)
- **Environment**: `jsdom` (simulates browser)
- **Globals**: Enabled (`describe`, `it`, `expect` available globally)

### Common Testing Patterns

**Testing Zustand stores:**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyStore } from '@app/stores/myStore';

describe('useMyStore', () => {
  it('should update state', () => {
    const { result } = renderHook(() => useMyStore());

    act(() => {
      result.current.setValue('new value');
    });

    expect(result.current.value).toBe('new value');
  });
});
```

**Testing components with React Router:**

```typescript
import { MemoryRouter } from 'react-router-dom';

const renderWithRouter = (component: React.ReactNode, initialRoute = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      {component}
    </MemoryRouter>
  );
};
```

### Best Practices

- **Clean up after tests** - Vitest auto-cleans most things, but clear mocks if needed
- **Use Testing Library queries** - `getByRole`, `getByLabelText`, etc.
- **Test user behavior** - Not implementation details
- **Mock API calls** - Don't make real network requests
- **Wrap MUI components** in ThemeProvider for tests

### Example Test Files

See these for reference patterns:

- `src/app/src/components/JsonTextField.test.tsx` - Component testing
- `src/app/src/stores/userStore.test.ts` - Zustand store testing
- `src/app/src/utils/discovery.test.ts` - Utility function testing

## Common Patterns & Best Practices

### 1. Zustand State Management

**Pattern: Store with persist middleware**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyState {
  value: string | null;
  setValue: (value: string) => void;
  fetchData: () => Promise<void>;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      value: null,

      setValue: (value) => set({ value }),

      fetchData: async () => {
        // ✅ Use getState() to check current state
        if (get().value) {
          return; // Already loaded
        }
        const response = await callApi('/endpoint');
        set({ value: response.data });
      },
    }),
    {
      name: 'my-store',
      skipHydration: true, // Prevents SSR issues
    },
  ),
);
```

**Access state outside components:**

```typescript
// ✅ CORRECT - Use getState()
const currentValue = useMyStore.getState().value;

// ❌ WRONG - Can only use hooks inside components
const value = useMyStore().value; // Error outside component
```

### 2. Custom Hooks Pattern

**Always check context is defined:**

```typescript
import { useContext } from 'react';
import { MyContext } from '@app/contexts/MyContext';

export const useMyHook = () => {
  const context = useContext(MyContext);

  // ✅ CRITICAL - Always check context exists
  if (context === undefined) {
    throw new Error('useMyHook must be used within a MyProvider');
  }

  return context;
};
```

### 3. MUI Styled Components

**Pattern: Create styled components with theme**

```typescript
import { styled } from '@mui/material/styles';
import Box from '@mui/material/Box';

// ✅ Basic styled component
const StyledBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
}));

// ✅ With custom props (use shouldForwardProp)
const CustomBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>(({ theme, isActive }) => ({
  color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
}));
```

### 4. Error Boundaries

**Use class-based ErrorBoundary for error handling:**

```typescript
import ErrorBoundary from '@app/components/ErrorBoundary';

// Wrap components that may error
<ErrorBoundary name="MyFeature">
  <MyComponent />
</ErrorBoundary>

// Custom fallback UI
<ErrorBoundary
  name="MyFeature"
  fallback={<div>Custom error message</div>}
>
  <MyComponent />
</ErrorBoundary>
```

See: `src/app/src/components/ErrorBoundary.tsx`

### 5. Theme & Dark Mode

**Centralized theme in PageShell:**

- Dark mode state persisted to localStorage
- Theme creation in `createAppTheme()`
- Use `useTheme()` hook to access current theme

```typescript
import { useTheme } from '@mui/material/styles';

const theme = useTheme();
const isDark = theme.palette.mode === 'dark';
```

### 6. Performance Optimization

**Use useMemo/useCallback sparingly (only when needed):**

```typescript
// ✅ Good use case - expensive calculation
const sortedData = useMemo(() => {
  return data.sort((a, b) => /* expensive sort */);
}, [data]);

// ✅ Good use case - prevent child re-renders
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

// ❌ Unnecessary - simple operations
const label = useMemo(() => `User: ${name}`, [name]); // Don't do this
```

**Note:** React 18 is already very performant. Only optimize when profiling shows it's needed.

### 7. Component Patterns

**Controlled components with loading/error states:**

```typescript
const [data, setData] = useState<Data | null>(null);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const fetchData = async () => {
  setIsLoading(true);
  setError(null);
  try {
    const response = await callApi('/endpoint');
    setData(response);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setIsLoading(false);
  }
};
```

**MUI component composition:**

```typescript
// ✅ Use sx prop for inline styles
<Box sx={{ p: 2, bgcolor: 'background.paper' }}>
  <Typography variant="h6">Title</Typography>
</Box>

// ✅ Compose MUI components
<Button
  variant="contained"
  startIcon={<SaveIcon />}
  onClick={handleSave}
  disabled={isLoading}
>
  {isLoading ? <CircularProgress size={24} /> : 'Save'}
</Button>
```

### 8. Utility Patterns

**Create reusable utility functions:**

```typescript
// src/app/src/utils/date.ts
export function formatDate(value: string | number | Date): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
```

**Always handle errors gracefully, return safe defaults**

### 9. TypeScript Best Practices

**Strict interfaces for all props:**

```typescript
interface MyComponentProps {
  title: string;
  onSave: (data: Data) => Promise<void>;
  isLoading?: boolean; // Optional props use ?
  children?: React.ReactNode;
}

export const MyComponent = ({
  title,
  onSave,
  isLoading = false, // Default values
  children,
}: MyComponentProps) => {
  // ...
};
```

## Anti-Patterns to Avoid

### ❌ Using fetch() instead of callApi()

```typescript
// ❌ NEVER DO THIS
const response = await fetch('/api/endpoint');

// ✅ ALWAYS DO THIS
const response = await callApi('/endpoint');
```

### ❌ Context without error checking

```typescript
// ❌ Will fail silently
export const useMyHook = () => {
  return useContext(MyContext);
};

// ✅ Throws clear error
export const useMyHook = () => {
  const context = useContext(MyContext);
  if (context === undefined) {
    throw new Error('useMyHook must be used within a MyProvider');
  }
  return context;
};
```

### ❌ Using Jest in Vitest tests

```typescript
// ❌ WRONG - This is for main codebase
import { describe, it, expect } from '@jest/globals';

// ✅ CORRECT - For frontend tests
import { describe, it, expect, vi } from 'vitest';
```

### ❌ Missing displayName on React.memo components

```typescript
// ❌ Bad for debugging
const MyComponent = React.memo(() => <div>Content</div>);

// ✅ Good for debugging
const MyComponent = React.memo(() => <div>Content</div>);
MyComponent.displayName = 'MyComponent';
```

### ❌ Over-optimization

```typescript
// ❌ Unnecessary memoization
const value = useMemo(() => prop1 + prop2, [prop1, prop2]);

// ✅ Just calculate directly
const value = prop1 + prop2;
```

## DRY Principles

**Look for existing patterns before creating new ones:**

1. **Check existing components** - `src/app/src/components/` for reusable UI
2. **Check existing hooks** - `src/app/src/hooks/` for common logic
3. **Check existing utils** - `src/app/src/utils/` for helper functions
4. **Check existing stores** - `src/app/src/stores/` for state management

**Common reusable utilities:**

- `callApi()` - All API calls
- `useToast()` - Toast notifications
- `ErrorBoundary` - Error handling
- Date formatting utilities in `utils/date.ts`

## Path Alias

`@app/*` maps to `src/*` (configured in `vite.config.ts`).

## When Working Here

- Remember: Use `callApi()` not `fetch()`
- This is a separate workspace (separate package.json)
- Uses Vitest, not Jest
- Build output: `src/app/dist/`
