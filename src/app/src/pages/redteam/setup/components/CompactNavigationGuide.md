# Ultra-Compact Navigation Options

From most compact to least:

## 1. **No UI - Keyboard Only** (0px)

```typescript
import { useKeyboardNavigation } from './MinimalStepNav';

// In your component:
useKeyboardNavigation(sections, activeSection, onSectionChange);
```

- Alt+1 through Alt+5 to jump to sections
- Arrow keys for prev/next
- Zero visual space used

## 2. **Single Line Navigation** (28px height)

```typescript
import { SingleLineNavigation } from './MinimalStepNav';
```

- Shows: "Step 2 of 5: Application Context ▼"
- Click to see dropdown
- Ultra-minimal height

## 3. **Numbered Dots** (32px height)

```typescript
import { NumberedSteps } from './MinimalStepNav';
```

- Just numbered circles: ① ─ ② ─ ③ ─ ④ ─ ⑤
- Can be positioned at top or bottom
- Visual progress indication

## 4. **Breadcrumb Navigation** (32px height)

```typescript
import { BreadcrumbNavigation } from './UltraCompactNav';
```

- Target / Context / Tests (3) / Strategies (5) / Review
- Inline save button when needed

## 5. **Dropdown Navigation** (40px height)

```typescript
import { DropdownNav } from './UltraCompactNav';
```

- Shows current section with dropdown arrow
- Click to see all sections

## 6. **Icon-Only Sidebar** (40px width)

```typescript
import { IconOnlyNav } from './UltraCompactNav';
```

- Single letter icons: T, C, T, S, R
- Vertical sidebar, minimal width
- Shows count badges

## 7. **Minimal Tabs** (48px height)

```typescript
import MinimalTabs from './MinimalTabs';
```

- Horizontal tabs with counts
- Most readable option

## Space Comparison:

- Keyboard only: **0px**
- Single line: **28px height**
- Numbered/Breadcrumb: **32px height**
- Dropdown: **40px height**
- Icon sidebar: **40px width**
- Tabs: **48px height**
- Settings sidebar: **240px width**

## Recommended Usage:

- **Mobile/Tablet**: Single line or dropdown navigation
- **Desktop with limited space**: Numbered dots or breadcrumb
- **Accessibility focus**: Keyboard navigation + visible UI
- **Power users**: Keyboard only navigation
