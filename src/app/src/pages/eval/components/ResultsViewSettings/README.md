# ResultsViewSettings

A modular, accessible settings modal component for controlling table display and content settings.

## Component Structure

The component follows a modular architecture pattern:

```
ResultsViewSettings/
├── components/            # Reusable UI components
│   ├── EnhancedRangeSlider.tsx
│   ├── SettingItem.tsx
│   ├── SettingsSection.tsx
│   ├── TabPanels/        # Tab content components
│   │   ├── DisplayTabPanel.tsx
│   │   ├── ContentMediaTabPanel.tsx
│   │   └── index.ts
│   └── index.ts
├── hooks/                # Custom React hooks
│   ├── useSettingsState.ts
│   └── index.ts
├── tokens.ts             # Design tokens for consistent styling
├── store.ts              # Store re-export
├── ResultsViewSettingsModal.tsx # Main modal component
├── index.ts              # Public API
└── README.md             # Documentation
```

## Design Patterns

### 1. Atomic Design
The component follows an atomic design approach:
- **Atoms**: Basic UI elements like sliders, checkboxes
- **Molecules**: Composed components like `SettingItem`, `EnhancedRangeSlider`
- **Organisms**: Section groups like `SettingsSection` and tab panels
- **Templates**: The overall modal layout in `ResultsViewSettingsModal`

### 2. Design Tokens
Consistent styling values are centralized in `tokens.ts`, providing:

```typescript
// Example design tokens usage
tokens.spacing.section      // 4 (32px) - Major section spacing
tokens.spacing.subsection   // 2.5 (20px) - Subsection spacing
tokens.spacing.item         // 1.5 (12px) - Item spacing

// More specific spacing values
tokens.spacing.padding.container    // 3 (24px) - Container padding
tokens.spacing.padding.item         // 1.5 (12px) - Item padding
tokens.spacing.padding.compact      // 1 (8px) - Compact padding
tokens.spacing.padding.tiny         // 0.5 (4px) - Tiny padding

// Stack spacing presets
tokens.spacing.stack.large         // 2 (16px) - Large stack spacing
tokens.spacing.stack.medium        // 1.5 (12px) - Medium stack spacing
tokens.spacing.stack.small         // 1 (8px) - Small stack spacing

// Border radius
tokens.borderRadius.small          // 1 (8px) - Small radius
tokens.borderRadius.medium         // 2 (16px) - Medium radius
tokens.borderRadius.pill           // 6 (48px) - Pill buttons

// Animations
tokens.animation.fast              // 150ms - Quick animations
tokens.animation.medium            // 250ms - Standard transitions
```

#### Spacing System

Our spacing system follows these principles:

1. **Hierarchy-based**: Different spacing values are used for different levels of hierarchy
   - Section spacing (32px) - Used for major sections
   - Subsection spacing (20px) - Used for subsections
   - Item spacing (12px) - Used for list items

2. **Consistent Rhythm**: Fixed set of spacing values to maintain visual rhythm
   - 4px (0.5) - Used for very small spacing
   - 8px (1) - Compact spacing for tight layouts
   - 12px (1.5) - Standard spacing for most UI elements
   - 16px (2) - Medium spacing
   - 24px (3) - Container padding and larger margins
   - 32px (4) - Section spacing

3. **Component-specific Rules**:
   - Section headers use standardized height and padding
   - Form elements maintain consistent vertical rhythm
   - Related controls maintain uniform spacing

### 3. State Management
The component uses:
- A custom hook (`useSettingsState`) to manage all state logic
- Store integration via the imported `store.ts`
- Local state for UI interactions

### 4. Accessibility Features
Enhanced accessibility including:
- ARIA attributes on interactive elements
- Keyboard navigation support
- Proper focus management
- High-contrast color options
- Screen reader-friendly markup

## Usage

```tsx
import SettingsModal from '../ResultsViewSettings';

function MyComponent() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Settings</Button>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

## Spacing Best Practices

When modifying this component, follow these spacing guidelines:

1. **Use tokens, not magic numbers**: Always use the design tokens for spacing values
   ```tsx
   // ✅ Good
   <Box sx={{ mb: tokens.spacing.section }}>
   
   // ❌ Bad
   <Box sx={{ mb: 4 }}>
   ```

2. **Maintain hierarchy**: Use appropriate spacing based on the relationship between elements
   - Large spaces separate major sections
   - Medium spaces separate related groups
   - Small spaces separate related items

3. **Consistent padding**: Use the same padding values for similar components
   - Container padding: `tokens.spacing.padding.container`
   - Item padding: `tokens.spacing.padding.item`

4. **Stack spacing**: Use predefined stack spacing for consistent vertical and horizontal rhythm
   ```tsx
   <Stack spacing={tokens.spacing.stack.medium}>
   ``` 