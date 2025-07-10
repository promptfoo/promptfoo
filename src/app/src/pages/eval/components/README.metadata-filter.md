# Metadata Filter Implementation

This document describes the metadata filter feature implementation in the evaluation results view.

## Overview

The metadata filter allows users to filter evaluation results based on metadata keys and values associated with each output. This feature is implemented following the same pattern as the existing metric filter.

## Features

### 1. **Key-based Filtering**
Filter results that have a specific metadata key, regardless of its value:
- Example: Show all results that have a "model" metadata key

### 2. **Value-based Filtering**
Filter results by specific key:value pairs with support for wildcards:
- Exact match: `model:gpt-4`
- Starts with: `model:gpt-*`
- Ends with: `model:*-4`
- Contains: `model:*gpt*`

## Components

### 1. **MetadataFilterSelector.tsx**
The basic metadata filter selector component with:
- Dropdown selection of available metadata keys
- Optional value input field that appears when a key is selected
- Wildcard support for flexible matching
- Display of counts per metadata key
- Accessibility features (aria-labels, screen reader support)
- Tooltip explaining value filtering syntax

### 2. **MetadataFilterSelectorAdvanced.tsx**
An advanced example showing how to extend the basic filter with:
- Search within metadata keys
- Grouped metadata by prefix
- Advanced operators (equals, contains, startsWith, etc.)
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

2. **Value Input**
   - Text field appears when a metadata key is selected
   - Supports wildcard syntax (* for pattern matching)
   - Updates filter in real-time as user types

3. **Empty State Handling**
   - Shows an informative message when no results match the metadata filter
   - Uses Material UI Alert component for better visibility

4. **Filter Clarity**
   - Shows "(filters apply to all X results)" to clarify that filters work across all pages
   - Filter chips display the full filter (e.g., "Metadata: model:gpt-4")

### Backend Integration

The backend receives the metadata filter through the query parameter:
```
/eval/:id/table?metadata=<metadataKey> or
/eval/:id/table?metadata=<metadataKey>:<value>
```

Backend query logic:
- Key only: `json_extract(metadata, '$.key') IS NOT NULL`
- Exact value: `json_extract(metadata, '$.key') = 'value'`
- Wildcard patterns: Uses SQL LIKE for flexible matching

## Usage

### Basic Key Filtering
```tsx
// Filter by key existence
setSelectedMetadata('model'); // Shows all results with 'model' metadata
```

### Value-based Filtering
```tsx
// Exact match
setSelectedMetadata('model:gpt-4');

// Pattern matching
setSelectedMetadata('model:gpt-*');    // Starts with 'gpt-'
setSelectedMetadata('model:*-4');      // Ends with '-4'
setSelectedMetadata('model:*gpt*');    // Contains 'gpt'
```

### UI Usage
1. Select a metadata key from the dropdown
2. Optionally enter a value in the text field
3. Use wildcards (*) for pattern matching
4. Clear the filter by clicking the X on the filter chip

## Security Considerations

**Note**: The current backend implementation uses string concatenation for SQL queries. While the code does escape single quotes, it would be better to use parameterized queries or a proper query builder for production use.

## Testing

The component includes comprehensive tests covering:
- Rendering with/without metadata
- User interactions
- Value-based filtering
- Accessibility features
- Edge cases (special characters, empty states)

## Future Enhancements

1. **Advanced Operators**
   - Add explicit operator selection (equals, not equals, greater than, etc.)
   - Support for numeric comparisons
   - Regular expression support

2. **Multiple Filters**
   - Allow combining multiple metadata filters
   - AND/OR logic between filters

3. **UI Improvements**
   - Auto-complete for common values
   - Show value distribution for each key
   - Save filter presets

## Accessibility

The implementation follows WCAG guidelines with:
- Proper aria-labels
- Screen reader descriptions
- Keyboard navigation support
- Clear focus indicators
