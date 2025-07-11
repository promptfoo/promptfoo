# Research-Rubric Implementation Plan

## Implementation Summary

The `research-rubric` assertion type has been implemented with the following features:

- ✅ Core assertion handler and matcher functions
- ✅ Web search integration for general accuracy verification
- ✅ Support for verifying any type of claim (facts, calculations, current info, citations)
- ✅ Support for OpenAI responses, Google/Gemini, and xAI providers
- ✅ Comprehensive documentation and examples
- ✅ Unit tests for assertion handler
- ✅ UI integration and CSV support

**Status**: Implementation redesigned to be a general-purpose verification tool. Complete except for integration tests and blog post.

## Overview

Implement a new `research-rubric` assertion type that can verify the accuracy of any output by using web search capabilities of supported LLM models. This goes beyond subjective evaluation to verify:

- Real-time information (weather, stock prices, current events)
- Mathematical calculations and facts
- Citations and references
- Any other verifiable claims

## Core Components

### 1. New Assertion Type: `research-rubric`

- **Location**: `src/assertions/researchRubric.ts`
- **Purpose**: Verify accuracy of outputs using web search
- **Key Features**:
  - Extracts all verifiable claims from outputs
  - Uses provider web search to verify each claim
  - Returns verification results with confidence levels
  - Falls back to standard llm-rubric if no web search available

### 2. Research Agent Matcher

- **Location**: `src/matchers.ts` - add `matchesResearchRubric`
- **Functionality**:
  - Extract verifiable claims (not just citations)
  - Orchestrate web searches for verification
  - Compile results with confidence scoring
  - Support different types of claims (facts, current info, calculations, citations)

### 3. Default Research Provider

- **Location**: `src/providers/defaults.ts`
- **Purpose**: Auto-select best provider for research tasks
- **Priority Order**:
  1. OpenAI responses API with web_search tool
  2. Google/Gemini models with googleSearch
  3. xAI models with search_parameters
  4. Fallback to regular llm-rubric if no search available

### 4. Provider Enhancements

- **OpenAI**: Already supports web_search via responses API
- **Google/Gemini**: Already supports googleSearch/googleSearchRetrieval
- **xAI**: Already supports search_parameters
- **Anthropic**: Would need external tool integration (future enhancement)

## Implementation Tasks

### Phase 1: Core Infrastructure

- [x] Create `src/assertions/researchRubric.ts`
  - [x] Implement `handleResearchRubric` function
  - [x] Support both string and object rubric values
  - [x] Handle threshold parameter like llm-rubric
- [x] Update `src/assertions/index.ts`
  - [x] Register `research-rubric` handler
  - [x] Add to assertion type registry
- [x] Update `src/types/index.ts`
  - [x] Add `research-rubric` to BaseAssertionTypes
  - [x] Update schema definitions

### Phase 2: Matcher Implementation

- [x] Create `matchesResearchRubric` in `src/matchers.ts`
  - [x] Citation extraction logic
  - [x] Web search orchestration
  - [x] Result compilation and scoring
  - [x] Support for different citation formats (APA, MLA, etc.)
- [x] Add research prompt templates to `src/prompts/index.ts`
  - [x] Citation extraction prompt
  - [x] Verification prompt
  - [x] Evidence evaluation prompt

### Phase 3: Default Provider Setup

- [x] Update `src/providers/defaults.ts`
  - [x] Add `researchProvider` to DefaultProviders interface
  - [x] Implement provider selection logic based on availability
  - [x] Handle fallback scenarios
- [x] Create provider capability detection
  - [x] Check for web search support
  - [ ] Validate API credentials

### Phase 4: Documentation

- [x] Create `site/docs/configuration/expected-outputs/model-graded/research-rubric.md`
  - [x] Overview and use cases
  - [x] Configuration examples
  - [x] Supported providers
  - [x] Best practices
- [x] Update existing documentation
  - [x] Add to assertion type list in index
  - [ ] Update provider docs with research capabilities
  - [x] Add comparison with llm-rubric
  - [ ] caviat the research-rubric is not a replacement for llm-rubric, it is a complement to it. costs more

### Phase 5: Examples

- [x] Create `examples/research-verification/`
  - [x] Real-time information verification (weather, current events)
  - [x] Mathematical calculation checking
  - [x] Citation and reference verification
  - [x] Mixed content verification
  - [x] Multiple provider comparison
- [x] Example configurations:
  - [x] `promptfooconfig.yaml` - comprehensive examples
  - [x] `promptfooconfig.facts.yaml` - fact checking focus

### Phase 6: Testing

- [x] Unit tests in `test/assertions/researchRubric.test.ts`
  - [x] Test assertion handler
  - [x] Mock web search responses
  - [x] Error handling scenarios
- [ ] Integration tests in `test/matchers.test.ts`
  - [ ] Test matchesResearchRubric
  - [ ] Provider integration
  - [ ] Edge cases
- [ ] End-to-end tests
  - [ ] Real provider testing (with mocks)
  - [ ] Multi-provider comparison

### Phase 7: UI Integration

- [x] Update `src/app/src/pages/eval-creator/components/AssertsForm.tsx`
  - [x] Add `research-rubric` to assertion types
  - [ ] Add configuration UI
- [x] Update CSV parsing in `src/csv.ts`
  - [x] Support `research-rubric:` prefix
  - [x] Handle configuration parsing

### Phase 8: Blog Post - "When LLM-Rubric Is Not Enough"

- [ ] **Location**: `site/blog/when-llm-rubric-is-not-enough.md`
- [ ] **Target Audience**: ML engineers, researchers, and teams building LLM applications
- [ ] **Publication timing**: Coordinate with feature release

#### Blog Post Outline:

1. **Introduction & Hook**
   - [ ] Start with real scenarios:
     - LLM confidently states wrong weather temperature
     - AI gives outdated stock prices
     - Model cites non-existent papers
   - [ ] The accuracy problem in AI-generated content
   - [ ] Why subjective evaluation isn't enough

2. **The Limitations of LLM-Rubric**
   - [ ] What llm-rubric does well (subjective evaluation, style, coherence)
   - [ ] Where it fails:
     - Real-time information (weather, news, prices)
     - Mathematical accuracy
     - Factual verification
     - Citation checking
   - [ ] Real examples of confident but wrong outputs getting high scores
   - [ ] The "judge" can't verify facts without tools

3. **Introducing Research-Rubric: Web Search for Accuracy**
   - [ ] Core concept: Augment LLM judgment with web search verification
   - [ ] Beyond citations: verify any claim or fact
   - [ ] How it works: Extract claims → Search → Verify → Score
   - [ ] The power of web-enabled models (GPT-4o, Gemini, Grok)
   - [ ] Architecture diagram showing the verification flow

4. **Technical Deep Dive**
   - [ ] Code examples showing migration from llm-rubric to research-rubric
   - [ ] Provider capabilities comparison table
   - [ ] Performance considerations and optimization strategies
   - [ ] Cost analysis (search API calls vs. value of verification)

5. **Real-World Use Cases**
   - [ ] Real-time information: Weather, stock prices, sports scores
   - [ ] Mathematical verification: Calculations, conversions, formulas
   - [ ] Academic integrity: Paper citations, research claims
   - [ ] Medical accuracy: Drug interactions, dosages, treatments
   - [ ] Legal precision: Case citations, statute references
   - [ ] News fact-checking: Current events, statistics
   - [ ] Technical accuracy: API docs, code examples

6. **Implementation Guide**
   - [ ] Basic configuration example
   - [ ] Advanced patterns (custom verification logic)
   - [ ] Best practices for prompt engineering
   - [ ] Handling edge cases and ambiguous citations

7. **Performance Comparison**
   - [ ] Side-by-side evaluation: llm-rubric vs research-rubric
   - [ ] Accuracy metrics on hallucination detection
   - [ ] Speed and cost trade-offs
   - [ ] When to use each approach

8. **Future Directions**
   - [ ] Multi-source verification
   - [ ] Confidence scoring
   - [ ] Custom search providers
   - [ ] Integration with knowledge bases

9. **Conclusion & Call to Action**
   - [ ] The importance of verifiable AI outputs
   - [ ] How to get started with research-rubric
   - [ ] Link to documentation and examples
   - [ ] Community feedback and contributions

#### Blog Post Assets:

- [ ] Create visual diagrams:
  - [ ] Architecture flow diagram
  - [ ] Provider capability matrix
  - [ ] Performance comparison charts
- [ ] Prepare code snippets:
  - [ ] Before/after configuration examples
  - [ ] Real citation verification examples
  - [ ] Custom verification logic
- [ ] Gather metrics:
  - [ ] Benchmark results
  - [ ] Cost analysis data
  - [ ] Real-world case studies

#### Blog Post SEO & Distribution:

- [ ] Keywords: LLM evaluation, hallucination detection, citation verification, llm-as-judge
- [ ] Meta description focusing on solving hallucination problems
- [ ] Social media snippets for Twitter/LinkedIn
- [ ] Consider cross-posting to:
  - [ ] HackerNews
  - [ ] r/MachineLearning
  - [ ] AI/ML newsletters
  - [ ] Medium/Dev.to
  - [ ] Linkedin Post

## Technical Considerations

### Design Update Summary

The `research-rubric` has been redesigned from a citation-focused tool to a general-purpose accuracy verification tool that can:

- Verify real-time information (weather, stock prices, news)
- Check mathematical calculations
- Validate historical facts and statistics
- Verify citations and academic references
- Confirm any other verifiable claims

This makes it much more broadly useful than just checking if papers exist.

### Provider-Specific Implementation Details

#### OpenAI Responses API

- Use `tools: [{ type: 'web_search' }]` configuration
- Parse search results from response metadata
- Handle rate limits and costs

#### Google/Gemini

- Use `tools: [{ googleSearch: {} }]` configuration
- Access `groundingMetadata` from response
- Consider search grounding requirements

#### xAI/Grok

- Use `search_parameters: { mode: 'on', return_citations: true }`
- Parse citations from response
- Handle live search limitations

### Scoring Algorithm

1. Extract all citations/claims from output
2. For each citation:
   - Search for verification
   - Score based on evidence found
   - Weight by citation importance
3. Calculate overall score:
   - Percentage of verified citations
   - Quality of evidence
   - Handling of unverifiable claims

### Error Handling

- Provider doesn't support web search
- Search API rate limits
- Network failures
- Ambiguous citations
- Timeout handling

### Performance Optimizations

- Batch citation searches when possible
- Cache search results
- Parallel search execution
- Smart timeout management

## Future Enhancements

1. **Anthropic Integration**: Add web search via external tools/MCP
2. **Custom Search Providers**: Support Google Custom Search, Bing, etc.
3. **Advanced Citation Formats**: Handle DOIs, arXiv IDs, ISBN
4. **Confidence Scoring**: Return confidence levels for verifications
5. **Source Ranking**: Prioritize authoritative sources
6. **Multi-language Support**: Verify citations in different languages

## Success Criteria

- [ ] Research-rubric assertion type is fully functional
- [ ] Works with OpenAI, Google, and xAI providers
- [ ] Comprehensive documentation and examples
- [ ] > 90% test coverage
- [ ] Performance is acceptable (<10s for typical verification)
- [ ] Graceful degradation when search unavailable

## Notes

- Priority is OpenAI responses API since it has the most mature web search
- Consider cost implications of web search APIs
- May need rate limiting for expensive operations
- Should provide clear feedback about what was/wasn't verified
