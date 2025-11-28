# Frontend Application

**What this is:** React-based web UI (Vite + TypeScript + MUI). Separate workspace from main codebase.

## CRITICAL: API Calls

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';

// Correct - Handles dev/prod API URLs
const data = await callApi('/traces/evaluation/123');

// Wrong - Will fail in development
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

## Design Principles

- Focus on atomic design, building components with reusability and composability
- Keep components small when possible
- Break out repeated patterns into reusable components
- **Reusability**: Design small, composable parts with clear boundaries and APIs
- **Consistency**: Use design tokens (color, spacing, type) and shared patterns
- **Single responsibility**: Each component does one thing well
- **Composition over inheritance**: Build complex UIs by assembling simpler pieces
- Use icons from @mui/icons-material

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

**Mocking functions:**

```typescript
import { vi } from 'vitest';

// Mock a function
const mockFn = vi.fn();

// Mock a module
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn().mockResolvedValue({ data: 'test' }),
}));
```

## Common Patterns

### Zustand State Management

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyState {
  value: string | null;
  setValue: (value: string) => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      value: null,
      setValue: (value) => set({ value }),
    }),
    { name: 'my-store', skipHydration: true },
  ),
);

// Access state outside components
const currentValue = useMyStore.getState().value;
```

### Custom Hooks Pattern

```typescript
export const useMyHook = () => {
  const context = useContext(MyContext);
  if (context === undefined) {
    throw new Error('useMyHook must be used within a MyProvider');
  }
  return context;
};
```

### MUI Styled Components

```typescript
import { styled } from '@mui/material/styles';
import Box from '@mui/material/Box';

const StyledBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
}));
```

## Anti-Patterns to Avoid

### Using fetch() instead of callApi()

```typescript
// NEVER DO THIS
const response = await fetch('/api/endpoint');

// ALWAYS DO THIS
const response = await callApi('/endpoint');
```

### Using Jest in Vitest tests

```typescript
// WRONG - This is for main codebase
import { describe, it, expect } from '@jest/globals';

// CORRECT - For frontend tests
import { describe, it, expect, vi } from 'vitest';
```

### Over-optimization

```typescript
// Unnecessary memoization
const value = useMemo(() => prop1 + prop2, [prop1, prop2]);

// Just calculate directly
const value = prop1 + prop2;
```

## DRY Principles

Check existing patterns before creating new ones:

1. **Components** - `src/app/src/components/`
2. **Hooks** - `src/app/src/hooks/`
3. **Utils** - `src/app/src/utils/`
4. **Stores** - `src/app/src/stores/`

## Path Alias

`@app/*` maps to `src/*` (configured in `vite.config.ts`).
