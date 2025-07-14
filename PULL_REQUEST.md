# Pull Request: Test Case Generation + Config Cleanup for Eval Creator

## Summary

This PR adds test case and assertion generation capabilities to the eval creator UI, implements config cleanup to remove empty values, and includes various code quality improvements. The implementation has been simplified from the initial approach, with assertion generation now integrated directly into test case generation.

## Key Features

### 0. User Education & Onboarding (New)

- **Comprehensive Help System**: Collapsible help sections explaining all concepts
- **First-Visit Tutorial**: 5-step interactive onboarding for new users
- **Contextual Help**: Help text integrated throughout the UI
- **Quick Start Guide**: Clear workflow steps at the top of the page
- **Tutorial Button**: Re-access the onboarding anytime

### 1. Test Case & Assertion Generation

- **Generate One Button**: Single-click generation with loading indicator and tooltip explaining it includes assertions
- **Generate Multiple**: Dialog closes immediately, generation happens in background with progress bar on main page
- **Simplified Assertions**: Always generates 2 LLM-rubric assertions when enabled (no customization)
- **Clear All Button**: Text button with icon for removing all test cases (with confirmation dialog)
- **Progress Tracking**: Non-blocking progress bar on main page during generation
- **Provider Selection**: Optional provider override for generation
- **Fixed API Integration**: Properly calls separate endpoints for test cases and assertions
- **Per-Test-Case Assertions**: Each test case gets unique assertions generated specifically for its variables

### 2. Prompt Suggestions

- Added simple prompt examples accessible via "Load Example" button
- 6 essential templates with emoji icons for easy recognition
- Dark mode compatible dropdown menu
- Removed "Load Example" test case button in favor of Quick Generate

### 3. Code Quality Improvements

- **Fixed Memory Leaks**: Added proper cleanup for polling intervals
- **Removed Over-Engineering**: Deleted VirtualizedTestCasesTable, TestCasesSectionV2, useTestCasesReducer
- **Direct API Calls**: Removed unnecessary generation service layer
- **Component Consolidation**: Merged TestCasesActions into TestCasesSection

### 4. Architecture Improvements

- **Error Boundaries**: Added comprehensive error handling
- **Custom Hooks**: usePromptNormalization for handling various prompt formats
- **Type Safety**: Added type guards and removed unsafe type assertions
- **Accessibility**: ARIA labels and keyboard navigation support

### 5. Server-Side Enhancements

- **New API Endpoints**: `/api/generate/dataset` and `/api/generate/assertions`
- **Job Queue System**: Async generation with progress tracking
- **Rate Limiting**: 10 requests per minute per IP
- **Caching**: 30-minute TTL for generation results
- **Auto-cleanup**: Old jobs removed after 5 minutes

### 6. Config Cleanup

- Automatically removes empty arrays and objects from config
- Keeps config files clean and minimal
- Prevents saving unnecessary keys like `scenarios: []`, `env: {}`, `tests: []`
- Reduces config file size and improves readability
- Added migration to clean existing persisted configs
- YAML output now shows only meaningful configuration

## Test Instructions

### Prerequisites

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

### Testing Generation Features

1. **Test Case Generation**:
   - Navigate to `http://localhost:3002/eval-creator`
   - Add a prompt using "Load Example" button or create your own
   - Click "Quick Generate" for instant single test case
   - Or click "Generate Multiple" to configure options
   - ✅ Verify: Test cases are generated successfully
   - ✅ Verify: Progress indicator shows during generation

2. **Assertion Generation**:
   - Ensure you have at least one prompt configured
   - Click "Generate One" for instant test case with assertions
   - Or click "Generate Multiple" and check "Generate assertions"
   - ✅ Verify: Dialog closes immediately after clicking Generate
   - ✅ Verify: Progress bar appears on main page showing generation progress
   - ✅ Verify: Test cases are generated with 2 LLM-rubric assertions each
   - ✅ Verify: Assertions are automatically included when checkbox is enabled

3. **Clear All Test Cases**:
   - Generate several test cases
   - Click the "Clear All" button (appears when test cases exist)
   - ✅ Verify: Confirmation dialog appears
   - Click "Clear All" to confirm
   - ✅ Verify: All test cases are removed

4. **Clean Storage**:
   - Generate multiple test cases
   - Check the YAML output
   - ✅ Verify: No metadata fields appear in the config
   - ✅ Verify: Config only contains meaningful data

### Testing Prompt Suggestions

1. **Access Prompt Suggestions**:
   - Navigate to the Prompts section with no prompts added
   - Click the "Load Example" button with sparkle icon
   - ✅ Verify: Dropdown menu appears with 6 example prompts
   - ✅ Verify: Each prompt has an emoji icon
   - ✅ Verify: Clicking a prompt adds it to the prompts list
   - ✅ Verify: Works correctly in both light and dark modes

### Testing Performance Improvements

1. **Large Dataset Handling**:
   - Generate 50+ test cases
   - ✅ Verify: UI remains responsive during generation
   - ✅ Verify: Table scrolling is smooth
   - ✅ Verify: Actions (edit, delete, duplicate) are non-blocking

2. **Code Splitting**:
   - Open browser DevTools Network tab
   - Open dialogs for the first time
   - ✅ Verify: Dialog components load on-demand (lazy loading)

### Testing Accessibility

1. **Keyboard Navigation**:
   - Use Tab to navigate through the interface
   - ✅ Verify: All interactive elements are reachable
   - ✅ Verify: Table rows can be activated with Enter/Space
   - ✅ Verify: Focus indicators are visible

2. **Screen Reader Support**:
   - Enable a screen reader
   - ✅ Verify: All buttons and actions have descriptive labels
   - ✅ Verify: Generated content is announced appropriately

## Implementation Details

### Test Case Dialog Redesign

The Edit Test Case modal has been completely redesigned with a modern, user-friendly interface:

1. **Tabbed Interface**:
   - **Variables Tab**: Smart variable input with multiple modes (text, multiline, JSON)
   - **Assertions Tab**: Categorized assertions with templates and examples
   - **Preview Tab**: Live preview showing how the test case will work

2. **Variable Management**:
   - Input mode switching (text/multiline/JSON) with appropriate UI
   - Historical values from other test cases for quick reuse
   - JSON validation and formatting
   - Character count indicators
   - Contextual examples based on variable names

3. **Smart Assertions**:
   - Organized by categories (Text Matching, Structure & Format, Quality & Scoring, Performance, Safety)
   - Quick templates for common assertion patterns
   - Visual icons indicating assertion types
   - Helper text explaining each assertion
   - Variable chips for easy insertion

4. **Enhanced UX**:
   - Unsaved changes warning
   - Validation with clear error messages
   - Tab completion indicators
   - Keyboard shortcuts support
   - Responsive design

5. **Live Preview**:
   - Shows how variables will be applied to prompts
   - YAML configuration preview
   - Visual indicators for changed content

### New Components

- `GenerateTestCasesDialog`: Dialog for configuring and generating test cases with optional assertions
- `TestCasesTable`: Display component for test cases table
- `PromptSuggestionsSimple`: Dropdown menu for prompt examples
- `TestCaseDialogV2`: Redesigned test case creation/editing dialog with tabbed interface
- `VarsFormV2`: Enhanced variable input form with multiple modes and validation
- `AssertsFormV2`: Categorized assertion builder with templates and examples
- `TestCasePreview`: Live preview component showing test case in action
- `EvalProgressBar`: Progress indicator for running evaluations
- `ImprovedHeader`: Redesigned header with experience mode toggle
- `HelpText`: Conditional help components that respect user experience level
- `ErrorBoundary`: Error handling wrapper

### New Utilities & Hooks

- `cleanConfig`: Removes empty arrays/objects from configuration
- `usePromptNormalization`: Handles various prompt formats
- `useAssertionTracking`: Tracks which assertions were generated

### API Endpoints

- `/api/generate/dataset`: Generate test cases (async)
- `/api/generate/assertions`: Generate assertions (async)
- `/api/generate/job/{id}`: Check generation job status

### Removed Components (Simplification)

- ~~TestCasesSectionV2~~ - Duplicate implementation
- ~~VirtualizedTestCasesTable~~ - Premature optimization
- ~~useTestCasesReducer~~ - Over-engineered state management
- ~~generation.ts service~~ - Unnecessary abstraction layer
- ~~TestCasesActions~~ - Merged into TestCasesSection
- ~~GenerateAssertionsDialog~~ - Integrated into GenerateTestCasesDialog

## Breaking Changes

None - All changes are backward compatible.

## Performance & Quality

- Fixed memory leaks in polling intervals
- Proper cleanup on component unmount
- No TypeScript errors
- All linting checks pass
- Simplified architecture for better maintainability

## Checklist

- [x] Code follows project style guidelines
- [x] All tests pass (`npm test`)
- [x] TypeScript compilation successful (`npm run tsc`)
- [x] Linter passes (`npm run lint`)
- [x] Code is properly formatted (`npm run format`)
- [x] Memory leaks fixed with proper cleanup
- [x] Backward compatibility maintained
- [x] No console.log statements in production code
- [x] API error handling implemented
- [x] Accessibility labels added to interactive elements

## Notes for Reviewers

- The initial implementation included visual indicators for generated content, but these were removed for simplicity
- Several over-engineered components were deleted after the initial implementation
- Assertion generation was simplified to always use LLM-rubric with max 2 assertions
- PI assertions require WITHPI_API_KEY environment variable (future enhancement)
- Focus was on simplicity and maintainability over feature richness
- All async operations have proper cleanup to prevent memory leaks
- Fixed critical issue where assertion generation wasn't working due to API mismatch
- Removed console.error statements from production code
- Fixed issue where same assertions were applied to all test cases - now generates unique per test case
- Extracted common generation logic to avoid code duplication
- Added clear tooltips and loading states to prevent user confusion
- Added comprehensive help system to address user confusion about concepts
- Onboarding tutorial shows on first visit only (tracked in localStorage)
