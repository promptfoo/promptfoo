# MUI to shadcn/Radix UI Migration Plan

This document outlines an incremental migration strategy from MUI to a design-system-driven approach using shadcn/ui, Radix UI primitives, and Tailwind CSS.

## Goals

1. **Design System First**: Build a composable, well-factored component library
2. **Incremental Migration**: Coexist with MUI during transition
3. **Performance**: Reduce bundle size with tree-shakeable primitives
4. **Maintainability**: Smaller, single-purpose components over monolithic ones
5. **Consistency**: Unified design tokens and patterns

## Current State Analysis

### MUI Usage Summary

| Category | Count | Notes |
|----------|-------|-------|
| Files using MUI | 236 | Core components throughout |
| Unique MUI components | 60+ | Box, Button, Typography, etc. |
| Icons from @mui/icons-material | 110+ | Pervasive icon usage |
| Styled components | 20+ files | styled() from @mui/material |
| CSS files | 17 | Mixed styling approach |
| Theme customizations | 200+ lines | Custom severity palette, dark mode |

### Complexity Hotspots

1. **PageShell.tsx** (375 lines) - Theme provider, dark mode
2. **Navigation.tsx** (530 lines) - Dropdowns, poppers, complex menus
3. **ResultsTable.css** (682 lines) - Complex table styling
4. **@mui/x-data-grid** - Advanced data grids with filtering/sorting
5. **Form components** - TextField, Select, Autocomplete patterns

---

## Phase 0: Foundation Setup

**Goal**: Set up the new stack alongside MUI without breaking anything.

### Tasks

- [ ] Install Tailwind CSS and configure with Vite
- [ ] Install shadcn/ui CLI and initialize
- [ ] Install Radix UI primitives
- [ ] Set up CSS variables for design tokens
- [ ] Configure path aliases for new component library
- [ ] Create `src/app/src/components/ui/` directory structure

### Design Tokens

Create `/src/app/src/styles/tokens.css`:

```css
:root {
  /* Colors */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;

  /* Severity (custom - preserve current behavior) */
  --severity-critical: 0 84% 60%;
  --severity-high: 0 72% 51%;
  --severity-medium: 25 95% 53%;
  --severity-low: 142 76% 36%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode values */
}
```

### Directory Structure

```
src/app/src/
├── components/
│   ├── ui/                    # New shadcn/Radix components
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   └── ...
│   ├── legacy/                # MUI components (migrate gradually)
│   └── ...                    # Existing components
├── styles/
│   ├── tokens.css             # Design tokens
│   └── globals.css            # Global styles
└── lib/
    └── utils.ts               # cn() utility, etc.
```

---

## Phase 1: Core Primitives

**Goal**: Replace low-level MUI components with Radix/shadcn equivalents.

### Priority Order

1. **Button** - Most common, affects many files
2. **Input/TextField** - Forms are everywhere
3. **Select** - Dropdowns used throughout
4. **Dialog** - Modals are common pattern
5. **Tooltip** - Simple, high usage
6. **Popover** - Used for dropdowns
7. **Switch/Checkbox** - Form controls

### Component Mapping

| MUI Component | Radix/shadcn Equivalent | Notes |
|---------------|------------------------|-------|
| `Button` | `@radix-ui/react-slot` + custom | Use variant system |
| `IconButton` | Button with icon variant | |
| `TextField` | Input + Label + FormMessage | Compose from primitives |
| `Select` | `@radix-ui/react-select` | |
| `Autocomplete` | `cmdk` or custom combobox | Complex - later phase |
| `Dialog` | `@radix-ui/react-dialog` | |
| `Drawer` | `vaul` or custom | |
| `Menu` | `@radix-ui/react-dropdown-menu` | |
| `Tooltip` | `@radix-ui/react-tooltip` | |
| `Popover` | `@radix-ui/react-popover` | |
| `Accordion` | `@radix-ui/react-accordion` | |
| `Tabs` | `@radix-ui/react-tabs` | |
| `Switch` | `@radix-ui/react-switch` | |
| `Checkbox` | `@radix-ui/react-checkbox` | |
| `Radio` | `@radix-ui/react-radio-group` | |
| `Slider` | `@radix-ui/react-slider` | |
| `Progress` | `@radix-ui/react-progress` | |
| `Alert` | Custom with variants | |
| `Badge/Chip` | Badge component | |
| `Avatar` | `@radix-ui/react-avatar` | |

### Tasks

- [ ] Create Button component with variants (default, destructive, outline, secondary, ghost, link)
- [ ] Create Input component with label and error state
- [ ] Create Select component
- [ ] Create Dialog component
- [ ] Create Tooltip component
- [ ] Create cn() utility function
- [ ] Document component API in Storybook or similar

---

## Phase 2: Layout & Typography

**Goal**: Replace MUI layout components and typography system.

### Components to Create

- [ ] **Container** - Max-width wrapper
- [ ] **Stack** - Flexbox helper (or just use Tailwind flex utilities)
- [ ] **Card** - Content container
- [ ] **Separator** - Divider line
- [ ] Typography system via Tailwind classes

### Typography Strategy

Replace MUI Typography variants with Tailwind classes:

```tsx
// Before (MUI)
<Typography variant="h6">Title</Typography>
<Typography variant="body2">Content</Typography>

// After (Tailwind)
<h3 className="text-lg font-semibold">Title</h3>
<p className="text-sm text-muted-foreground">Content</p>
```

### Tasks

- [ ] Define typography scale in Tailwind config
- [ ] Create Card component
- [ ] Create Separator component
- [ ] Document typography patterns

---

## Phase 3: Complex Components

**Goal**: Tackle the harder MUI components with complex state/behavior.

### DataGrid Strategy

The `@mui/x-data-grid` is heavily used. Options:

1. **TanStack Table + custom UI** - Already using TanStack Table in some places
2. **AG Grid** - Commercial alternative
3. **Custom implementation** - Build on TanStack Table with shadcn styling

Recommendation: Build a `DataTable` component using TanStack Table + Radix primitives.

### Navigation Strategy

The Navigation.tsx is complex (530 lines). Strategy:

1. Break into smaller components:
   - `NavLink` - Individual navigation link
   - `NavDropdown` - Dropdown menu
   - `NavBar` - Container
   - `MobileNav` - Mobile drawer
2. Use Radix DropdownMenu for menus
3. Migrate incrementally

### Tasks

- [ ] Create DataTable component wrapper
- [ ] Create NavigationMenu from Radix primitives
- [ ] Create Sheet component (for drawers)
- [ ] Create CommandPalette (cmdk) if needed

---

## Phase 4: Forms

**Goal**: Create a cohesive form component system.

### Form Components

- [ ] Form wrapper with validation (react-hook-form + zod)
- [ ] FormField, FormLabel, FormMessage, FormDescription
- [ ] Textarea
- [ ] Combobox (Autocomplete replacement)
- [ ] DatePicker
- [ ] FileUpload

### Pattern

```tsx
// New form pattern
<Form {...form}>
  <FormField
    control={form.control}
    name="email"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>
```

---

## Phase 5: Icons

**Goal**: Replace @mui/icons-material with a lighter alternative.

### Options

1. **Lucide React** - Popular, tree-shakeable, similar API
2. **Radix Icons** - Minimal set, matches Radix
3. **Heroicons** - From Tailwind team
4. **Phosphor Icons** - Large set, flexible

Recommendation: **Lucide React** - largest coverage, good defaults.

### Migration Strategy

Create an icon mapping file:

```tsx
// src/app/src/components/ui/icons.tsx
export {
  X as CloseIcon,
  Check as CheckIcon,
  ChevronDown as ExpandMoreIcon,
  // ... map all 110+ icons
} from 'lucide-react';
```

### Tasks

- [ ] Audit all icon usage
- [ ] Create icon mapping file
- [ ] Replace imports incrementally
- [ ] Remove @mui/icons-material dependency

---

## Phase 6: Theme & Dark Mode

**Goal**: Migrate theme system to CSS variables + Tailwind.

### Current System

- MUI ThemeProvider with createTheme()
- Custom severity palette
- localStorage dark mode persistence
- useMediaQuery for system preference

### New System

- CSS variables for all colors (Phase 0)
- Tailwind's dark: modifier
- `next-themes` or custom hook for persistence
- Remove Emotion dependency

### Tasks

- [ ] Complete CSS variable setup
- [ ] Create useTheme hook (or use next-themes pattern)
- [ ] Migrate dark mode toggle
- [ ] Remove MUI ThemeProvider
- [ ] Remove Emotion dependencies

---

## Phase 7: Page-by-Page Migration

**Goal**: Migrate each page/feature area systematically.

### Priority Order

1. **Simpler pages first** - Build confidence
2. **High-traffic pages** - Maximum impact
3. **Complex pages last** - After patterns established

### Suggested Order

1. [ ] Settings pages (simpler forms)
2. [ ] Error pages
3. [ ] Dashboard/Home
4. [ ] Eval Creator
5. [ ] Results/Eval view
6. [ ] Redteam Setup
7. [ ] Model Audit

### Per-Page Process

1. List all MUI components used
2. Ensure shadcn equivalents exist
3. Create feature-specific components if needed
4. Migrate and test
5. Remove MUI imports
6. Clean up any leftover styled() calls

---

## Phase 8: Cleanup

**Goal**: Remove all MUI dependencies and legacy code.

### Tasks

- [ ] Remove @mui/material
- [ ] Remove @mui/icons-material
- [ ] Remove @mui/x-data-grid (if replaced)
- [ ] Remove @mui/x-charts (if replaced)
- [ ] Remove @emotion/react
- [ ] Remove @emotion/styled
- [ ] Delete legacy/ directory
- [ ] Clean up unused CSS files
- [ ] Update AGENTS.md
- [ ] Update package.json

---

## Coexistence Strategy

During migration, MUI and shadcn components will coexist. Rules:

1. **New features**: Use shadcn/Radix only
2. **Bug fixes**: Fix in place, don't migrate
3. **Refactors**: Migrate when touching significant code
4. **No mixing**: A component should be fully MUI or fully shadcn

### Import Conventions

```tsx
// Clearly separate imports
// Legacy (to be migrated)
import { Button as MuiButton } from '@mui/material';

// New components
import { Button } from '@/components/ui/button';
```

---

## Success Metrics

- [ ] Bundle size reduced by 30%+
- [ ] No MUI dependencies in package.json
- [ ] All components in ui/ directory are composable primitives
- [ ] Dark mode works via CSS variables only
- [ ] Design tokens documented and consistent

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| DataGrid complexity | Evaluate TanStack Table early; consider keeping @mui/x-data-grid longer |
| Team velocity during migration | Clear phase boundaries; don't block features |
| Visual regression | Screenshot testing with Playwright |
| Icon coverage gaps | Audit icons early; use multiple icon sets if needed |
| Accessibility regression | Radix has strong a11y; test with screen readers |

---

## Timeline Guidance

This is not a time estimate but a dependency map:

```
Phase 0 (Foundation)
    ↓
Phase 1 (Primitives) ←→ Phase 5 (Icons)
    ↓
Phase 2 (Layout) + Phase 4 (Forms)
    ↓
Phase 3 (Complex Components)
    ↓
Phase 6 (Theme Migration)
    ↓
Phase 7 (Page Migration) - iterative
    ↓
Phase 8 (Cleanup)
```

Phases 1, 2, 4, 5 can progress in parallel once foundation is set.

---

## References

- [shadcn/ui](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
- [TanStack Table](https://tanstack.com/table)
- [cmdk](https://cmdk.paco.me/) - Command palette
- [vaul](https://vaul.emilkowal.ski/) - Drawer component
