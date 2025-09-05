# Table Settings Modal - Progressive Enhancement

## Objective

Offer an optional, denser, and more scannable layout for the Table Settings modal while ensuring the default experience remains stable and accessible for all users. This plan prioritizes backwards compatibility and adherence to accessibility standards (WCAG).

## Core Strategy: Progressive Enhancement

Instead of a forced redesign, we will implement the new dense layout as an **opt-in feature**. This approach mitigates risk, respects user choice, and allows us to gather feedback before considering wider changes.

1.  **"Compact View" Toggle**: A `Switch` will be added to the modal. It will be **off by default**.
2.  **Conditional Layout**: The new two-column, denser layout and its associated styles will only be applied when the user enables "Compact View".
3.  **Accessibility First**: All new UI components built for the compact view will be fully accessible, with correct semantic structure and WCAG-compliant touch targets.
4.  **Backwards Compatibility**: A migration strategy will be implemented to ensure settings for existing users do not break.

---

## Revised Implementation Plan

### Phase 1: Foundational Safety (Highest Priority)

_Goal: Ensure no user is negatively impacted. Address breaking changes and lay the groundwork for the new feature._

#### 1.1 Implement Settings Migration Logic

**File**: `src/app/src/pages/eval/components/TableSettings/hooks/useSettingsState.ts` (or similar)

**Task**: Create and integrate a migration function to handle the `wordBreak` setting changing from a `boolean` to a `string`. This is critical to prevent breaking `localStorage` settings for existing users.

```typescript
// Example migration logic
const migrateWordBreakSetting = (value: any): string => {
  if (typeof value === 'boolean') {
    return value ? 'break-all' : 'break-word';
  }
  // Return default if invalid or already a string
  return value === 'break-all' || value === 'break-word' ? value : 'break-word';
};
```

#### 1.2 Add "Compact View" Toggle

**File**: `src/app/src/pages/eval/components/TableSettings/components/SettingsPanel.tsx`

**Task**: Add a `Switch` to the top of the modal to control the "Compact View". Its state will be persisted in the Zustand store and `localStorage`.

```typescript
<SettingItem
  label="Enable Compact View"
  checked={isCompactView}
  onChange={setIsCompactView}
  tooltipText="Toggles a denser, multi-column layout for these settings."
/>
<Divider sx={{ my: 2 }} />
```

### Phase 2: Build Accessible Compact Layout (Conditionally Applied)

_Goal: Build the new dense layout, ensuring it only appears when toggled on and that all components are fully accessible._

#### 2.1 Conditional Two-Column Grid

**File**: `src/app/src/pages/eval/components/TableSettings/components/SettingsPanel.tsx`

**Task**: Implement the responsive `Grid` layout. The root component will switch from a `Stack` to a `Grid` based on the `isCompactView` state.

#### 2.2 Accessible Section Headers

**File**: `src/app/src/pages/eval/components/TableSettings/components/SettingsSection.tsx`

**Task**: Style section headers to be compact _without_ sacrificing semantics. Use `Typography` for the title within a `Box component="section"`.

```typescript
<Box component="section" aria-labelledby={sectionId} sx={{ mb: 2 }}>
  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
    {icon}
    <Typography variant="h6" id={sectionId} sx={{ fontSize: '1rem', fontWeight: 600 }}>
      {title}
    </Typography>
    <Divider sx={{ flex: 1 }} />
  </Stack>
  {children}
</Box>
```

#### 2.3 WCAG-Compliant Compact Items

**File**: `src/app/src/pages/eval/components/TableSettings/components/SettingItem.tsx`

**Task**: Create the `size="compact"` variant, ensuring that touch targets meet the WCAG minimum of 44px.

```typescript
// In SettingItem.tsx
const isCompact = size === 'compact' && isCompactView; // Depends on global toggle

<Paper
  sx={{
    minHeight: 44, // Enforce WCAG minimum touch target
    p: isCompact ? 1 : 1.5,
    // ... other styles
  }}
>
  {/* ... */}
</Paper>
```

### Phase 3: Polish and Refine (Conditionally Applied)

_Goal: Implement the remaining control improvements within the compact layout._

#### 3.1 ToggleButtonGroup for Word Break

**Task**: Implement the `ToggleButtonGroup` for the `wordBreak` setting. This will only be visible in the compact layout.

#### 3.2 Enhanced Range Slider & Inline Pairs

**Task**: Implement the range slider with a live value display and the inline boolean pairs. These styles will only apply in compact view.

#### 3.3 Accessible Tooltips

**Task**: Ensure all tooltips are accessible to keyboard and touch users, for example by making the entire `SettingItem` focusable.

---

## Testing Requirements

- [x] **Settings Migration**: Must verify that old boolean `wordBreak` values are correctly migrated to the new string format.
- [x] **Default View**: Must remain visually and functionally unchanged.
- [x] **Compact View**: Must render correctly when toggled on/off.
- [x] **Accessibility**: Both views must be navigable and usable via keyboard and screen reader. All controls must have a minimum 44px interactive area.
- [x] **Responsiveness**: The compact grid must collapse to a single column on mobile and remain usable.
- [ ] **Visual Regression Testing**: To catch unintended UI changes in either view.

## Success Metrics

- **Stability**: Zero regressions in the default view.
- **Accessibility**: Full WCAG compliance in both default and compact views.
- **User Choice**: Users can successfully toggle and persist their choice for the compact view.
- **Adoption (Optional)**: Future analytics could track the adoption rate of the compact view to inform future design decisions.

## Risk Assessment

- **Low Risk**: With the progressive enhancement approach, the risk of impacting the general user base is minimal. The primary risk is isolated to the new, opt-in functionality.
- **Testing Focus**: The highest priority for testing is the settings migration logic to prevent any data loss for existing users.
