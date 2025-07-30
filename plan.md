# Plan: Add ConversationRelevancyTemplate and Update Deepeval Conversational Relevancy Metric

## Current State

1. **PR #2130** has been checked out and main branch merged with conflicts resolved
2. The existing implementation has:
   - `deepeval.ts` matcher with `matchesConversationRelevance` function
   - `deepeval.ts` assertion handler with `handleConversationRelevance` function
   - Basic implementation but missing the template-based approach shown in the DeepEval documentation

## Tasks to Complete

### 1. Add ConversationRelevancyTemplate Class

Create a new template class that follows the DeepEval documentation structure with:
- `generate_verdicts` method for evaluating sliding windows
- `generate_reason` method for summarizing irrelevancies
- Proper typing imports (`from typing import List, Dict`)

### 2. Update the Matcher Implementation

Modify `src/external/matchers/deepeval.ts` to:
- Use the template-based approach for generating prompts
- Implement sliding window evaluation logic
- Handle multiple verdicts and aggregate scores properly

### 3. Update the Assertion Handler

Ensure `src/external/assertions/deepeval.ts`:
- Properly handles sliding windows
- Calculates scores based on relevant windows
- Provides meaningful failure reasons

### 4. Add Tests

Create comprehensive tests for:
- Single message evaluation
- Multi-turn conversation evaluation with sliding windows
- Edge cases (empty conversations, single turn, etc.)
- Threshold handling

### 5. Update Documentation

Add documentation for the conversational relevancy metric:
- Create `/site/docs/configuration/expected-outputs/model-graded/conversation-relevance.md`
- Update index files to include references
- Add examples and use cases

### 6. Ensure Proper Citation

- Verify all code references DeepEval properly
- Include license information where appropriate
- Add links to original documentation

## Implementation Notes

- The template approach uses a more sophisticated prompt structure
- Need to handle both verdict generation and reason generation separately
- Sliding window logic is crucial for multi-turn conversations
- Score calculation: relevant windows / total windows