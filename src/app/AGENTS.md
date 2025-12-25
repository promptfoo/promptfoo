# Frontend Application

React-based web UI using Vite + TypeScript. Separate workspace from main codebase.

**IMPORTANT: Active Migration** - We are migrating from MUI to shadcn/Radix UI. See `MIGRATION.md` for the full plan.

## CRITICAL: Use callApi()

**NEVER use `fetch()` directly. ALWAYS use `callApi()`:**

```typescript
import { callApi } from '@app/utils/api';
const data = await callApi('/traces/evaluation/123');
```

This handles API base URL differences between dev and production.

## Tech Stack

**Current (in migration):**

- **React 19** + TypeScript + Vite
- **MUI v7** (Material-UI) - legacy, being phased out
- **shadcn/ui + Radix UI** - new component library
- **Tailwind CSS** - styling
- **Vitest** for testing
- Zustand for state management
- React Router v7

**Target Stack:**

- React 19 + TypeScript + Vite
- shadcn/ui + Radix UI primitives
- Tailwind CSS for styling
- Lucide React for icons

## Modern React 19 Patterns

Use modern React 19 patterns throughout:

- **`use()` hook** for reading promises and context
- **Actions** with `useActionState` and `useFormStatus` for form handling
- **`useOptimistic`** for optimistic UI updates
- **Refs as props** - no need for `forwardRef` in most cases
- **Async transitions** with `useTransition` for non-blocking updates

Avoid legacy patterns like class components, legacy context, or string refs.

## Component Guidelines (Migration in Progress)

### For NEW Code: Use shadcn/Radix

```typescript
// New components - use shadcn/ui from components/ui/
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';

// Icons - use Lucide
import { Check, X, ChevronDown } from 'lucide-react';

// Styling - use Tailwind + cn()
import { cn } from '@app/lib/utils';
<Button className={cn('w-full', isActive && 'bg-primary')}>Click</Button>
```

### For EXISTING Code: MUI (Legacy)

When modifying existing MUI components, fix bugs in place. Only migrate when doing significant refactors.

```typescript
// Legacy imports - prefix clearly when mixing
import { Button as MuiButton } from '@mui/material';
```

### Styling Approach

**New code:** Tailwind CSS classes + `cn()` utility

```tsx
<div className="flex items-center gap-2 p-4 rounded-lg border">
  <span className="text-sm text-muted-foreground">Label</span>
</div>
```

**Legacy code:** MUI `sx` prop or `styled()`

```tsx
// Don't add new styled() components - use Tailwind instead
```

### Design Tokens

Use CSS variables via Tailwind:

```tsx
// Colors
className = 'text-primary bg-background border-border';
className = 'text-destructive bg-destructive/10';

// Severity (custom)
className = 'text-severity-critical';
className = 'bg-severity-high/20';

// Spacing - use Tailwind scale
className = 'p-4 gap-2 m-6';
```

## Directory Structure

```plaintext
src/app/src/
├── components/
│   ├── ui/            # NEW: shadcn/Radix primitives
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── legacy/        # MUI components (being migrated)
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

- **Zustand stores**: See `src/app/src/store/` for patterns
- **Custom hooks**: See `src/app/src/hooks/` for patterns
- **New components**: Use `components/ui/` primitives, compose with Tailwind
- **Icons**: Use Lucide React (new) or `@mui/icons-material` (legacy)

## Design Principles

- **Small, composable primitives** - Single responsibility, compose together
- **Design tokens over hardcoded values** - Use CSS variables via Tailwind
- **Reuse before creating** - Check `components/ui/` first
- **Prefer composition** - Build complex UI from simple primitives
- **Accessibility first** - Radix primitives are accessible by default

### Visual Design Rules

**Borders (IMPORTANT):**

- **Never use harsh black borders** - they look dated and jarring
- Use `border-border` for standard borders (soft blue-gray)
- For dark mode, borders should be subtle (use opacity: `dark:border-gray-800/50`)
- Consider `shadow-sm` or `ring-1 ring-black/5` instead of borders for elevation
- Reserve `border-2` for focus/selected states only

```tsx
// Good
className = 'border border-border'; // Soft, uses CSS variable
className = 'rounded-lg shadow-sm'; // Borderless with shadow
className = 'border border-red-200 dark:border-red-900/50'; // Severity with opacity

// Bad
className = 'border border-black'; // Never pure black
className = 'border-2 border-gray-900'; // Too harsh
```

**Colors:**

- Use opacity modifiers in dark mode: `dark:bg-red-950/30` not `dark:bg-red-900`
- Severity colors: red (critical), amber (warning), blue (info), emerald (success)
- Text on colored backgrounds: use `*-700` in light mode, `*-300` in dark mode

### Component Composition Example

```tsx
// Good - compose from primitives
function ConfirmDialog({ title, onConfirm }) {
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>{title}</DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bad - monolithic component with many props
function ConfirmDialog({ title, cancelText, confirmText, variant, size, ... }) {
  // Too many props, hard to maintain
}
```

## React Hooks: useMemo vs useCallback

- **`useMemo`**: Use when computing a value (non-callable result)
- **`useCallback`**: Use when creating a stable function reference

```typescript
// Good - useMemo for computed values
const tooltipMessage = useMemo(() => {
  return apiStatus === 'blocked' ? 'Connection failed' : undefined;
}, [apiStatus]);

// Good - useCallback for functions with arguments
const handleClick = useCallback((id: string) => {
  console.log('Clicked:', id);
}, []);

// Bad - useCallback for computed values
const getTooltipMessage = useCallback(() => {
  return apiStatus === 'blocked' ? 'Connection failed' : undefined;
}, [apiStatus]);
```

## Anti-Patterns

**General:**

- Using `fetch()` instead of `callApi()`
- Legacy React patterns (class components, legacy lifecycle methods)
- Over-memoization of simple values
- Using `useCallback` for computed values (use `useMemo` instead)

**Migration-specific:**

- Adding new MUI components (use shadcn/Radix instead)
- Adding new `styled()` components (use Tailwind instead)
- Hardcoded colors/spacing (use design tokens)
- Mixing MUI and shadcn in the same component
- Creating new monolithic components instead of composing primitives
- Using MUI icons in new code (use Lucide)

## Path Alias

- `@app/*` maps to `src/*` (configured in vite.config.ts)
- `@/components/ui/*` - shadcn/Radix primitives

## Migration Reference

See `MIGRATION.md` for:

- Full migration plan with phases
- Component mapping (MUI → Radix)
- Icon migration strategy
- Design token definitions
- Coexistence rules during migration
