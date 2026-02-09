# UI Guidelines

Rules for writing React components in the Promptfoo frontend.

## 1. Typography: Semantic HTML with Tailwind

Never use raw text or inline styles. Use semantic HTML elements with consistent Tailwind typography classes.

```tsx
// ✅ Good - semantic HTML with Tailwind
<h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
<h2 className="text-lg font-semibold">Section Title</h2>
<p className="text-sm text-muted-foreground">Description text</p>
<span className="text-xs font-medium uppercase tracking-wide">Label</span>

// ❌ Bad - unstyled or inconsistent
<div>Page Title</div>
<span style={{ fontSize: '14px' }}>Description</span>
<p>Some text</p>
```

**Typography scale:**

| Use Case        | Classes                                       |
| --------------- | --------------------------------------------- |
| Page title      | `text-2xl font-bold tracking-tight`           |
| Section title   | `text-lg font-semibold`                       |
| Card title      | `text-base font-medium`                       |
| Body text       | `text-sm`                                     |
| Muted/secondary | `text-sm text-muted-foreground`               |
| Labels/caps     | `text-xs font-medium uppercase tracking-wide` |

---

## 2. Components: Small, Composable Primitives

Build complex UI by composing small primitives from `components/ui/`. Each component should do one thing well.

```tsx
// ✅ Good - compose primitives
function ConfirmDeleteDialog({ onConfirm, itemName }) {
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {itemName}?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ❌ Bad - monolithic component with many props
function ConfirmDeleteDialog({
  onConfirm,
  onCancel,
  itemName,
  showIcon,
  iconColor,
  cancelText,
  confirmText,
  confirmVariant,
  size,
  centered,
  // ...
}) {
  // Too many props, hard to maintain
}
```

**Rule:** If a component has more than 5-6 props, consider breaking it into composed primitives.

---

## 3. Icons: Light, Purposeful, Never Decorative

Use icons sparingly and only when they add meaning. Prefer text labels over icon-only buttons.

```tsx
// ✅ Good - icons add meaning to actions
<Button variant="outline" size="sm">
  <Download className="size-4 mr-2" />
  Export
</Button>

// ✅ Good - status indicator with icon
<div className="flex items-center gap-2">
  <CheckCircle className="size-4 text-emerald-600" />
  <span className="text-sm">Passed</span>
</div>

// ❌ Bad - decorative icons that add no meaning
<Card>
  <Sparkles className="size-5" /> {/* Why? */}
  <h3>Settings</h3>
  <Star className="size-4" /> {/* Decorative noise */}
</Card>

// ❌ Bad - icon-only buttons without labels (accessibility issue)
<Button size="icon"><Settings /></Button>  // What does this do?

// ✅ Better - icon with aria-label
<Button size="icon" aria-label="Settings">
  <Settings className="size-4" />
</Button>
```

**Icon sizing:** Use `size-4` for inline/buttons, `size-5` for emphasis, `size-8` or larger only for empty states.

---

## 4. Data Fetching: Separate from Presentation

Presentational components receive data as props. Data fetching happens in container components, hooks, or route loaders.

```tsx
// ✅ Good - presentational component (pure, testable)
interface EvalListProps {
  evals: Eval[];
  onSelect: (id: string) => void;
  isLoading: boolean;
}

function EvalList({ evals, onSelect, isLoading }: EvalListProps) {
  if (isLoading) return <Skeleton />;
  return (
    <ul>
      {evals.map(eval => (
        <EvalListItem key={eval.id} eval={eval} onSelect={onSelect} />
      ))}
    </ul>
  );
}

// ✅ Good - container handles data fetching
function EvalListContainer() {
  const { data: evals, isLoading } = useEvals();
  const navigate = useNavigate();

  return (
    <EvalList
      evals={evals ?? []}
      isLoading={isLoading}
      onSelect={(id) => navigate(`/eval/${id}`)}
    />
  );
}

// ❌ Bad - fetching inside presentational component
function EvalList() {
  const [evals, setEvals] = useState([]);

  useEffect(() => {
    callApi('/evals').then(setEvals);  // Mixing concerns
  }, []);

  return <ul>{evals.map(...)}</ul>;
}
```

---

## 5. React 19: Use Modern Patterns

Leverage React 19 features for cleaner, more performant code.

### `use()` for reading promises and context

```tsx
// ✅ Good - use() for async data in components
function EvalDetails({ evalPromise }: { evalPromise: Promise<Eval> }) {
  const eval = use(evalPromise); // Suspends until resolved
  return <div>{eval.name}</div>;
}

// ✅ Good - use() for context (cleaner than useContext)
function ThemedButton() {
  const theme = use(ThemeContext);
  return <Button className={theme.buttonClass}>Click</Button>;
}
```

### `useActionState` for form submissions

```tsx
// ✅ Good - useActionState for forms
function CreateEvalForm() {
  const [state, submitAction, isPending] = useActionState(
    async (prevState, formData: FormData) => {
      const result = await createEval(formData);
      return result.error ? { error: result.error } : { success: true };
    },
    { error: null },
  );

  return (
    <form action={submitAction}>
      <Input name="name" />
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </Button>
    </form>
  );
}

// ❌ Bad - manual state management for forms
function CreateEvalForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await createEval(new FormData(e.target));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  // ...
}
```

### `useOptimistic` for instant feedback

```tsx
// ✅ Good - optimistic updates
function TodoList({ todos, onToggle }) {
  const [optimisticTodos, setOptimisticTodo] = useOptimistic(todos, (state, updatedTodo) =>
    state.map((t) => (t.id === updatedTodo.id ? updatedTodo : t)),
  );

  const handleToggle = async (todo) => {
    setOptimisticTodo({ ...todo, completed: !todo.completed });
    await onToggle(todo.id); // Server update
  };

  return optimisticTodos.map((todo) => (
    <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
  ));
}
```

### `useTransition` for non-blocking updates

```tsx
// ✅ Good - transitions for expensive updates
function SearchableList({ items }) {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e) => {
    const value = e.target.value;
    setQuery(value); // Urgent: update input immediately
    startTransition(() => {
      setFilteredItems(filterItems(items, value)); // Non-urgent: can be interrupted
    });
  };

  return (
    <>
      <Input value={query} onChange={handleSearch} />
      {isPending && <Spinner className="size-4" />}
      <List items={filteredItems} />
    </>
  );
}
```

### Refs as props (no forwardRef needed)

```tsx
// ✅ Good - React 19: ref is just a prop
function CustomInput({ ref, ...props }) {
  return <input ref={ref} {...props} className="..." />;
}

// Usage
<CustomInput ref={inputRef} />;

// ❌ Outdated - forwardRef wrapper
const CustomInput = forwardRef((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

---

## 6. Borders: Subtle, Never Harsh

Use `border-border` (CSS variable) for standard borders. Never use pure black or overly thick borders.

```tsx
// ✅ Good - subtle borders
<Card className="border border-border" />
<div className="border-b border-border" />
<div className="rounded-lg shadow-sm" />  // Shadow instead of border
<div className="ring-1 ring-black/5 dark:ring-white/10" />  // Very subtle

// ✅ Good - semantic borders with opacity in dark mode
<div className="border border-red-200 dark:border-red-800/50" />

// ❌ Bad - harsh borders
<div className="border border-black" />
<div className="border-2 border-gray-900" />
```

---

## 7. Dark Mode: Use Opacity, Not Solid Colors

In dark mode, use opacity modifiers for backgrounds to maintain subtlety.

```tsx
// ✅ Good - opacity for dark mode backgrounds
className = 'bg-red-50 dark:bg-red-950/30';
className = 'bg-muted/50 dark:bg-muted/20';

// ❌ Bad - solid dark backgrounds (too harsh)
className = 'bg-red-50 dark:bg-red-900';
```

---

## 8. Semantic Color System: Consistent Severity Styling

Use a consistent pattern for severity/status colors across bg, border, text, and icons.

```tsx
const severityClasses = {
  critical: {
    container: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  success: {
    container: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  info: {
    container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
};
```

---

## 9. Layout: Use PageContainer and Standard Patterns

Use established layout components for consistent page structure.

```tsx
// ✅ Good - consistent page structure
import { PageContainer, PageHeader } from '@app/components/layout';

function MyPage() {
  return (
    <PageContainer>
      <PageHeader>
        <div className="container max-w-7xl mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
          <p className="text-muted-foreground mt-1">Description</p>
        </div>
      </PageHeader>

      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-white dark:bg-zinc-900">{/* Content */}</Card>
      </div>
    </PageContainer>
  );
}

// ❌ Bad - inconsistent one-off layout
function MyPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Page Title</h1>
      <div>{/* Content */}</div>
    </div>
  );
}
```

## 10. DataTable: Cell Content and Truncation

When rendering content in DataTable cells, ensure content can shrink gracefully when columns are resized.

```tsx
// ✅ Good - Badge with truncate prop for table cells
cell: ({ row }) => {
  const status = row.getValue('status') as string;
  return (
    <Badge variant="success" truncate>
      {status}
    </Badge>
  );
};

// ❌ Bad - Badge without truncate (overflows when column shrinks)
cell: ({ row }) => {
  const status = row.getValue('status') as string;
  return <Badge variant="success">{status}</Badge>;
};
```

**Rules for table cell content:**

- Always use `truncate` prop on Badge components in table cells
- For text content, use `truncate` class or `text-ellipsis overflow-hidden`
- Ensure flex containers have `min-w-0` to allow shrinking

---

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

## Anti-Patterns - DO NOT DO ANY OF THE FOLLOWING

**General:**

- Using `fetch()` instead of `callApi()`
- Hardcoded route strings (use constants from `@app/constants/routes`)
- Legacy React patterns (class components, legacy lifecycle methods)
- Over-memoization of simple values
- Using `useCallback` for computed values (use `useMemo` instead)

## Path Alias

- `@app/*` maps to `src/*` (configured in vite.config.ts)
- `@/components/ui/*` - Radix primitives
