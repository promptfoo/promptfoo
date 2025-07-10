# Metadata Filter Implementation

This document describes the metadata filter feature implementation in the evaluation results view.

## Overview

The metadata filter allows users to filter evaluation results based on metadata keys associated with each output. This feature is implemented following the same pattern as the existing metric filter.

## Components

### 1. **MetadataFilterSelector.tsx**
The basic metadata filter selector component with:
- Dropdown selection of available metadata keys
- Optional display of counts per metadata key
- Accessibility features (aria-labels, screen reader support)
- Support for future enhancements

### 2. **MetadataFilterSelectorAdvanced.tsx**
An advanced example showing how to extend the basic filter with:
- Search within metadata keys
- Grouped metadata by prefix
- Value-based filtering (key:value pairs)
- Operator selection (equals, contains, startsWith, etc.)
- Loading states
- Autocomplete functionality

## Implementation Details

### Frontend Changes

1. **State Management** (ResultsView.tsx)
   ```typescript
   const [selectedMetadata, setSelectedMetadata] = React.useState<string | null>(null);
   
   const { availableMetadata, metadataCounts } = React.useMemo(() => {
     // Calculate available metadata keys and their counts
   }, [table]);
   ```

2. **Empty State Handling**
   - Shows an informative message when no results match the metadata filter
   - Uses Material UI Alert component for better visibility

3. **Performance Optimization**
   - Metadata keys and counts are memoized
   - Prepared for future backend optimization

### Backend Integration

The backend receives the metadata filter through the query parameter:
```
/eval/:id/table?metadata=<metadataKey>
```

Current implementation checks if the metadata key exists (`IS NOT NULL`).

## Usage

### Basic Usage
```tsx
<MetadataFilterSelector
  selectedMetadata={selectedMetadata}
  availableMetadata={availableMetadata}
  onChange={handleMetadataFilterChange}
  metadataCounts={metadataCounts}
/>
```

### Advanced Usage (Future)
```tsx
<MetadataFilterSelectorAdvanced
  selectedFilter={metadataFilter}
  availableMetadata={metadataWithSamples}
  onChange={handleAdvancedFilterChange}
  isLoading={isLoadingMetadata}
/>
```

## Future Enhancements

1. **Value-Based Filtering**
   - Support filtering by specific values: `model:gpt-4`
   - Add operators: equals, contains, startsWith, endsWith
   - UI for entering values

2. **Backend Optimizations**
   - Move metadata computation to backend
   - Add proper SQL parameterization
   - Support complex queries

3. **UI Improvements**
   - Group related metadata keys
   - Show sample values
   - Multi-select support
   - Save filter presets

## Testing

The component includes comprehensive tests covering:
- Rendering with/without metadata
- User interactions
- Accessibility features
- Edge cases (special characters, empty states)

Run tests with:
```bash
npm test -- src/app/src/pages/eval/components/MetadataFilterSelector.test.tsx
```

## Security Considerations

**Note**: The current backend implementation has a potential SQL injection risk that should be addressed before production use. Use parameterized queries or a proper query builder instead of string concatenation.

## Accessibility

The implementation follows WCAG guidelines with:
- Proper aria-labels
- Screen reader descriptions
- Keyboard navigation support
- Clear focus indicators 