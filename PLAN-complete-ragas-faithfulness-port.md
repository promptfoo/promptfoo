# Complete Plan: Port RAGAS Faithfulness Implementation

## Current State Analysis

### What Promptfoo Already Has

1. **RAGAS Prompts**: Already integrated in `src/external/prompts/ragas.ts`
   - `CONTEXT_FAITHFULNESS_LONGFORM` - Statement generation
   - `CONTEXT_FAITHFULNESS_NLI_STATEMENTS` - Verdict evaluation

2. **Current Usage**: Used in `src/matchers.ts` for faithfulness calculation
   - Uses `splitIntoSentences()` instead of LLM-based statement generation
   - Uses free-form text parsing instead of structured JSON output
   - No explicit error handling for malformed responses

### What's Missing from Full RAGAS Implementation

1. **Structured Output**: RAGAS expects JSON with explicit `verdict: 0/1` fields
2. **Two-Step Process**: RAGAS uses separate LLM calls for statement generation and verdict evaluation
3. **Proper Error Handling**: RAGAS returns `np.nan` for invalid cases
4. **Validation**: RAGAS validates statement/verdict count matching
5. **Type Safety**: RAGAS uses Pydantic models for structured data

## Complete Port Plan

### Phase 1: Type Definitions (Align with RAGAS)

```typescript
// src/types/ragas.ts (new file)
export interface StatementGeneratorInput {
  question: string;
  answer: string;
}

export interface StatementGeneratorOutput {
  statements: string[];
}

export interface StatementFaithfulnessAnswer {
  statement: string;
  reason: string;
  verdict: 0 | 1; // 0 = not faithful, 1 = faithful
}

export interface NLIStatementOutput {
  statements: StatementFaithfulnessAnswer[];
}

export interface FaithfulnessResult {
  score: number;
  verdicts: StatementFaithfulnessAnswer[];
  statements: string[];
  isValid: boolean;
  error?: string;
}
```

### Phase 2: Statement Generation (Port RAGAS Approach)

```typescript
// src/ragas/statementGenerator.ts (new file)
import { StatementGeneratorInput, StatementGeneratorOutput } from '../types/ragas';
import { callProviderWithContext } from '../util';
import { CONTEXT_FAITHFULNESS_LONGFORM } from '../external/prompts/ragas';

export async function generateStatements(
  question: string,
  answer: string,
  provider: ApiProvider,
  vars?: Record<string, any>,
): Promise<StatementGeneratorOutput> {
  const prompt = await renderLlmRubricPrompt(CONTEXT_FAITHFULNESS_LONGFORM, {
    question,
    answer,
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(provider, prompt, 'ragas-statement-generation', {
    question,
    answer,
    ...(vars || {}),
  });

  if (resp.error || !resp.output) {
    throw new Error(resp.error || 'Statement generation failed');
  }

  // Try to parse as JSON first (RAGAS format)
  try {
    const parsed = JSON.parse(resp.output);
    if (parsed.statements && Array.isArray(parsed.statements)) {
      return { statements: parsed.statements };
    }
  } catch (e) {
    // Fallback to legacy text parsing
    const statements = splitIntoSentences(resp.output);
    return { statements };
  }

  // If JSON parsing succeeded but format is wrong, fallback
  const statements = splitIntoSentences(resp.output);
  return { statements };
}
```

### Phase 3: Verdict Evaluation (Port RAGAS Approach)

```typescript
// src/ragas/verdictEvaluator.ts (new file)
import { NLIStatementOutput, StatementFaithfulnessAnswer } from '../types/ragas';
import { CONTEXT_FAITHFULNESS_NLI_STATEMENTS } from '../external/prompts/ragas';

export async function evaluateVerdicts(
  context: string,
  statements: string[],
  provider: ApiProvider,
  vars?: Record<string, any>,
): Promise<NLIStatementOutput> {
  if (statements.length === 0) {
    return { statements: [] };
  }

  const prompt = await renderLlmRubricPrompt(CONTEXT_FAITHFULNESS_NLI_STATEMENTS, {
    context,
    statements: statements.join('\n'),
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(provider, prompt, 'ragas-verdict-evaluation', {
    context,
    statements,
    ...(vars || {}),
  });

  if (resp.error || !resp.output) {
    throw new Error(resp.error || 'Verdict evaluation failed');
  }

  // Try to parse RAGAS JSON format
  try {
    const parsed = JSON.parse(resp.output);
    if (parsed.statements && Array.isArray(parsed.statements)) {
      // Validate and normalize RAGAS format
      return {
        statements: parsed.statements.map((s: any) => ({
          statement: s.statement || '',
          reason: s.reason || 'No reason provided',
          verdict: s.verdict === 1 ? 1 : 0,
        })),
      };
    }
  } catch (e) {
    // Fallback to legacy text parsing
    return parseLegacyVerdictFormat(resp.output, statements);
  }

  return parseLegacyVerdictFormat(resp.output, statements);
}

function parseLegacyVerdictFormat(text: string, statements: string[]): NLIStatementOutput {
  // Current promptfoo parsing logic
  const RAGAS_FINAL_ANSWER = 'Final verdict for each statement in order:';

  if (text.includes(RAGAS_FINAL_ANSWER)) {
    const verdictsPart = text.slice(text.indexOf(RAGAS_FINAL_ANSWER) + RAGAS_FINAL_ANSWER.length);
    const verdicts = verdictsPart.split('.').filter((v) => v.trim());

    return {
      statements: verdicts.map((verdict, index) => ({
        statement: statements[index] || `Statement ${index + 1}`,
        reason: 'Legacy format - parsed from text',
        verdict: verdict.trim().toLowerCase() === 'yes' ? 1 : 0,
      })),
    };
  }

  // If we can't parse, return neutral verdicts
  logger.warn('Unable to parse verdict format, returning neutral verdicts');
  return {
    statements: statements.map((statement) => ({
      statement,
      reason: 'Unable to determine faithfulness',
      verdict: 0, // Conservative: assume not faithful
    })),
  };
}
```

### Phase 4: Faithfulness Calculation (Port RAGAS Approach)

```typescript
// src/ragas/faithfulness.ts (new file)
import { FaithfulnessResult } from '../types/ragas';

export function calculateFaithfulnessScore(
  verdicts: StatementFaithfulnessAnswer[],
  threshold: number = 0.5,
): FaithfulnessResult {
  // Validate input
  if (!verdicts || verdicts.length === 0) {
    return {
      score: 0,
      verdicts: [],
      statements: [],
      isValid: false,
      error: 'No verdicts provided',
    };
  }

  // Count faithful vs non-faithful statements (RAGAS approach)
  const faithfulCount = verdicts.filter((v) => v.verdict === 1).length;
  const totalCount = verdicts.length;

  // Calculate score (RAGAS: faithful / total)
  const score = faithfulCount / totalCount;

  // Validate score
  if (isNaN(score) || !isFinite(score)) {
    return {
      score: 0.5, // Neutral fallback
      verdicts,
      statements: verdicts.map((v) => v.statement),
      isValid: false,
      error: 'Invalid score calculation',
    };
  }

  // Check if score meets threshold
  const meetsThreshold = score >= threshold;

  return {
    score,
    verdicts,
    statements: verdicts.map((v) => v.statement),
    isValid: true,
    error: meetsThreshold ? undefined : 'Score below threshold',
  };
}
```

### Phase 5: Complete Faithfulness Metric (Port RAGAS Class)

```typescript
// src/ragas/metrics/faithfulness.ts (new file)
import { generateStatements } from '../statementGenerator';
import { evaluateVerdicts } from '../verdictEvaluator';
import { calculateFaithfulnessScore } from '../faithfulness';
import { getAndCheckProvider } from '../../providers';

export class RagasFaithfulness {
  private maxRetries: number = 1;

  constructor(private maxRetries: number = 1) {
    this.maxRetries = maxRetries;
  }

  async function calculate(
    query: string,
    output: string,
    context: string | string[],
    threshold: number = 0.5,
    grading?: GradingConfig,
    vars?: Record<string, any>,
    providerCallContext?: CallApiContextParams
  ): Promise<Omit<GradingResult, 'assertion'>> {
    const tokensUsed: Partial<TokenUsage> = {
      total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0,
      completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 }
    };

    try {
      const textProvider = await getAndCheckProvider(
        'text',
        grading?.provider,
        (await getDefaultProviders()).gradingProvider,
        'ragas-faithfulness'
      );

      // Step 1: Generate statements (RAGAS approach)
      const contextString = serializeContext(context);
      const statementOutput = await generateStatements(query, output, textProvider, vars);

      if (statementOutput.statements.length === 0) {
        logger.warn('RAGAS: No statements generated from answer');
        return {
          pass: false,
          score: 0,
          reason: 'No statements generated for faithfulness calculation',
          tokensUsed
        };
      }

      // Step 2: Evaluate verdicts (RAGAS approach)
      const verdictOutput = await evaluateVerdicts(
        contextString,
        statementOutput.statements,
        textProvider,
        vars
      );

      // Step 3: Calculate score (RAGAS approach)
      const result = calculateFaithfulnessScore(verdictOutput.statements, threshold);

      if (!result.isValid) {
        return {
          pass: false,
          score: result.score,
          reason: result.error || 'Faithfulness calculation failed',
          tokensUsed
        };
      }

      // Success case
      const pass = result.score >= threshold - Number.EPSILON;
      return {
        pass,
        score: result.score,
        reason: pass
          ? `Faithfulness ${result.score.toFixed(2)} is >= ${threshold}`
          : `Faithfulness ${result.score.toFixed(2)} is < ${threshold}`,
        tokensUsed
      };

    } catch (error) {
      logger.error('RAGAS faithfulness calculation failed', { error });
      return {
        pass: false,
        score: 0.5, // Neutral score on error
        reason: `Faithfulness calculation error: ${error.message}`,
        tokensUsed
      };
    }
  }
}
```

### Phase 6: Integration with Existing System

```typescript
// src/matchers.ts - Update existing function
import { RagasFaithfulness } from '../ragas/metrics/faithfulness';

export async function matchesContextFaithfulness(
  query: string,
  output: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  // Check if RAGAS mode is enabled (via grading config or feature flag)
  const useRagas = grading?.useRagas || getEnvBool('PROMPTFOO_RAGAS_FAITHFULNESS', false);

  if (useRagas) {
    const ragas = new RagasFaithfulness();
    return ragas.calculate(query, output, context, threshold, grading, vars, providerCallContext);
  }

  // Fallback to existing implementation for backward compatibility
  return existingFaithfulnessImplementation(
    query,
    output,
    context,
    threshold,
    grading,
    vars,
    providerCallContext,
  );
}
```

### Phase 7: Configuration and Feature Flags

```typescript
// src/constants.ts - Add RAGAS configuration
export const RAGAS_DEFAULTS = {
  useRagas: false, // Opt-in by default
  maxRetries: 1,
  batchSize: 5, // For potential batch processing
  strictJson: false, // Whether to enforce JSON output
};

// src/globalConfig.ts - Add RAGAS settings
interface GlobalConfig {
  // ... existing config
  ragas?: {
    useRagas?: boolean;
    maxRetries?: number;
    strictJson?: boolean;
  };
}
```

### Phase 8: Documentation

````markdown
# RAGAS Faithfulness Integration

## Overview

Promptfoo now supports RAGAS-style faithfulness calculation, which provides more robust and reliable faithfulness scoring.

## Enabling RAGAS Mode

### Option 1: Configuration File

```yaml
grading:
  useRagas: true
  provider: 'text' # Optional: specify grading provider
```
````

### Option 2: Environment Variable

```bash
PROMPTFOO_RAGAS_FAITHFULNESS=true promptfoo eval
```

### Option 3: Programmatic

```javascript
const result = await runAssertion({
  type: 'context-faithfulness',
  grading: { useRagas: true },
});
```

## How It Works

1. **Statement Generation**: LLM generates statements from the answer
2. **Verdict Evaluation**: LLM evaluates each statement against context
3. **Score Calculation**: Simple ratio of faithful statements

## Benefits

- **More Robust**: Structured JSON output is easier to parse
- **Better Error Handling**: Graceful degradation for edge cases
- **Industry Standard**: Aligns with RAGAS best practices
- **Backward Compatible**: Existing implementation still available

## Migration Guide

### From Legacy to RAGAS

1. **Test with RAGAS enabled**: Compare results between implementations
2. **Update prompts**: Ensure LLM outputs proper JSON format
3. **Monitor performance**: Check for improvements in reliability
4. **Switch permanently**: Once validated, make RAGAS the default

### Configuration Options

```yaml
grading:
  useRagas: true
  strictJson: true # Enforce JSON output (recommended)
  maxRetries: 2 # Retry failed LLM calls
  provider: 'openai:gpt-4' # Specify grading provider
```

## Troubleshooting

### Common Issues

1. **LLM not outputting JSON**: Use `strictJson: true` and update prompts
2. **Performance impact**: RAGAS uses 2 LLM calls instead of 1
3. **Format mismatches**: Check LLM response format in logs

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug PROMPTFOO_RAGAS_FAITHFULNESS=true promptfoo eval
```

## Technical Details

### Statement Generation Prompt

Uses `CONTEXT_FAITHFULNESS_LONGFORM` to generate statements from answer.

### Verdict Evaluation Prompt

Uses `CONTEXT_FAITHFULNESS_NLI_STATEMENTS` to evaluate each statement.

### Score Calculation

```
score = faithful_statements / total_statements
```

Where `faithful_statements` are those with `verdict: 1`.

## Examples

### Basic Usage

```yaml
tests:
  - vars:
      question: 'What is the capital of France?'
      answer: 'The capital of France is Paris.'
      context: 'France, officially the French Republic, is a country located in Western Europe. Its capital is Paris.'
    assert:
      - type: context-faithfulness
        grading:
          useRagas: true
```

### Advanced Configuration

```yaml
defaultTest:
  assert:
    - type: context-faithfulness
      threshold: 0.8
      grading:
        useRagas: true
        strictJson: true
        provider: 'openai:gpt-4-turbo'
```

## Comparison: RAGAS vs Legacy

| Feature            | RAGAS           | Legacy         |
| ------------------ | --------------- | -------------- |
| **Output Format**  | Structured JSON | Free-form text |
| **Reliability**    | High            | Medium         |
| **Error Handling** | Comprehensive   | Limited        |
| **LLM Calls**      | 2               | 1              |
| **Performance**    | Slower          | Faster         |
| **Accuracy**       | Higher          | Lower          |

## Future Enhancements

- Batch processing for large documents
- Caching of statement generation
- Hybrid mode (RAGAS + legacy fallback)
- Custom prompt templates

````

### Phase 9: Testing Strategy

```typescript
// test/ragas/faithfulness.test.ts
describe('RagasFaithfulness', () => {
  describe('Statement Generation', () => {
    it('should generate statements from answer', async () => {
      const result = await generateStatements(
        'What is AI?',
        'AI is artificial intelligence. It mimics human cognition.'
      );
      expect(result.statements.length).toBeGreaterThan(0);
    });

    it('should handle empty answers', async () => {
      const result = await generateStatements('Question', '');
      expect(result.statements.length).toBe(0);
    });
  });

  describe('Verdict Evaluation', () => {
    it('should evaluate statements against context', async () => {
      const statements = ['AI is artificial intelligence.', 'It mimics human cognition.'];
      const context = 'Artificial Intelligence (AI) is the simulation of human intelligence.';
      const result = await evaluateVerdicts(context, statements);
      expect(result.statements.length).toBe(statements.length);
    });

    it('should handle JSON output format', async () => {
      // Mock LLM to return RAGAS JSON format
      const result = await evaluateVerdicts(context, statements);
      expect(result.statements[0].verdict).toBeDefined();
    });
  });

  describe('Score Calculation', () => {
    it('should calculate score correctly', () => {
      const verdicts = [
        { statement: 'Test', reason: 'Test', verdict: 1 },
        { statement: 'Test', reason: 'Test', verdict: 0 }
      ];
      const result = calculateFaithfulnessScore(verdicts);
      expect(result.score).toBe(0.5);
    });

    it('should handle empty verdicts', () => {
      const result = calculateFaithfulnessScore([]);
      expect(result.isValid).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should work end-to-end', async () => {
      const ragas = new RagasFaithfulness();
      const result = await ragas.calculate(
        'What is AI?',
        'AI is artificial intelligence.',
        'Artificial Intelligence (AI) is the simulation of human intelligence.',
        0.5
      );
      expect(result.pass).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should fallback gracefully on error', async () => {
      // Mock error scenario
      const result = await ragas.calculate(
        'Question',
        'Answer',
        'Context',
        0.5
      );
      expect(result.score).toBe(0.5); // Neutral fallback
    });
  });
});
````

### Phase 10: Migration and Deployment

```markdown
# RAGAS Faithfulness Migration Plan

## Phase 1: Development (2-3 weeks)

- [ ] Implement core RAGAS classes
- [ ] Add comprehensive tests
- [ ] Update documentation
- [ ] Create examples

## Phase 2: Testing (1-2 weeks)

- [ ] Unit testing
- [ ] Integration testing
- [ ] Performance testing
- [ ] Edge case testing

## Phase 3: Beta Release (1 week)

- [ ] Feature flag implementation
- [ ] Opt-in configuration
- [ ] User feedback collection
- [ ] Bug fixes

## Phase 4: Full Release (1 week)

- [ ] Make RAGAS the default
- [ ] Deprecation warnings for legacy
- [ ] Migration guide
- [ ] Announcement

## Phase 5: Monitoring (Ongoing)

- [ ] Performance monitoring
- [ ] Error rate tracking
- [ ] User satisfaction surveys
- [ ] Continuous improvement

## Rollback Plan

If issues are detected:

1. Disable feature flag
2. Revert to legacy implementation
3. Analyze failure causes
4. Fix and redeploy

## Success Metrics

1. **Adoption Rate**: % of users enabling RAGAS mode
2. **Error Rate**: Reduction in faithfulness calculation errors
3. **Performance**: Impact on evaluation time
4. **Accuracy**: Improvement in faithfulness scoring
5. **User Satisfaction**: Feedback and survey results

## Communication Plan

### Internal

- Team demo and training
- Documentation review
- Support team preparation

### External

- Blog post announcement
- Documentation updates
- Example configurations
- Migration guide
- Support channels
```

## Complete Implementation Timeline

| Phase          | Duration      | Tasks                                      |
| -------------- | ------------- | ------------------------------------------ |
| 1. Analysis    | 1 week        | Research RAGAS, create plan, get approvals |
| 2. Development | 2-3 weeks     | Implement core functionality, tests, docs  |
| 3. Testing     | 1-2 weeks     | Comprehensive testing, bug fixes           |
| 4. Beta        | 1 week        | Feature flag, user feedback, iterations    |
| 5. Release     | 1 week        | Make default, announcements, monitoring    |
| **Total**      | **6-8 weeks** | **Complete RAGAS port**                    |

## Risk Assessment

### Low Risk Items

- Type definitions and interfaces
- Helper functions
- Documentation
- Tests

### Medium Risk Items

- Statement generation changes
- Verdict parsing logic
- Integration with existing system
- Performance impact

### High Risk Items

- Breaking changes to API
- LLM format compatibility
- Performance degradation
- User adoption

### Mitigation Strategies

- Feature flags for gradual rollout
- Comprehensive backward compatibility
- Performance optimization
- User education and support

## Success Criteria

1. ✅ RAGAS faithfulness implementation complete
2. ✅ All existing tests pass
3. ✅ New RAGAS tests added
4. ✅ Documentation complete
5. ✅ Backward compatibility maintained
6. ✅ Performance impact acceptable
7. ✅ User adoption successful
8. ✅ Error rates reduced
9. ✅ Feature flag for gradual rollout
10. ✅ Monitoring and analytics in place

## Files to Create/Modify

### New Files

- `src/types/ragas.ts` - Type definitions
- `src/ragas/statementGenerator.ts` - Statement generation
- `src/ragas/verdictEvaluator.ts` - Verdict evaluation
- `src/ragas/faithfulness.ts` - Score calculation
- `src/ragas/metrics/faithfulness.ts` - Complete metric
- `test/ragas/faithfulness.test.ts` - Comprehensive tests

### Modified Files

- `src/matchers.ts` - Integration point
- `src/constants.ts` - Configuration
- `src/globalConfig.ts` - Settings
- `docs/integrations/ragas.md` - Documentation
- `examples/ragas-faithfulness.yaml` - Example config

## Benefits of Complete RAGAS Port

1. **Industry Standard**: Aligns with widely-used RAGAS framework
2. **Improved Reliability**: Structured output is more reliable than text parsing
3. **Better Error Handling**: Comprehensive validation and fallback mechanisms
4. **Enhanced Features**: Supports all RAGAS faithfulness capabilities
5. **Future-Proof**: Easier to add new RAGAS metrics
6. **Community Alignment**: Compatible with RAGAS ecosystem
7. **Performance**: Optimized for large-scale evaluations
8. **Extensibility**: Easy to add custom prompts and configurations

## Conclusion

This complete RAGAS port provides a robust, industry-standard faithfulness implementation that addresses the issues in the current system while maintaining full backward compatibility. The phased approach ensures minimal disruption and allows for gradual adoption.

The implementation follows RAGAS best practices while adapting to promptfoo's architecture, providing users with a more reliable and feature-rich faithfulness metric.

**Estimated Total Effort**: 6-8 weeks
**Priority**: High (addresses critical reliability issues)
**Impact**: Significant improvement in faithfulness calculation robustness
**Risk**: Medium (mitigated by phased rollout and feature flags)
