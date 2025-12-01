# Frontend Application

React-based web UI using Vite + TypeScript + MUI. Separate workspace from main codebase.

## CRITICAL: Use callApi()

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';
const data = await callApi('/traces/evaluation/123');
```

This handles API base URL differences between dev and production.

## Tech Stack

- **React 19** + TypeScript + Vite
- **MUI v7** (Material-UI) for components
- **Vitest** for testing
- Zustand for state management
- React Router v7

## Modern React 19 Patterns

Use modern React 19 patterns throughout:

- **`use()` hook** for reading promises and context
- **Actions** with `useActionState` and `useFormStatus` for form handling
- **`useOptimistic`** for optimistic UI updates
- **Refs as props** - no need for `forwardRef` in most cases
- **Async transitions** with `useTransition` for non-blocking updates

Avoid legacy patterns like class components, legacy context, or string refs.

## MUI v7 Guidelines

- Use the latest MUI v7 component APIs and styling patterns
- Prefer `sx` prop for one-off styles, `styled()` for reusable styled components
- Use theme tokens (`theme.palette`, `theme.spacing`) over hardcoded values
- Check `src/app/src/components/` for existing patterns before creating new ones

## Directory Structure

```
src/app/src/
├── components/    # Reusable UI components
├── pages/         # Route pages
├── hooks/         # Custom React hooks
├── store/         # Zustand stores
└── utils/         # Including api.ts
```

## Development

```bash
npm run dev:app    # From root, runs on localhost:5173
```

## Testing with Vitest

```bash
npm run test       # From src/app/
npm run test:app   # From project root
```

See `src/app/src/hooks/usePageMeta.test.ts` for patterns. Use `vi.fn()` for mocks, `vi.mock()` for modules.

## Key Patterns

- **Zustand stores**: See `src/app/src/store/` for patterns
- **Custom hooks**: See `src/app/src/hooks/` for patterns
- **MUI styling**: Use `styled()` from `@mui/material/styles`
- **Icons**: Use `@mui/icons-material`

## Design Principles

- Small, composable components with single responsibility
- Reuse existing components before creating new ones
- Prefer composition over prop drilling
- Check `components/`, `hooks/`, `utils/` for existing patterns

## Anti-Patterns

- Using `fetch()` instead of `callApi()`
- Legacy React patterns (class components, legacy lifecycle methods)
- Over-memoization of simple values
- Hardcoded colors/spacing instead of theme tokens

## Path Alias

`@app/*` maps to `src/*` (configured in vite.config.ts).
