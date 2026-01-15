# Frontend Application

React-based web UI using Vite + TypeScript. Separate workspace from main codebase.

## CRITICAL: Use callApi()

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';
const data = await callApi('/traces/evaluation/123');
```

This handles API base URL differences between dev and production.

## Tech Stack

**Target Stack:**

- React 19 + TypeScript + Vite
- Promptfoo's Design system + Radix UI primitives
- Tailwind CSS for styling
- Lucide React for icons
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

## Component Guidelines

### Use Radix

```typescript
// New components - use Promptfoo's Design system from components/ui/
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';

// Icons - use Lucide
import { Check, X, ChevronDown } from 'lucide-react';

// Styling - use Tailwind + cn()
import { cn } from '@app/lib/utils';
<Button className={cn('w-full', isActive && 'bg-primary')}>Click</Button>
```

## Directory Structure

```plaintext
src/app/src/
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── ...            # Feature components
├── pages/             # Route pages
├── hooks/             # Custom React hooks
├── store/             # Zustand stores
├── lib/               # Utilities (cn, etc.)
├── styles/            # Global styles, tokens
└── utils/             # Including api.ts
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

- **Zustand stores**: See `src/app/src/store/` for implementation patterns; see `test/AGENTS.md` "Zustand Store Testing" section for testing patterns
- **Custom hooks**: See `src/app/src/hooks/` for patterns
- **New components**: Use `components/ui/` primitives, compose with Tailwind
- **Icons**: Use Lucide React
- **Route constants**: Use `EVAL_ROUTES`, `REDTEAM_ROUTES`, `ROUTES` from `@app/constants/routes`

```tsx
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';

// Navigation
<Link to={EVAL_ROUTES.DETAIL(evalId)}>View Eval</Link>
<Link to={ROUTES.PROMPT_DETAIL(promptId)}>View Prompt</Link>
```

## UI Guidelines

See `UI_GUIDELINES.md` for the 9 rules on writing React components:

1. Typography with semantic HTML
2. Small, composable components
3. Purposeful iconography
4. Data fetching separation
5. React 19 patterns (`use`, `useActionState`, `useOptimistic`, `useTransition`)
6. Subtle borders
7. Dark mode opacity
8. Semantic severity colors
9. Consistent page layouts
