# Metadata Filter Feature Audit

## Executive Summary

This document provides a critical audit of the metadata filtering feature implemented for the promptfoo evaluation results table. The feature allows users to filter evaluation results based on metadata key-value pairs with wildcard support.

## Implementation Overview

### What Was Built

1. **Frontend Components**
   - `MetadataFilterSelector.tsx` - Main filter UI component
   - `MetadataFilterSelectorAdvanced.tsx` - Example advanced implementation
   - `MetadataFilterExamples.tsx` - Documentation component
   - Visual improvements with loading states, clear buttons, and better UX

2. **Backend Functionality**
   - `/eval/:id/metadata-keys` endpoint to fetch all unique metadata keys
   - Modified `queryTestIndices` to support key:value filtering with wildcards
   - SQL-based metadata extraction using `json_each`

3. **State Management**
   - Added metadata-related state to `useTableStore`
   - Proper reset behavior when switching evaluations
   - Filter applies to entire dataset, not just visible page

## Retroactive Implementation Plan

### Phase 1: Core Filtering (✅ Completed)
1. **Backend Infrastructure**
   - Create endpoint to fetch metadata keys from entire evaluation
   - Implement SQL query with json_each for metadata extraction
   - Add support for key-only and key:value filtering

2. **Frontend Components**
   - Build basic MetadataFilterSelector component
   - Integrate with existing filter system
   - Add to ResultsView toolbar

3. **State Management**
   - Extend useTableStore with metadata state
   - Implement fetchMetadataKeys action
   - Ensure proper cleanup on eval switch

### Phase 2: Enhanced UX (✅ Completed)
1. **Visual Improvements**
   - Add Paper wrapper for value input grouping
   - Implement loading states with spinner
   - Add clear button for value field
   - Improve typography and spacing

2. **Interaction Improvements**
   - Add Enter key support for applying filters
   - Show metadata counts in dropdown
   - Add helpful tooltips with examples
   - Better empty state handling

3. **Documentation**
   - Create MetadataFilterExamples component
   - Add comprehensive README documentation
   - Include wildcard syntax examples

## Current Limitations & Issues

### 1. Security Concerns
- **SQL Injection Risk**: While the SQL is parameterized, the JSON path construction could be vulnerable
- **Mitigation**: Since this is a local development tool, risk is minimal but should be addressed

### 2. Performance Issues
- **No Caching**: Metadata keys are fetched on every eval load
- **Count Calculation**: Computing counts for each key might be expensive on large datasets
- **Large Metadata**: No pagination or virtualization for metadata dropdowns

### 3. Feature Limitations
- **Single Filter Only**: Cannot combine multiple metadata filters
- **No OR Logic**: All filters are AND-ed together
- **No Regex Support**: Only wildcard patterns supported
- **No Saved Filters**: Users must recreate filters each session
- **No Bulk Actions**: Cannot export or operate on filtered results

### 4. UX Concerns
- **Discovery**: Users might not realize the value field accepts wildcards
- **Complex Filters**: No way to build complex filter expressions
- **Filter Persistence**: Filters lost on page refresh

### 5. Testing Gaps
- **No Frontend Tests**: MetadataFilterSelector lacks unit tests
- **Limited Backend Tests**: Only basic endpoint testing
- **No E2E Tests**: User flows not covered

## Verification Steps

### Manual Testing Checklist

1. **Basic Functionality**
   - [ ] Select metadata key from dropdown
   - [ ] Enter value and press Enter
   - [ ] Clear value with × button
   - [ ] Filter applies to all results (not just current page)
   - [ ] Filter chip shows correct label

2. **Wildcard Patterns**
   - [ ] Exact match: `gpt-4`
   - [ ] Starts with: `gpt-*`
   - [ ] Ends with: `*-4`
   - [ ] Contains: `*gpt*`

3. **Edge Cases**
   - [ ] Empty metadata (no keys available)
   - [ ] Large number of metadata keys (100+)
   - [ ] Special characters in keys/values
   - [ ] Very long key/value strings

4. **Integration**
   - [ ] Works with text search filter
   - [ ] Works with pass/fail filter
   - [ ] Works with metric filter
   - [ ] Correct result count displayed

5. **Performance**
   - [ ] Metadata keys load quickly (<1s)
   - [ ] Filtering is responsive
   - [ ] No UI freezing with large datasets

### Automated Testing Requirements

```typescript
// Example test structure needed
describe('MetadataFilterSelector', () => {
  test('renders with available metadata keys', () => {});
  test('shows loading state while fetching', () => {});
  test('filters by key only when no value provided', () => {});
  test('filters by key:value when value provided', () => {});
  test('supports wildcard patterns', () => {});
  test('clears filter when key deselected', () => {});
});

describe('Metadata API Endpoint', () => {
  test('returns unique metadata keys', () => {});
  test('includes counts for each key', () => {});
  test('handles missing metadata gracefully', () => {});
  test('validates evalId parameter', () => {});
});
```

## Todo List

### Immediate Priorities (P0)
- [ ] Add frontend unit tests for MetadataFilterSelector
- [ ] Add input validation for metadata filter values
- [ ] Implement metadata key caching to improve performance
- [ ] Add loading skeleton instead of just spinner

### Short Term (P1)
- [ ] Support multiple metadata filters (AND/OR logic)
- [ ] Add regex pattern support (not just wildcards)
- [ ] Implement filter presets/saved filters
- [ ] Add export functionality for filtered results
- [ ] Improve SQL security with better validation

### Medium Term (P2)
- [ ] Advanced filter builder UI (like GitHub issues)
- [ ] Metadata value autocomplete/suggestions
- [ ] Filter history with undo/redo
- [ ] Bulk operations on filtered results
- [ ] Performance optimization for large datasets

### Long Term (P3)
- [ ] GraphQL API for more flexible querying
- [ ] Real-time collaborative filtering
- [ ] AI-powered filter suggestions
- [ ] Integration with external data sources

## Future Direction

### 1. Advanced Filter Builder
Create a visual query builder similar to GitHub's issue filters or Jira's JQL:
```
(metadata.model = "gpt-4" OR metadata.model = "claude-3") 
AND metadata.score > 0.8 
AND NOT metadata.flagged
```

### 2. Smart Filtering
- **Filter Templates**: Pre-built filters for common scenarios
- **AI Suggestions**: "Users who filtered by X also filtered by Y"
- **Anomaly Detection**: Highlight unusual metadata combinations

### 3. Performance Optimization
- **Indexed Metadata**: Create dedicated metadata tables for faster queries
- **Incremental Loading**: Load metadata keys on demand
- **Query Caching**: Cache filter results for faster subsequent loads

### 4. Integration Enhancements
- **API Access**: REST/GraphQL endpoints for programmatic filtering
- **Webhook Support**: Notify external systems of filter changes
- **Export Formats**: CSV, JSON, Parquet for filtered data

### 5. Visualization
- **Metadata Dashboard**: Visualize metadata distribution
- **Filter Impact**: Show how filters affect result distribution
- **Trend Analysis**: Track metadata changes over time

## Architecture Recommendations

### 1. Separate Metadata Service
```typescript
// Proposed metadata service architecture
interface MetadataService {
  getKeys(evalId: string): Promise<MetadataKey[]>;
  getValues(evalId: string, key: string): Promise<string[]>;
  createFilter(expression: FilterExpression): Filter;
  saveFilter(name: string, filter: Filter): Promise<void>;
}
```

### 2. Filter Expression Language
```typescript
// Define a proper filter AST
type FilterExpression = 
  | { type: 'key'; key: string }
  | { type: 'keyValue'; key: string; op: Operator; value: string }
  | { type: 'and'; left: FilterExpression; right: FilterExpression }
  | { type: 'or'; left: FilterExpression; right: FilterExpression }
  | { type: 'not'; expr: FilterExpression };
```

### 3. Caching Strategy
```typescript
// Implement multi-level caching
const metadataCache = new Map<string, {
  keys: MetadataKey[];
  timestamp: number;
  ttl: number;
}>();
```

## Conclusion

The metadata filter feature provides valuable functionality for filtering evaluation results. While the current implementation meets basic requirements, there are significant opportunities for enhancement in performance, security, and user experience. The immediate priority should be adding tests and improving performance through caching, followed by extending the filtering capabilities to support more complex queries.

### Risk Assessment
- **Security**: Low (local tool, but should be addressed)
- **Performance**: Medium (could impact UX with large datasets)
- **Maintainability**: Medium (needs more tests)
- **Usability**: Low (current implementation is intuitive)

### Recommendation
Continue iterating on the feature with focus on:
1. Test coverage
2. Performance optimization
3. Multiple filter support
4. Security hardening

The foundation is solid and the feature is already providing value to users. 