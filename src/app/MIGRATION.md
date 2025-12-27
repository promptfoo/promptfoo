# MUI to shadcn/Radix UI Migration Plan

This document outlines an incremental migration strategy from MUI to a design-system-driven approach using Promptfoo's Design system, Radix UI primitives, and Tailwind CSS.

## Goals

1. **Design System First**: Build a composable, well-factored component library
2. **Incremental Migration**: Coexist with MUI during transition
3. **Performance**: Reduce bundle size with tree-shakeable primitives
4. **Maintainability**: Smaller, single-purpose components over monolithic ones
5. **Consistency**: Unified design tokens and patterns

## Current State Analysis

### MUI Usage Summary

| Category                       | Count      | Notes                              |
| ------------------------------ | ---------- | ---------------------------------- |
| Files using MUI                | 236        | Core components throughout         |
| Unique MUI components          | 60+        | Box, Button, Typography, etc.      |
| Icons from @mui/icons-material | 110+       | Pervasive icon usage               |
| Styled components              | 20+ files  | styled() from @mui/material        |
| CSS files                      | 17         | Mixed styling approach             |
| Theme customizations           | 200+ lines | Custom severity palette, dark mode |

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

```plaintext
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

| MUI Component  | Radix/shadcn Equivalent         | Notes                   |
| -------------- | ------------------------------- | ----------------------- |
| `Button`       | `@radix-ui/react-slot` + custom | Use variant system      |
| `IconButton`   | Button with icon variant        |                         |
| `TextField`    | Input + Label + FormMessage     | Compose from primitives |
| `Select`       | `@radix-ui/react-select`        |                         |
| `Autocomplete` | `cmdk` or custom combobox       | Complex - later phase   |
| `Dialog`       | `@radix-ui/react-dialog`        |                         |
| `Drawer`       | `vaul` or custom                |                         |
| `Menu`         | `@radix-ui/react-dropdown-menu` |                         |
| `Tooltip`      | `@radix-ui/react-tooltip`       |                         |
| `Popover`      | `@radix-ui/react-popover`       |                         |
| `Accordion`    | `@radix-ui/react-accordion`     |                         |
| `Tabs`         | `@radix-ui/react-tabs`          |                         |
| `Switch`       | `@radix-ui/react-switch`        |                         |
| `Checkbox`     | `@radix-ui/react-checkbox`      |                         |
| `Radio`        | `@radix-ui/react-radio-group`   |                         |
| `Slider`       | `@radix-ui/react-slider`        |                         |
| `Progress`     | `@radix-ui/react-progress`      |                         |
| `Alert`        | Custom with variants            |                         |
| `Badge/Chip`   | Badge component                 |                         |
| `Avatar`       | `@radix-ui/react-avatar`        |                         |

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

~~The `@mui/x-data-grid` is heavily used.~~ **✅ MIGRATION COMPLETE**

A `DataTable` component was built using TanStack Table + Radix primitives. All DataGrid usages have been migrated to the new DataTable component:

- RedteamReportTable
- CustomPoliciesSection
- TestSuites
- CustomMetricsDialog
- Other data grid instances

The `@mui/x-data-grid` dependency has been removed from package.json.

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
- [x] Remove @mui/x-data-grid (replaced with DataTable)
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

## Design Patterns & Lessons Learned

Patterns discovered during the Model Audit migration that should guide future work.

### Page Background Hierarchy

Use a three-tier background system to create clear visual hierarchy across the application:

```tsx
// Layer 1: Page background (base layer - most subtle)
<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
  // Layer 2: Section headers (elevated layer)
  <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
    <div className="container max-w-7xl mx-auto px-4 py-10">{/* Header content */}</div>
  </div>
  // Layer 3: Content cards (most elevated)
  <div className="container max-w-7xl mx-auto px-4 py-8">
    <Card className="bg-white dark:bg-zinc-900 shadow-sm">{/* Card content */}</Card>
  </div>
</div>
```

**Rationale:**

- **Avoid pure white/black**: `zinc-50/950` provides subtle warmth and reduces eye strain
- **Semi-transparent headers**: `/80` opacity creates modern elevated feel
- **Backdrop blur**: Adds depth and polish to headers
- **Solid cards**: Full opacity on cards for clear content hierarchy

**Reusable Components:**

Use the pre-built layout components for consistency:

```tsx
import { PageContainer, PageHeader } from '@app/components/layout';

// Basic usage
<PageContainer>
  <PageHeader>
    <div className="container max-w-7xl mx-auto px-4 py-10">
      <h1>Page Title</h1>
    </div>
  </PageHeader>
  <div className="container mx-auto px-4 py-8">
    <Card className="bg-white dark:bg-zinc-900">
      {/* Content */}
    </Card>
  </div>
</PageContainer>

// Status-aware header (for results pages)
<PageHeader variant={hasErrors ? 'error' : 'success'}>
  {/* Header content */}
</PageHeader>
```

**See also:** ModelAuditHistory.tsx, ModelAuditResult.tsx for reference implementations.

### Severity Color System

Use a consistent color scheme across background, border, text, and icons for each severity level:

```tsx
const severityStyles = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
};
```

### Interactive States

Add hover, focus, and selection states for clickable elements:

```tsx
// Clickable card with selection state
<div
  className={cn(
    'rounded-xl border p-4 cursor-pointer transition-all',
    'hover:border-primary/50 hover:shadow-sm',
    isSelected && 'ring-2 ring-primary border-primary',
  )}
/>

// Button-like interactive element
<button
  className={cn(
    'flex items-center gap-2 px-3 py-2 rounded-lg',
    'hover:bg-muted/50 transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  )}
/>
```

### Dark Mode Patterns

Use opacity modifiers for dark mode backgrounds instead of solid colors:

```tsx
// Good - subtle dark backgrounds with opacity
className = 'bg-red-50 dark:bg-red-950/30';
className = 'bg-muted/50 dark:bg-muted/20';

// Avoid - harsh solid dark backgrounds
className = 'bg-red-50 dark:bg-red-900';
```

### Border Styling (IMPORTANT)

**Never use harsh black borders.** Borders should be subtle and blend with the design.

```tsx
// Good - subtle borders that blend
className = 'border border-border'; // Uses CSS variable (soft gray/blue tint)
className = 'border border-muted'; // Even softer
className = 'border-red-200 dark:border-red-900/50'; // Severity with opacity

// Good - borderless with shadow for elevation
className = 'shadow-sm'; // Subtle elevation instead of border
className = 'ring-1 ring-black/5 dark:ring-white/10'; // Very subtle ring

// Avoid - harsh borders
className = 'border border-black'; // Never use pure black
className = 'border border-gray-900'; // Too dark
className = 'border-2'; // Too thick for content containers
```

**Border principles:**

- Use `border-border` for standard borders (it's a soft blue-gray, not black)
- In dark mode, borders should be barely visible (15-25% lightness)
- For colored borders (severity), use lighter shades with opacity: `border-red-200 dark:border-red-800/50`
- Consider using `ring-1 ring-black/5` instead of borders for subtle definition
- Reserve `border-2` only for focus states or selected items, not for containers

### Collapsible Content Groups

Group related items with collapsible sections for better information density:

```tsx
<Collapsible open={isExpanded} onOpenChange={onToggle}>
  {/* Header - always visible */}
  <div className="p-4 border-b bg-muted/50">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold">{title}</h3>
      <Badge variant="warning">{count} items</Badge>
    </div>
  </div>

  {/* Toggle button */}
  <CollapsibleTrigger asChild>
    <button className="w-full p-3 text-sm text-muted-foreground hover:bg-muted/50">
      {isExpanded ? <ChevronUp /> : <ChevronDown />}
      {isExpanded ? 'Hide' : 'Show'} details
    </button>
  </CollapsibleTrigger>

  {/* Expandable content */}
  <CollapsibleContent>
    <div className="p-4 space-y-3">{children}</div>
  </CollapsibleContent>
</Collapsible>
```

### Card-Based Layouts

Use cards to create visual hierarchy and group related content:

```tsx
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-lg">Section Title</CardTitle>
    <CardDescription>Optional description text</CardDescription>
  </CardHeader>
  <Separator />
  <CardContent className="pt-4">{/* Content here */}</CardContent>
</Card>
```

### Icon Mapping Strategy

Create a centralized icon mapping file for easy migration and consistent naming:

```tsx
// components/ui/icons.tsx
export {
  CheckCircle as CheckCircleIcon,
  XCircle as ErrorIcon,
  AlertTriangle as WarningIcon,
  Info as InfoIcon,
  ChevronDown as ExpandMoreIcon,
  ChevronUp as ExpandLessIcon,
  // Map MUI names to Lucide equivalents
} from 'lucide-react';
```

This allows gradual migration without changing imports in feature files.

### Badge Variants

Define semantic badge variants for consistent status display:

```tsx
// badge.tsx variants
const badgeVariants = cva('...base styles...', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      destructive: 'bg-destructive text-destructive-foreground',
      outline: 'border border-input bg-background',
      // Semantic variants
      critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
  },
});
```

### Empty States

Design informative empty states with icons and helpful messages:

```tsx
<div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
  <CheckCircleIcon className="h-16 w-16 text-emerald-600 dark:text-emerald-400 mb-4" />
  <h3 className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">No issues found</h3>
  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">Everything looks good!</p>
</div>
```

### Composition Over Props

Build complex UI by composing simple primitives rather than adding props:

```tsx
// Good - compose primitives
function FileIssueGroup({ file, issues }) {
  return (
    <Collapsible>
      <FileHeader file={file} issueCount={issues.length} />
      <CollapsibleContent>
        {issues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Avoid - monolithic component with many props
function FileIssueGroup({
  file,
  issues,
  showHeader,
  headerVariant,
  issueCardSize,
  collapsible,
  defaultExpanded,
  // ... many more props
}) { ... }
```

### Tailwind v4 Dark Mode Configuration

Tailwind v4 requires explicit dark mode configuration when using a custom attribute like `data-theme`:

```css
/* index.css - Configure dark mode to use data-theme attribute */
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

This tells Tailwind that `dark:` classes should activate when `data-theme='dark'` is present on any ancestor element.

### Portal Components and CSS Variables

Radix UI components like `Select`, `Popover`, and `Dialog` use React Portals to render content at the document root. This can break CSS variable inheritance because the portaled content is outside the themed container.

```tsx
// Problem: CSS variables defined on a parent container won't reach portaled content
<div data-theme="dark">
  <Select>
    <SelectContent /> {/* Portaled to document.body - loses dark theme! */}
  </Select>
</div>

// Solution 1: Apply theme to :root
:root[data-theme='dark'],
[data-theme='dark'] {
  --background: 222.2 84% 4.9%;
  /* ... */
}

// Solution 2: Use explicit colors instead of CSS variables in portaled components
<SelectContent className="bg-white dark:bg-zinc-900" />
```

### Z-Index Scale for Portaled Components (CRITICAL)

Radix UI components use portals to render at the document root. **All portaled components must use a consistent z-index scale** to ensure proper stacking, especially when components are nested (e.g., a Select inside a Dialog).

#### The Problem

When a Dialog renders at z-index 1400 and a Select inside it renders at z-index 50, the Select dropdown appears **behind** the Dialog overlay because both are portaled to `<body>` and only z-index determines stacking.

#### The Solution: Semantic Z-Index Tokens

We define z-index values as CSS custom properties in `index.css`:

```css
:root {
  /* Z-index scale for layered components
   * Modal < Dropdown ensures nested dropdowns appear above modals
   * Values >= 1300 for MUI compatibility during migration */
  --z-modal-backdrop: 1300;
  --z-modal: 1310;
  --z-dropdown: 1400;
  --z-tooltip: 1500;
}
```

#### Usage in Components

Use the `z-[var(--z-*)]` syntax in Tailwind classes:

```tsx
// dialog.tsx
<DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/50 ..." />
<DialogPrimitive.Content className="fixed ... z-[var(--z-modal)] ..." />

// popover.tsx, select.tsx, dropdown-menu.tsx
<Content className="z-[var(--z-dropdown)] ..." />

// tooltip.tsx
<Content className="z-[var(--z-tooltip)] ..." />
```

#### Z-Index Stacking Order

| Layer          | CSS Variable         | Value | Components                    |
| -------------- | -------------------- | ----- | ----------------------------- |
| Modal Backdrop | `--z-modal-backdrop` | 1300  | Dialog overlay                |
| Modal Content  | `--z-modal`          | 1310  | Dialog content                |
| Dropdowns      | `--z-dropdown`       | 1400  | Select, Popover, DropdownMenu |
| Tooltips       | `--z-tooltip`        | 1500  | Tooltip                       |

**Key insight**: Dropdowns (1400) are **above** modals (1310) so that dropdowns inside modals work correctly.

#### Why These Values?

- **>= 1300**: MUI modals use z-index 1300, so our components stack correctly during migration
- **Modal < Dropdown**: Nested dropdowns must appear above parent modals
- **Tooltip highest**: Tooltips should always be visible, even over dropdowns

#### Anti-Patterns

```tsx
// BAD: Inline z-index styles
<DialogContent style={{ zIndex: 1400 }} />  // Hard to maintain, breaks the system

// BAD: Arbitrary magic numbers
<PopoverContent className="z-[9999]" />  // Creates z-index arms race

// BAD: Using default Tailwind z-scale for portaled components
<SelectContent className="z-50" />  // Will be hidden behind modals at z-1300+

// GOOD: Use semantic tokens
<SelectContent className="z-[var(--z-dropdown)]" />
```

#### Adding New Layers

If you need a new z-index layer:

1. Add the CSS variable to `:root` in `index.css`
2. Choose a value that fits the stacking hierarchy
3. Document it in this table
4. Use `z-[var(--z-your-layer)]` in components

### Global CSS Specificity with :where()

Use `:where()` selectors for global styles to keep specificity low and allow component classes to override:

```css
/* Global link styles that won't override component styling */
a:where(:not([class*='text-']):not(.no-underline)) {
  color: var(--link-color);
  text-decoration: none;
}

a:where(:not([class*='text-']):not(.no-underline)):hover {
  text-decoration: underline;
}
```

The `:where()` selector has zero specificity, so any class-based styling will override it.

### Button-as-Link Styling

When buttons are rendered as anchor tags (via `asChild` with `RouterLink`), global anchor styles can leak through. Prevent this in the button component:

```tsx
// button.tsx - Add no-underline to base styles
const buttonVariants = cva(
  'inline-flex items-center justify-center ... no-underline hover:no-underline',
  {
    variants: {
      variant: {
        // Add explicit text colors to override anchor color inheritance
        outline: 'border border-input bg-background text-foreground ...',
        ghost: 'text-foreground hover:bg-accent ...',
      },
    },
  },
);
```

### Copy Button with Feedback

Use the shared `CopyButton` component for clipboard actions. It swaps the icon to a checkmark for immediate visual feedback (tooltips require hover delay and are poor UX for confirmations):

```tsx
import { CopyButton } from '@app/components/ui/copy-button';

// Simple usage
<CopyButton value={textToCopy} />

// With custom styling
<CopyButton value={textToCopy} className="ml-2" iconSize="h-4 w-4" />
```

The component handles:

- Clipboard API call
- Icon swap (Copy → Check) for 2 seconds
- Hover states and accessibility
- Consistent styling across the app

### Scorecard / Metric Cards

For displaying metrics with severity-based styling:

```tsx
<div className="flex gap-3">
  {/* Each metric card */}
  <div
    className={cn(
      'flex flex-col items-center justify-center px-4 py-3 rounded-xl w-20',
      count > 0
        ? 'bg-red-100 border border-red-200/60 dark:bg-red-900/50 dark:border-red-700/50'
        : 'bg-white/60 shadow-sm dark:bg-white/10',
    )}
  >
    <span
      className={cn(
        'text-2xl font-bold tabular-nums',
        count > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
      )}
    >
      {count}
    </span>
    <span
      className={cn(
        'text-xs font-medium uppercase tracking-wide',
        count > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      )}
    >
      Critical
    </span>
  </div>
</div>
```

Key points:

- Use fixed width (`w-20`) for uniform sizing
- Use `tabular-nums` for number alignment
- Highlight cards with non-zero counts using colored backgrounds
- Use muted styling for zero-count cards

### Header Gradients for Status

Use gradient backgrounds to convey overall status at a glance:

```tsx
<div
  className={cn(
    'border-b border-border/50',
    isClean
      ? 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50'
      : hasCritical
        ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50'
        : 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50',
  )}
>
  {/* Header content */}
</div>
```

Use `/50` opacity in dark mode for subtle, non-overwhelming gradients.

---

## Risks & Mitigations

| Risk                           | Mitigation                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- |
| ~~DataGrid complexity~~        | ✅ **RESOLVED** - DataTable component successfully built with TanStack Table |
| Team velocity during migration | Clear phase boundaries; don't block features                                 |
| Visual regression              | Screenshot testing with Playwright                                           |
| Icon coverage gaps             | Audit icons early; use multiple icon sets if needed                          |
| Accessibility regression       | Radix has strong a11y; test with screen readers                              |

---

## Timeline Guidance

This is not a time estimate but a dependency map:

```plaintext
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

- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
- [TanStack Table](https://tanstack.com/table)
- [cmdk](https://cmdk.paco.me/) - Command palette
- [vaul](https://vaul.emilkowal.ski/) - Drawer component
