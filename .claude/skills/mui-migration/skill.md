---
name: mui-migration
description: Migrate MUI components to Radix UI + Tailwind. Use when converting MUI components, replacing @mui imports, or when user asks about MUI to Radix migration.
---

# MUI to Radix UI Migration

**Read the full migration plan:** `@src/app/MIGRATION.md`

## Quick Reference

### Component Mapping

| MUI                | Radix/New                       |
| ------------------ | ------------------------------- |
| `Button`           | `@app/components/ui/button`     |
| `IconButton`       | Button with `variant="ghost"`   |
| `TextField`        | `@app/components/ui/input`      |
| `Select`           | `@app/components/ui/select`     |
| `Dialog`           | `@app/components/ui/dialog`     |
| `Drawer`           | `@app/components/ui/sheet`      |
| `Menu`             | `@app/components/ui/dropdown-menu` |
| `Tooltip`          | `@app/components/ui/tooltip`    |
| `Tabs`             | `@app/components/ui/tabs`       |
| `Accordion`        | `@app/components/ui/accordion`  |
| `Switch`           | `@app/components/ui/switch`     |
| `Checkbox`         | `@app/components/ui/checkbox`   |
| `Alert`            | `@app/components/ui/alert`      |
| `Badge/Chip`       | `@app/components/ui/badge`      |
| `CircularProgress` | `@app/components/ui/spinner`    |
| `Box/Stack`        | Tailwind flex/grid classes      |
| `Typography`       | Semantic HTML + Tailwind        |
| `styled()`         | Tailwind classes + `cn()`       |

### Icon Mapping

Replace `@mui/icons-material` with `lucide-react`:

```tsx
// Before
import { Close, Check, ExpandMore } from '@mui/icons-material';

// After
import { X, Check, ChevronDown } from 'lucide-react';
```

### Import Pattern

```tsx
// New components
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@app/components/ui/dialog';
import { cn } from '@app/lib/utils';

// Icons
import { Check, X, ChevronDown } from 'lucide-react';
```

### Styling Migration

```tsx
// Before: MUI sx prop
<Box sx={{ display: 'flex', gap: 2, p: 3 }}>

// After: Tailwind
<div className="flex gap-2 p-3">

// Before: styled()
const StyledPaper = styled(Paper)({ padding: 16, borderRadius: 8 });

// After: Tailwind + cn()
<div className={cn("p-4 rounded-lg", isActive && "bg-primary")}>
```

### Typography Migration

```tsx
// Before
<Typography variant="h6">Title</Typography>
<Typography variant="body2" color="text.secondary">Description</Typography>

// After
<h3 className="text-lg font-semibold">Title</h3>
<p className="text-sm text-muted-foreground">Description</p>
```

## Migration Workflow

1. **Read imports** - Identify all MUI components used
2. **Check ui/ directory** - Verify Radix equivalent exists
3. **Replace imports** - Update to new components
4. **Convert props** - Remove MUI-specific props (variant, color, sx)
5. **Apply Tailwind** - Replace sx/styled with className
6. **Update icons** - Swap MUI icons for Lucide
7. **Test dark mode** - Verify `dark:` classes work

## Key Rules

- **Never mix** MUI and Radix in the same component
- **Use `cn()`** for conditional classes
- **Use CSS variables** via Tailwind (`text-primary`, `bg-background`)
- **No harsh borders** - use `border-border`, never `border-black`
- **Dark mode opacity** - use `dark:bg-red-950/30` not `dark:bg-red-900`

## Reference Files

- Full migration plan: `src/app/MIGRATION.md`
- UI components: `src/app/src/components/ui/`
- Design guidelines: `src/app/UI_GUIDELINES.md`
- Frontend docs: `src/app/AGENTS.md`
