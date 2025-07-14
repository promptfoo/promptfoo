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

### Quantitative Metrics

- [ ] Users can generate test cases with < 3 clicks
- [ ] Generation completes within reasonable time (< 30s for typical use)
- [ ] Generated content quality matches or exceeds manual creation
- [ ] No regression in existing eval creator functionality
- [ ] < 5% data loss rate (auto-save effectiveness)
- [ ] 80% of users complete first eval within 5 minutes
- [ ] < 2s page load time on average hardware
- [ ] Zero accessibility violations (WCAG 2.1 AA)

### Qualitative Metrics

- [ ] Positive user feedback on generation features
- [ ] Users report feeling "confident" using the tool
- [ ] Reduced support tickets about "how to create evals"
- [ ] Users successfully create complex evals without documentation
- [ ] Power users adopt keyboard shortcuts and advanced features

### Business Metrics

- [ ] 50% reduction in time to create first eval
- [ ] 2x increase in evals created per user
- [ ] 30% of users use generation features
- [ ] 90% task completion rate for new users
- [ ] NPS score > 50 for eval creator

## Completed Enhancements (2025-07-13, Updated 2025-07-14)

### User Education & Onboarding (Completed 2025-07-14)

- [x] Created comprehensive help system with collapsible explanations
  - PromptsHelp: Explains what prompts are and how variables work
  - ProvidersHelp: Clarifies the role of AI providers
  - TestCasesHelp: Details test cases and assertions
  - EvaluationHelp: Explains how evaluations work
  - WorkflowHelp: Quick start guide with numbered steps
- [x] Added first-visit onboarding dialog
  - 5-step interactive tutorial
  - Explains core concepts progressively
  - Can be re-accessed via Tutorial button
  - Remembers completion in localStorage
- [x] Integrated contextual help throughout UI
  - Help sections appear above relevant components
  - Collapsible to avoid clutter for experienced users
  - Links to documentation for deeper learning

### Clean Generation Implementation

- [x] Removed all metadata tracking for generated content
  - Test cases are generated without any metadata overhead
  - No visual indicators or tracking for generated content
  - Simplified storage and cleaner configuration files
- [x] Removed generation tracking for assertions
  - Assertions are generated cleanly without metadata
  - No visual indicators for generated assertions
  - Simpler implementation with less overhead

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

### Metadata Storage Optimization (Completed 2025-07-13, Removed 2025-07-14)

- [x] Completely removed metadata tracking
  - No metadata fields added to generated content
  - Test cases and assertions are generated cleanly
  - Zero storage overhead for tracking generation
- [x] Simplified implementation
  - Removed all visual indicators
  - Cleaner codebase without metadata management

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

### Quick Generation Feature (Completed 2025-07-13)

- [x] Added "Quick Generate" button for instant test case creation
  - Generates single test case without opening configuration dialog
  - Uses default settings (1 persona, 1 test case)
  - Much faster workflow for quick iterations
- [x] Updated button layout
  - "Quick Generate" - small text button for single test case
  - "Generate Multiple" - outlined button opens configuration dialog
  - Better visual hierarchy and clearer intent

### Config Cleanup (Completed 2025-07-14)

- [x] Remove empty arrays and objects from config
  - Created cleanConfig utility to filter out empty values
  - Applied to setConfig, updateConfig, reset, and getTestSuite
  - Removes keys like scenarios: [], extensions: [], derivedMetrics: [], env: {}, tests: [], evaluateOptions: {}, defaultTest: {}
  - Keeps only meaningful data in the config
  - Added cleanConfig to YamlEditor's formatYamlWithSchema function
  - Added migration to clean existing persisted configs
  - YAML output now shows only fields with actual values

### UPDATED: Next Priority Tasks (Based on Critical Analysis)

#### Immediate Priorities (Biggest Impact, Lowest Effort)

1. **Auto-Save & Data Loss Prevention**
   - [ ] Save to localStorage on every change
   - [ ] Implement undo/redo with Ctrl+Z/Ctrl+Y
   - [ ] Add "unsaved changes" warning before navigation
   - [ ] Session recovery after browser crash

2. **Test Case Management Quick Wins**
   - [ ] Inline editing of variables in table (click to edit)
   - [ ] Keyboard shortcuts (Delete, Ctrl+D for duplicate)
   - [ ] Search/filter test cases and prompts
   - [ ] Syntax highlighting for {{variables}} in prompts

3. **Import/Export Functionality**
   - [ ] CSV import for bulk test cases
   - [ ] JSON export/import for full configs
   - [ ] "Copy as CLI command" button
   - [ ] Excel template download for test cases

4. **Better Empty States & Onboarding**
   - [ ] Interactive tutorials for each section
   - [ ] Example templates with real use cases
   - [ ] "Generate from description" - describe your app, get test cases
   - [ ] Video walkthroughs embedded in UI

#### Medium Priority (High Value, Medium Effort)

5. **Generation Intelligence**
   - [ ] Preview generated content before accepting
   - [ ] Regenerate individual test cases
   - [ ] Coverage analysis - "You're missing edge cases for X"
   - [ ] Smart variable value suggestions

6. **Visual Assertion Builder**
   - [ ] Drag-drop assertion builder (no code)
   - [ ] Assertion templates library
   - [ ] Natural language to assertion conversion
   - [ ] Test assertions against sample outputs

7. **Cost & Performance Insights**
   - [ ] Cost estimation before running
   - [ ] Provider health status indicators
   - [ ] Performance comparison across providers
   - [ ] Smart provider selection based on requirements

#### Previously Planned (Still Important)

8. **Generation History Tracking**
   - Store generation batches in database (persistent storage)
   - Allow viewing past generations
   - Support regenerating with same settings

9. **Batch Assertion Generation**
   - Update GenerateAssertionsDialog to support multiple test case selection
   - Modify API to handle batch generation
   - Show progress for each test case

10. **Generation Templates/Presets**

- Create preset generation configurations (beyond prompt suggestions)
- Allow saving custom templates
- Quick-apply common patterns

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

## Critical Analysis: Further Improvements (Added 2025-07-14)

### Executive Summary

After implementing the initial improvements, the eval creator is significantly better but still has room for enhancement. The biggest opportunities are:

1. **Preventing Data Loss**: Auto-save and undo/redo are critical missing features
2. **Power User Features**: Keyboard shortcuts, bulk operations, and inline editing would dramatically speed up workflows
3. **Import/Export**: Users need to bring existing data and share configurations
4. **Visual Tools**: No-code assertion builders and drag-drop interfaces would lower the barrier to entry
5. **Intelligence**: The tool should be smart enough to suggest test cases, detect coverage gaps, and optimize prompts

The key insight is that we've solved the "getting started" problem, but haven't yet addressed the "becoming productive" and "scaling up" challenges that users face.

### Immediate High-Impact Improvements

#### 1. Test Case Management UX

- [ ] **Drag & Drop Reordering**: Allow users to reorder test cases by dragging
- [ ] **Bulk Operations**: Select multiple test cases for delete/duplicate/edit
- [ ] **Keyboard Shortcuts**: Cmd+D to duplicate, Delete key to remove, etc.
- [ ] **Inline Editing**: Click on variable values to edit directly in the table
- [ ] **Import/Export**: CSV/JSON import for test cases from existing data
- [ ] **Smart Defaults**: Pre-fill common variable patterns (emails, names, etc.)

#### 2. Generation Intelligence

- [ ] **Preview Before Accept**: Show generated test cases in preview mode
- [ ] **Regenerate Individual**: Re-roll specific test cases if not satisfied
- [ ] **Smart Variable Detection**: Auto-suggest test cases based on detected variables
- [ ] **Coverage Analysis**: Highlight which edge cases aren't covered
- [ ] **Duplicate Detection**: Warn about similar/redundant test cases

#### 3. Assertion Builder 2.0

- [ ] **Visual Assertion Builder**: Drag-drop UI for building complex assertions
- [ ] **Assertion Library**: Pre-built assertions for common patterns
- [ ] **Assertion Preview**: Test assertions against sample outputs
- [ ] **Assertion Groups**: Save and reuse assertion sets across projects
- [ ] **Natural Language**: "Output should mention X and be positive" → assertion

#### 4. Provider Experience

- [ ] **Cost Calculator**: Show estimated cost before running evaluation
- [ ] **Provider Comparison**: Side-by-side feature/pricing comparison
- [ ] **Health Status**: Real-time status indicators for each provider
- [ ] **Smart Routing**: Auto-select cheapest provider that meets requirements
- [ ] **Fallback Chains**: Define backup providers if primary fails

### Medium-Term Enhancements

#### 5. Collaboration Features

- [ ] **Share Links**: Generate shareable links for eval configs
- [ ] **Comments**: Add comments to test cases for team context
- [ ] **Version History**: Track changes with git-like diffs
- [ ] **Approval Workflow**: Require approval for production evals
- [ ] **Team Templates**: Shared prompt/assertion libraries

#### 6. Developer Power Tools

- [ ] **CLI Export**: "Copy as CLI command" button
- [ ] **API Code Gen**: Generate API integration code in multiple languages
- [ ] **CI/CD Templates**: GitHub Actions, Jenkins, etc. configs
- [ ] **IDE Extensions**: VS Code extension for eval creation
- [ ] **Webhook Integration**: Notify external systems of eval results

#### 7. Analytics & Insights

- [ ] **Variable Usage**: Highlight unused variables in prompts
- [ ] **Test Coverage**: Visual coverage map of test scenarios
- [ ] **Performance Trends**: Track eval performance over time
- [ ] **Failure Analysis**: Common failure patterns and suggestions
- [ ] **A/B Testing**: Built-in experiment framework for prompts

### Long-Term Vision

#### 8. AI-Powered Assistance

- [ ] **Auto-Complete Prompts**: AI suggests prompt completions
- [ ] **Test Case AI**: "Generate edge cases for this prompt"
- [ ] **Assertion AI**: "What should I test for this use case?"
- [ ] **Optimization AI**: "How can I improve this prompt?"
- [ ] **Anomaly Detection**: Flag unusual eval results automatically

#### 9. Enterprise Features

- [ ] **RBAC**: Role-based access control for teams
- [ ] **Audit Logs**: Complete history of who did what when
- [ ] **Compliance**: SOC2, HIPAA compliance features
- [ ] **Private Deployment**: Self-hosted eval creator
- [ ] **SSO Integration**: SAML, OAuth enterprise auth

#### 10. Accessibility & Inclusivity

- [ ] **Screen Reader**: Full WCAG 2.1 AA compliance
- [ ] **Voice Control**: "Add test case with email john@example"
- [ ] **Multi-Language**: Internationalization support
- [ ] **Offline Mode**: Work without internet, sync later
- [ ] **Mobile App**: Native mobile experience for on-the-go

### Quick Wins (Do These First!)

1. **Auto-Save**: Save to localStorage every change (prevent data loss)
2. **Undo/Redo**: Ctrl+Z/Ctrl+Y support for all actions
3. **Better Empty States**: Helpful messages when sections are empty
4. **Loading Skeletons**: Better loading states than spinners
5. **Tooltips Everywhere**: Hover any UI element for help
6. **Search/Filter**: Search through test cases and prompts
7. **Syntax Highlighting**: Color code variables in prompts
8. **Copy Test Case**: One-click duplicate with edit
9. **Recent Files**: Quick access to recent configurations
10. **Hotkeys Guide**: "?" to show keyboard shortcuts

### User Research Needed

- [ ] User interviews: What's most painful about current eval creation?
- [ ] Usage analytics: Which features are used most/least?
- [ ] A/B tests: Test different UI approaches
- [ ] Competitor analysis: What do similar tools do well?
- [ ] Accessibility audit: Get feedback from users with disabilities

## Critical Issues from UX Audit (2025-07-14)

### 🚨 Performance Issues (URGENT)

1. **Virtualization for Test Cases Table**
   - [ ] Implement react-window for virtual scrolling
   - [ ] Test cases table freezes with 100+ items
   - [ ] Each row creates multiple DOM nodes (buttons, dialogs)
   - [ ] Memory usage grows linearly with test case count

2. **Component Re-rendering**
   - [ ] Add React.memo to expensive components
   - [ ] Memoize computed values with useMemo
   - [ ] Debounce auto-save operations
   - [ ] Lazy load heavy components (YamlEditor, dialogs)

### 🎯 User Experience Improvements

3. **Simplify Provider Selection**
   - [ ] Show only top 5 providers initially
   - [ ] Add "Show more providers" expandable section
   - [ ] Group providers by tier (Recommended, Popular, Advanced, Local)
   - [ ] Add search/filter for providers
   - [ ] Show provider recommendations based on detected API keys

4. **Mobile Experience**
   - [ ] Convert test cases table to card layout on mobile
   - [ ] Use bottom sheets instead of dialogs on mobile
   - [ ] Fix button overflow in header (responsive stacking)
   - [ ] Ensure touch targets are at least 44px
   - [ ] Add swipe gestures for common actions

5. **Missing User Workflow Features**
   - [ ] Add "What's next?" guidance after each step
   - [ ] Show evaluation preview before running
   - [ ] Add 3-4 template configurations for quick start
   - [ ] Implement inline tips during first use
   - [ ] Add keyboard shortcuts overlay (? key)

### 🐛 Quality & Stability Issues

6. **Memory Leaks & Performance**
   - [ ] Clean up event listeners properly
   - [ ] Fix race conditions in async operations
   - [ ] Prevent YAML editor from getting out of sync
   - [ ] Add proper loading states for all async operations

7. **Error Handling**
   - [ ] Show user-friendly error messages (not raw API responses)
   - [ ] Add retry mechanisms for failed operations
   - [ ] Implement proper error boundaries
   - [ ] Add fallback UI for error states

8. **Accessibility**
   - [ ] Add proper ARIA labels to all interactive elements
   - [ ] Implement focus trapping in dialogs
   - [ ] Ensure color contrast meets WCAG standards
   - [ ] Add skip navigation links
   - [ ] Test with screen readers

### ✨ Quick Wins

9. **Search & Filter**
   - [ ] Add search box for test cases
   - [ ] Add search box for prompts
   - [ ] Highlight matching text in search results

10. **Better Empty States**
    - [ ] Show helpful guidance when no prompts/providers/tests
    - [ ] Add quick action buttons in empty states
    - [ ] Include examples users can try

### 📊 Code Quality

11. **Refactoring Needs**
    - [ ] Extract provider lists to config files
    - [ ] Split EvaluateTestSuiteCreator (278 lines) into smaller components
    - [ ] Standardize error handling patterns
    - [ ] Remove 'any' types in provider selector
    - [ ] Extract constants and magic numbers

---

**Note**: This is a living document. Update checkboxes as tasks are completed and add new items as discovered during implementation.
