# Eval Creator - Dataset & Assertion Generation Implementation Plan

## Overview

This document outlines the implementation plan for adding dataset and assertion generation capabilities to the eval creator UI. The goal is to seamlessly integrate these powerful features while maintaining the existing user workflow.

## Phase 1: Dataset Generation (Priority 1)

### 1.1 UI Components

- [x] Create `GenerateTestCasesDialog.tsx` component in `/src/app/src/pages/eval-creator/components/`
  - [x] Dialog with generation settings (personas, test cases per persona, instructions)
  - [x] Provider selection dropdown (optional, defaults to synthesis provider)
  - [x] Preview section showing prompts and variables
  - [x] Progress indicator component
  - [x] Error handling and retry mechanism

- [x] Update `TestCasesSection.tsx`
  - [x] Add "Generate Test Cases" button next to existing buttons
  - [x] Add state management for generation dialog
  - [x] Handle generated test cases and merge with existing ones
  - [x] Add visual indicator for generated vs manual test cases

### 1.2 Server Routes

- [x] Enhance `/api/dataset/generate` endpoint in `src/server/server.ts`
  - [x] Add support for async operations (return job ID)
  - [x] Add validation for request parameters
  - [x] Add proper error handling and logging
  - [x] Support provider selection

- [x] Create new route handler in `src/server/routes/generate.ts`
  - [x] Move generation logic to dedicated route file
  - [x] Add job queue support similar to eval jobs
  - [x] Implement progress tracking

### 1.3 State Management

- [x] Update `src/app/src/stores/evalConfig.ts`
  - [ ] Add generation history tracking
  - [x] Add methods for managing generated test cases
  - [ ] Support undo/redo for generation actions

### 1.4 API Integration

- [x] Create `src/app/src/services/generation.ts`
  - [x] API client for dataset generation
  - [x] Job polling logic
  - [x] Error handling and retry logic

## Phase 2: Assertion Generation (Priority 2)

### 2.1 UI Components

- [x] Create `GenerateAssertionsDialog.tsx` component
  - [x] Dialog with assertion generation settings
  - [x] Assertion type selector (pi, g-eval, llm-rubric)
  - [x] Number of assertions slider
  - [x] Custom instructions textarea
  - [x] Preview of context (prompts + selected test case)

- [x] Update `TestCaseDialog.tsx`
  - [x] Add "Generate Assertions" button in assertions section
  - [x] Handle both defaultTest and per-test assertion generation

- [x] Update `AssertsForm.tsx`
  - [x] Add generation trigger button
  - [x] Support bulk assertion addition
  - [x] Visual indicators for generated assertions

### 2.2 Server Routes

- [x] Create `/api/assertions/generate` endpoint
  - [x] Implement assertion synthesis integration
  - [x] Support async job pattern
  - [x] Add proper validation and error handling
  - [x] Support different assertion types

- [x] Update `src/server/routes/generate.ts`
  - [x] Add assertion generation handler
  - [x] Reuse job infrastructure from dataset generation

### 2.3 Integration

- [x] Extend generation service for assertions
  - [x] API client methods for assertion generation
  - [x] Type definitions for assertion generation options
  - [x] Progress tracking

## Phase 3: Polish & Enhancements (Priority 3)

### 3.1 User Experience

- [x] Add prompt suggestion templates
  - [x] Common testing scenarios (QA, safety, performance)
  - [x] Templates organized by category
  - [x] One-click template selection

- [ ] Add dataset generation templates
  - [ ] Industry-specific test case patterns
  - [ ] Custom template creation
  - [ ] Save and share templates

- [ ] Improve generation preview
  - [ ] Show estimated time for generation
  - [ ] Preview generated persona types
  - [ ] Cost estimation (if applicable)

### 3.2 Advanced Features

- [ ] Batch operations
  - [ ] Generate assertions for multiple test cases
  - [ ] Bulk regeneration with different settings
  - [ ] Export/import generation settings

- [ ] Generation history
  - [ ] Track all generation operations
  - [ ] Allow reverting to previous generations
  - [ ] Generation analytics

### 3.3 Performance & Reliability

- [x] Add caching layer
  - [x] Cache generation results
  - [x] Implement cache invalidation
  - [ ] Offline generation queue

- [x] Rate limiting
  - [ ] Client-side request throttling
  - [x] Server-side rate limits
  - [x] Graceful degradation

## Technical Debt & Refactoring

### Code Quality

- [ ] Add comprehensive tests
  - [ ] Unit tests for generation components
  - [ ] Integration tests for API endpoints
  - [ ] E2E tests for generation workflows

- [ ] Documentation
  - [ ] API documentation for new endpoints
  - [ ] Component documentation
  - [ ] User guide for generation features

### Refactoring Opportunities

- [ ] Extract common generation UI patterns
- [ ] Create shared generation utilities
- [ ] Standardize error handling across generation features

## Implementation Order

1. **Week 1-2**: Phase 1.1 & 1.2 (Basic dataset generation)
2. **Week 3**: Phase 1.3 & 1.4 (State management and integration)
3. **Week 4-5**: Phase 2.1 & 2.2 (Assertion generation)
4. **Week 6**: Phase 2.3 & initial testing
5. **Week 7-8**: Phase 3 (Polish and enhancements)
6. **Week 9**: Documentation and testing

## Success Metrics

- [ ] Users can generate test cases with < 3 clicks
- [ ] Generation completes within reasonable time (< 30s for typical use)
- [ ] Generated content quality matches or exceeds manual creation
- [ ] No regression in existing eval creator functionality
- [ ] Positive user feedback on generation features

## Completed Enhancements (2025-07-13)

### Visual Indicators

- [x] Added visual indicators for generated test cases using metadata tracking
  - Test cases generated via GenerateTestCasesDialog now have metadata with isGenerated flag
  - TestCasesSection displays "Generated" chip with AutoAwesome icon
  - Metadata includes generation timestamp, provider, and options used
- [x] Added visual indicators for generated assertions
  - AssertsForm tracks which assertions were generated
  - Shows "Generated" chip next to generated assertions
  - Maintains tracking when assertions are removed

### UI Improvements

- [x] Simplified test case generation UI
  - Replaced confusing "personas" terminology with simple "Number of Test Cases" slider
  - Moved advanced persona options to collapsible "Advanced Options" section
  - Added helpful descriptions explaining what personas are

### Performance & Reliability Fixes

- [x] Fixed memory leak in generation jobs Map
  - Jobs are now automatically cleaned up 5 minutes after completion
  - Added timestamp tracking for completed jobs
  - Prevents unbounded memory growth

- [x] Implemented rate limiting
  - 10 requests per minute per IP address
  - Returns 429 status with retry-after header
  - Automatic cleanup of expired rate limit entries

- [x] Added caching layer for generation results
  - 30-minute TTL for cached results
  - SHA-256 hash-based cache keys
  - Maximum cache size of 100 entries with LRU eviction
  - Works for both sync and async generation

### Prompt Suggestions (Completed 2025-07-13, Simplified 2025-07-13)

- [x] Created simplified PromptSuggestionsSimple component
  - 6 essential prompt templates with emoji icons
  - Dark mode compatible dropdown menu
  - Replaces "Add Example" button with better functionality
- [x] Integrated into PromptsSection
  - Shows "Load Example" button when no prompts exist
  - One-click selection adds prompt to list
  - Clean, minimal UI that works in all themes

### Metadata Storage Optimization (Completed 2025-07-13)

- [x] Optimized metadata storage to reduce verbosity
  - Replaced repeating metadata (isGenerated, generatedAt, generatedBy) with batch ID reference
  - Created GenerationBatch type to store generation information once
  - Test cases now only store generationBatchId in metadata
  - TestCasesSection tracks generation batches in a Map
- [x] Updated visual indicators to use batch information
  - Generated chip tooltip shows batch generation time and provider
  - Properly handles duplicated test cases by removing batch reference

### Code Refactoring for Maintainability (Completed 2025-07-13)

- [x] Decomposed TestCasesSection component
  - Split into TestCasesTable (display), TestCasesActions (controls), and main section
  - Reduced from 356 lines to more manageable components
  - Each component now has single responsibility
- [x] Created custom hooks for reusable logic
  - usePromptNormalization: Handles prompt format conversion
  - useGenerationBatches: Manages generation batch metadata
  - useAssertionTracking: Tracks generated vs edited assertions
- [x] Improved TypeScript type safety
  - Created type guards for runtime validation
  - Replaced unsafe type assertions with proper checks
  - Centralized assertion types in utils/assertTypes.ts
- [x] Added error boundaries
  - Created ErrorBoundary component for graceful error handling
  - Wrapped critical components to prevent crashes
- [x] Enhanced accessibility
  - Added ARIA labels to interactive elements
  - Implemented keyboard navigation for table rows
  - Added proper focus management

### React 18+ Modern Features (Completed 2025-07-13)

- [x] Implemented useTransition for non-urgent updates
  - State updates wrapped in startTransition for better performance
  - Delete button shows pending state during transitions
- [x] Added React.lazy for code splitting
  - Heavy dialogs (GenerateTestCasesDialog, TestCaseDialog) lazy loaded
  - Suspense boundaries with loading fallbacks
- [x] Consolidated state with useReducer
  - Created useTestCasesReducer for complex state management
  - Single source of truth for test cases state
  - Better performance with batched updates
- [x] Added proper memoization
  - useMemo for expensive computations (testCases, providers, prompts)
  - useCallback for all event handlers
  - React.memo on pure components
- [x] Created virtualized table component
  - VirtualizedTestCasesTable using react-window (needs npm install)
  - Handles large lists efficiently
  - Maintains accessibility features

### Next Priority Tasks

1. **Generation History Tracking**
   - Store generation batches in database (persistent storage)
   - Allow viewing past generations
   - Support regenerating with same settings

2. **Batch Assertion Generation**
   - Update GenerateAssertionsDialog to support multiple test case selection
   - Modify API to handle batch generation
   - Show progress for each test case

3. **Generation Templates/Presets**
   - Create preset generation configurations (beyond prompt suggestions)
   - Allow saving custom templates
   - Quick-apply common patterns

4. **Improved UX**
   - Add preview/review step before applying generated content
   - Support selective application of generated items
   - Add regeneration capability with modified settings
   - Add cancellation support for in-progress generation jobs

## Open Questions

1. Should we support custom generation prompts/templates?
2. How to handle provider API key management for generation?
3. ~~Should generated content be marked/tagged differently?~~ ✓ Implemented
4. What are the rate limits we should impose?
5. Should we support generation history export/import?

## Dependencies

- Existing synthesis functions work correctly
- Provider infrastructure supports generation use cases
- Job queue system can handle generation workloads
- UI state management can handle async operations

## Risk Mitigation

1. **Provider Failures**: Implement retry logic and fallback providers
2. **Long Generation Times**: Add progress indicators and cancellation
3. **Poor Quality Output**: Allow regeneration and manual editing
4. **State Corruption**: Implement proper error boundaries and recovery
5. **API Rate Limits**: Add client-side throttling and queueing

---

**Note**: This is a living document. Update checkboxes as tasks are completed and add new items as discovered during implementation.
