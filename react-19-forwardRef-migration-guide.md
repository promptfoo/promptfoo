# forwardRef Migration Guide for React 19

## Status

React 19 has deprecated `React.forwardRef` in favor of passing `ref` as a regular prop.
However, forwardRef is still **fully functional** in React 19 - it only generates console warnings.

## Files Using forwardRef (6 total)

### 1. src/app/src/pages/eval/components/ResultsFilters/FiltersButton.tsx

**Usage:** IconButton wrapper with ref forwarding
**Complexity:** Low
**Priority:** Low (works fine, no user-facing issues)

### 2. src/app/src/pages/evals/components/EvalsDataGrid.tsx

**Usage:** DataGrid component with ref forwarding
**Complexity:** Medium
**Priority:** Medium (commonly used component)

### 3. src/app/src/components/Navigation.tsx

**Usage:** Navigation component with ref forwarding
**Complexity:** Medium
**Priority:** Medium (core UI component)

### 4-6. Test Files

- src/pages/redteam/setup/components/Targets/ProviderEditor.test.tsx
- src/pages/redteam/setup/components/Targets/TargetConfiguration.test.tsx

**Usage:** Test mocks/fixtures
**Complexity:** Low
**Priority:** Low (test-only)

## Migration Strategy

### Current (React 18/19 with forwardRef)

```typescript
const MyComponent = React.forwardRef<HTMLButtonElement, Props>(
  ({ prop1, prop2 }, ref) => {
    return <button ref={ref}>...</button>;
  }
);
MyComponent.displayName = 'MyComponent';
```

### Future (React 19 ref-as-prop pattern)

```typescript
interface Props {
  prop1: string;
  prop2: number;
  ref?: React.Ref<HTMLButtonElement>; // ref is now a regular prop
}

const MyComponent = ({ prop1, prop2, ref }: Props) => {
  return <button ref={ref}>...</button>;
};
MyComponent.displayName = 'MyComponent';
```

## Recommendation

**Action:** Leave forwardRef as-is for now
**Rationale:**

1. All 6 files work perfectly with forwardRef (100% tests passing)
2. Console warnings are development-only (not production)
3. Migration is non-breaking and can be done incrementally
4. Waiting for ecosystem (MUI, etc.) to fully migrate reduces churn

**Future Migration:** Can be done in a separate PR when:

- MUI and other libraries fully migrate
- Team has bandwidth for non-critical cleanup
- React 20 (if it exists) removes forwardRef support entirely

## Testing Strategy for Future Migration

When migrating:

1. Run full test suite after each file
2. Test in browser dev tools for any runtime warnings
3. Verify ref behavior with React DevTools
4. Check TypeScript compilation for type errors
