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

## Key Patterns

- **State:** Use Zustand stores in `src/store/`
- **Styling:** MUI's `sx` prop for component styles
- **Forms:** Controlled components with local state
- **Data fetching:** Custom hooks with `callApi()`

## Path Alias

`@app/*` maps to `src/*` (configured in `vite.config.ts`).

## When Working Here

- Remember: Use `callApi()` not `fetch()`
- This is a separate workspace (separate package.json)
- Uses Vitest, not Jest
- Build output: `src/app/dist/`
