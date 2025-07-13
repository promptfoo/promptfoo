# Eval Creator - Dataset & Assertion Generation Implementation Plan

## Overview
This document outlines the implementation plan for adding dataset and assertion generation capabilities to the eval creator UI. The goal is to seamlessly integrate these powerful features while maintaining the existing user workflow.

## Phase 1: Dataset Generation (Priority 1)

### 1.1 UI Components
- [ ] Create `GenerateTestCasesDialog.tsx` component in `/src/app/src/pages/eval-creator/components/`
  - [ ] Dialog with generation settings (personas, test cases per persona, instructions)
  - [ ] Provider selection dropdown (optional, defaults to synthesis provider)
  - [ ] Preview section showing prompts and variables
  - [ ] Progress indicator component
  - [ ] Error handling and retry mechanism

- [ ] Update `TestCasesSection.tsx`
  - [ ] Add "Generate Test Cases" button next to existing buttons
  - [ ] Add state management for generation dialog
  - [ ] Handle generated test cases and merge with existing ones
  - [ ] Add visual indicator for generated vs manual test cases

### 1.2 Server Routes
- [ ] Enhance `/api/dataset/generate` endpoint in `src/server/server.ts`
  - [ ] Add support for async operations (return job ID)
  - [ ] Add validation for request parameters
  - [ ] Add proper error handling and logging
  - [ ] Support provider selection

- [ ] Create new route handler in `src/server/routes/generate.ts`
  - [ ] Move generation logic to dedicated route file
  - [ ] Add job queue support similar to eval jobs
  - [ ] Implement progress tracking

### 1.3 State Management
- [ ] Update `src/app/src/stores/evalConfig.ts`
  - [ ] Add generation history tracking
  - [ ] Add methods for managing generated test cases
  - [ ] Support undo/redo for generation actions

### 1.4 API Integration
- [ ] Create `src/app/src/services/generation.ts`
  - [ ] API client for dataset generation
  - [ ] Job polling logic
  - [ ] Error handling and retry logic

## Phase 2: Assertion Generation (Priority 2)

### 2.1 UI Components
- [ ] Create `GenerateAssertionsDialog.tsx` component
  - [ ] Dialog with assertion generation settings
  - [ ] Assertion type selector (pi, g-eval, llm-rubric)
  - [ ] Number of assertions slider
  - [ ] Custom instructions textarea
  - [ ] Preview of context (prompts + selected test case)

- [ ] Update `TestCaseDialog.tsx`
  - [ ] Add "Generate Assertions" button in assertions section
  - [ ] Handle both defaultTest and per-test assertion generation

- [ ] Update `AssertsForm.tsx`
  - [ ] Add generation trigger button
  - [ ] Support bulk assertion addition
  - [ ] Visual indicators for generated assertions

### 2.2 Server Routes
- [ ] Create `/api/assertions/generate` endpoint
  - [ ] Implement assertion synthesis integration
  - [ ] Support async job pattern
  - [ ] Add proper validation and error handling
  - [ ] Support different assertion types

- [ ] Update `src/server/routes/generate.ts`
  - [ ] Add assertion generation handler
  - [ ] Reuse job infrastructure from dataset generation

### 2.3 Integration
- [ ] Extend generation service for assertions
  - [ ] API client methods for assertion generation
  - [ ] Type definitions for assertion generation options
  - [ ] Progress tracking

## Phase 3: Polish & Enhancements (Priority 3)

### 3.1 User Experience
- [ ] Add generation templates
  - [ ] Common testing scenarios (QA, safety, performance)
  - [ ] Industry-specific templates
  - [ ] Custom template creation

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
- [ ] Add caching layer
  - [ ] Cache generation results
  - [ ] Implement cache invalidation
  - [ ] Offline generation queue

- [ ] Rate limiting
  - [ ] Client-side request throttling
  - [ ] Server-side rate limits
  - [ ] Graceful degradation

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

## Open Questions

1. Should we support custom generation prompts/templates?
2. How to handle provider API key management for generation?
3. Should generated content be marked/tagged differently?
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