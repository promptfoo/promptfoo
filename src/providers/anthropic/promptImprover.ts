import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  AtomicTestCase,
  Assertion,
} from '../../types';
import { runAssertion } from '../../assertions';
import { getNunjucksEngine } from '../../util/templates';
import { AnthropicGenericProvider } from './generic';
import type { AnthropicBaseOptions } from './generic';
import crypto from 'crypto';
import { isCacheEnabled, getCache } from '../../util/cache';

export interface AnthropicPromptImproverOptions extends AnthropicBaseOptions {
  maxTurns?: number;
  numCandidates?: number;
  stallIterations?: number;
  useExperimentalApi?: boolean;
}

interface TestCaseEvaluation {
  testCase: AtomicTestCase;
  output: string;
  score: number;
  passedCount: number;
  totalCount: number;
  failedReasons: string[];
}

interface GlobalEvaluation {
  overallScore: number;
  totalPassed: number;
  totalAssertions: number;
  testResults: TestCaseEvaluation[];
  averageScore: number;
}

export class AnthropicPromptImproverProvider extends AnthropicGenericProvider {
  private readonly maxTurns: number;
  private readonly numCandidates: number;
  private readonly stallIterations: number;
  private readonly useExperimentalApi: boolean;
  private allTestCases: AtomicTestCase[] = [];
  declare config: AnthropicPromptImproverOptions;

  constructor({
    id,
    label,
    config,
    env,
  }: {
    id?: string;
    label?: string;
    config?: AnthropicPromptImproverOptions;
    env?: any;
  }) {
    super('claude-3-5-sonnet-20241022', { config, env });
    this.maxTurns = config?.maxTurns ?? 10;
    this.numCandidates = config?.numCandidates ?? 4;
    this.stallIterations = config?.stallIterations ?? 6;
    this.useExperimentalApi = config?.useExperimentalApi ?? false;
  }

  id(): string {
    return 'promptfoo:anthropic:prompt-improver';
  }

  toString(): string {
    return '[Anthropic Prompt Improver Provider]';
  }

  toJSON() {
    return {
      id: this.id(),
      config: {
        maxTurns: this.maxTurns,
        numCandidates: this.numCandidates,
        stallIterations: this.stallIterations,
        useExperimentalApi: this.useExperimentalApi,
      },
    };
  }

  private async evaluateTestCase(
    prompt: string,
    testCase: AtomicTestCase,
    originalProvider: ApiProvider,
  ): Promise<TestCaseEvaluation> {
    try {
      // Render prompt with test case variables
      const nunjucks = getNunjucksEngine();
      const renderedPrompt = nunjucks.renderString(prompt, testCase.vars || {});

      // Get output from original provider
      const response = await originalProvider.callApi(renderedPrompt);
      const output = String(response.output || '');

      // Evaluate against assertions
      let passedCount = 0;
      const failedReasons: string[] = [];
      const assertions = (testCase.assert || []).filter(assertion => assertion.type !== 'assert-set');
      const totalCount = assertions.length;

      for (const assertion of assertions) {
        try {
          const result = await runAssertion({
            assertion: assertion as Assertion,
            test: testCase,
            providerResponse: { output },
            provider: originalProvider,
          });

          if (result.pass) {
            passedCount++;
          } else {
            failedReasons.push(result.reason || 'Assertion failed');
          }
        } catch (error) {
          logger.debug(`Error evaluating assertion: ${error}`);
          failedReasons.push(`Evaluation error: ${error}`);
        }
      }

      const score = totalCount > 0 ? passedCount / totalCount : 1;

      return {
        testCase,
        output,
        score,
        passedCount,
        totalCount,
        failedReasons,
      };
    } catch (error) {
      logger.debug(`Error evaluating test case: ${error}`);
      return {
        testCase,
        output: '',
        score: 0,
        passedCount: 0,
        totalCount: (testCase.assert || []).length,
        failedReasons: [`Evaluation error: ${error}`],
      };
    }
  }

  private async evaluatePromptAcrossAllTests(
    prompt: string,
    originalProvider: ApiProvider,
  ): Promise<GlobalEvaluation> {
    console.log(`🧪 Evaluating prompt across ${this.allTestCases.length} test cases...`);
    
    const testResults: TestCaseEvaluation[] = [];
    let totalPassed = 0;
    let totalAssertions = 0;

    for (const testCase of this.allTestCases) {
      const result = await this.evaluateTestCase(prompt, testCase, originalProvider);
      testResults.push(result);
      totalPassed += result.passedCount;
      totalAssertions += result.totalCount;
    }

    const overallScore = totalAssertions > 0 ? totalPassed / totalAssertions : 1;
    const averageScore = testResults.length > 0 
      ? testResults.reduce((sum, r) => sum + r.score, 0) / testResults.length 
      : 0;

    return {
      overallScore,
      totalPassed,
      totalAssertions,
      testResults,
      averageScore,
    };
  }

  private createGlobalFeedback(evaluation: GlobalEvaluation): string {
    if (evaluation.overallScore === 1) {
      return 'All test cases pass perfectly.';
    }

    let feedback = `The prompt achieved ${evaluation.totalPassed}/${evaluation.totalAssertions} total assertions (${(evaluation.overallScore * 100).toFixed(1)}% overall). Issues to address:\n\n`;

    evaluation.testResults.forEach((result, index) => {
      if (result.failedReasons.length > 0) {
        feedback += `Test Case ${index + 1} (${result.testCase.description || 'Unnamed'}):\n`;
        result.failedReasons.forEach(reason => {
          feedback += `  - ${reason}\n`;
        });
        feedback += '\n';
      }
    });

    feedback += 'Please improve the prompt template to address these issues across all test cases.';
    return feedback;
  }

  private async generatePromptCandidates(
    currentPrompt: string,
    feedback: string,
  ): Promise<string[]> {
    const candidates: string[] = [];
    const promises: Promise<string | null>[] = [];

    for (let i = 0; i < this.numCandidates; i++) {
      promises.push(this.generateCandidatePrompt(currentPrompt, feedback, i + 1));
    }

    const results = await Promise.all(promises);
    for (const result of results) {
      if (result) {
        candidates.push(result);
      }
    }

    return candidates;
  }

  private async generateCandidatePrompt(
    currentPrompt: string,
    feedback: string,
    candidateNumber: number,
  ): Promise<string | null> {
    try {
      const improvementPrompt = `You are an expert prompt engineer. Your task is to improve the following prompt template to better satisfy the given evaluation criteria across multiple test cases.

Current prompt template:
"${currentPrompt}"

Evaluation feedback:
${feedback}

Please provide an improved version of the prompt template that addresses these issues. The template should work well across diverse test scenarios. Focus on being specific, clear, and actionable. Return only the improved prompt template, nothing else.

Improved prompt template:`;

      const response = await this.anthropic.messages.create({
        model: this.modelName,
        max_tokens: 1024,
        temperature: 0.7 + (candidateNumber * 0.1),
        messages: [
          {
            role: 'user',
            content: improvementPrompt,
          },
        ],
      });

      if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        return response.content[0].text.trim();
      }
    } catch (error) {
      logger.debug(`Error generating candidate prompt: ${error}`);
    }
    return null;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!context?.originalProvider) {
      return {
        error: 'Expected originalProvider to be set for prompt improver',
      };
    }

    // --------------------
    // CACHE-BASED OPTIMIZATION
    // --------------------
    const cacheEnabled = isCacheEnabled();
    let cache;
    if (cacheEnabled) {
      cache = await getCache();
    }

    // Build a deterministic signature for the entire eval run
    let testsSignature = 'no-tests';
    if (context?.allTests && context.allTests.length > 0) {
      const minimalTests = context.allTests.map((t) => ({ vars: t.test.vars, assert: t.test.assert }));
      try {
        testsSignature = crypto.createHash('sha256').update(JSON.stringify(minimalTests)).digest('hex');
      } catch {
        // Fallback to simple stringify if hashing fails
        testsSignature = JSON.stringify(minimalTests);
      }
    }

    // Include the original prompt as part of the cache key
    const cacheKeyBase = JSON.stringify({ prompt, testsSignature, config: this.config });
    const cacheKey = `anthropic-prompt-improver:v1:${crypto
      .createHash('sha256')
      .update(cacheKeyBase)
      .digest('hex')}`;

    // If optimized prompt is cached, use it directly
    if (cacheEnabled) {
      const cachedPrompt = await cache!.get<string>(cacheKey);
      if (cachedPrompt) {
        // Render with current vars and call original provider
        return await this.renderAndCall(cachedPrompt, context?.vars || {}, context.originalProvider);
      }
    }

    // If not cached, run full optimization (only needs to happen once per eval run)
    const optimizationResult = await this.optimizePrompt(prompt, context.originalProvider);

    const finalPrompt = (optimizationResult.metadata as any)?.finalPrompt || prompt;

    // Cache the optimized prompt for future test cases
    if (cacheEnabled) {
      try {
        await cache!.set(cacheKey, finalPrompt);
      } catch (err) {
        logger.debug(`Failed to cache optimized prompt: ${err}`);
      }
    }

    return optimizationResult;
  }

  private async renderAndCall(
    promptTemplate: string,
    vars: Record<string, any>,
    originalProvider: ApiProvider,
  ): Promise<ProviderResponse> {
    const nunjucks = getNunjucksEngine();
    const renderedPrompt = nunjucks.renderString(promptTemplate, vars);
    return await originalProvider.callApi(renderedPrompt);
  }

  private async optimizePrompt(
    originalPrompt: string,
    originalProvider: ApiProvider,
  ): Promise<ProviderResponse> {
    console.log(`\n🚀 PROMPT OPTIMIZATION STARTING`);
    console.log(`📝 Original Prompt: "${originalPrompt}"`);
    console.log(`🎯 Optimizing across ${this.allTestCases.length} test case(s)`);

    let currentPrompt = originalPrompt;
    let bestPrompt = originalPrompt;
    let bestEvaluation: GlobalEvaluation;
    let stallCount = 0;
    let numRequests = 0;
    let actualIterations = 0;

    // Initial evaluation
    console.log(`\n🧪 INITIAL EVALUATION`);
    try {
      const initialEval = await this.evaluatePromptAcrossAllTests(currentPrompt, originalProvider);
      bestEvaluation = initialEval;
      numRequests += this.allTestCases.length;

      console.log(`📊 Initial Score: ${initialEval.totalPassed}/${initialEval.totalAssertions} (${(initialEval.overallScore * 100).toFixed(1)}%)`);
      console.log(`📈 Average per test: ${(initialEval.averageScore * 100).toFixed(1)}%`);

      if (initialEval.overallScore === 1) {
        console.log(`✅ All test cases already pass!`);
        // Return result from first test case
        const firstTestResult = initialEval.testResults[0];
        return {
          output: firstTestResult?.output || '',
          tokenUsage: { numRequests },
          metadata: {
            improved: false,
            originalPrompt,
            finalPrompt: currentPrompt,
            finalScore: initialEval.overallScore,
            iterations: 0,
          },
        };
      }
    } catch (error) {
      return {
        error: `Failed to evaluate initial prompt: ${error}`,
      };
    }

    // Optimization loop
    console.log(`\n🔄 STARTING OPTIMIZATION LOOP`);
    for (let iter = 0; iter < this.maxTurns; iter++) {
      actualIterations++;
      console.log(`\n--- ITERATION ${iter + 1}/${this.maxTurns} ---`);

      try {
        // Generate feedback
        const feedback = this.createGlobalFeedback(bestEvaluation);
        console.log(`💬 Feedback: ${feedback.length > 300 ? feedback.substring(0, 300) + '...' : feedback}`);

        // Generate candidate prompts
        console.log(`🧠 Generating ${this.numCandidates} candidate prompts...`);
        const candidates = await this.generatePromptCandidates(currentPrompt, feedback);
        console.log(`📦 Generated ${candidates.length} candidates`);

        let improved = false;
        let bestCandidate = currentPrompt;
        let bestCandidateEval = bestEvaluation;

        // Evaluate each candidate
        console.log(`🧪 Testing candidates:`);
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
          const candidate = candidates[candidateIndex];
          console.log(`\n   Candidate ${candidateIndex + 1}: "${candidate.length > 100 ? candidate.substring(0, 100) + '...' : candidate}"`);
          
          try {
            const candidateEval = await this.evaluatePromptAcrossAllTests(candidate, originalProvider);
            numRequests += this.allTestCases.length;

            console.log(`   📊 Result: ${candidateEval.totalPassed}/${candidateEval.totalAssertions} (${(candidateEval.overallScore * 100).toFixed(1)}%)${candidateEval.overallScore > bestCandidateEval.overallScore ? ' ⭐ NEW BEST!' : ''}`);

            if (candidateEval.overallScore > bestCandidateEval.overallScore) {
              bestCandidate = candidate;
              bestCandidateEval = candidateEval;
              improved = true;
            }
          } catch (error) {
            console.log(`   ❌ Error: ${error}`);
          }
        }

        // Update if we found improvement
        if (improved) {
          console.log(`\n🎉 IMPROVEMENT FOUND!`);
          console.log(`   📈 Score: ${(bestEvaluation.overallScore * 100).toFixed(1)}% → ${(bestCandidateEval.overallScore * 100).toFixed(1)}%`);
          console.log(`   ✅ Passed: ${bestEvaluation.totalPassed}/${bestEvaluation.totalAssertions} → ${bestCandidateEval.totalPassed}/${bestCandidateEval.totalAssertions}`);
          
          currentPrompt = bestCandidate;
          bestPrompt = bestCandidate;
          bestEvaluation = bestCandidateEval;
          stallCount = 0;

          if (bestEvaluation.overallScore === 1) {
            console.log(`\n🏆 PERFECT SCORE ACHIEVED!`);
            break;
          }
        } else {
          stallCount++;
          console.log(`\n😐 No improvement found (stall count: ${stallCount}/${this.stallIterations})`);
        }

        if (stallCount >= this.stallIterations) {
          console.log(`\n🛑 Stopping due to ${stallCount} iterations without improvement`);
          break;
        }

      } catch (error) {
        logger.debug(`Error in iteration ${iter + 1}: ${error}`);
        stallCount++;
        if (stallCount >= this.stallIterations) {
          break;
        }
      }
    }

    // Generate final output using the optimized prompt with the first test case
    try {
      const firstTestCase = this.allTestCases[0];
      const nunjucks = getNunjucksEngine();
      const finalRenderedPrompt = nunjucks.renderString(bestPrompt, firstTestCase.vars || {});
      const finalResponse = await originalProvider.callApi(finalRenderedPrompt);
      numRequests++;

      console.log(`\n🏁 OPTIMIZATION COMPLETE`);
      console.log(`📊 Final Score: ${bestEvaluation.totalPassed}/${bestEvaluation.totalAssertions} (${(bestEvaluation.overallScore * 100).toFixed(1)}%)`);
      console.log(`🔄 Iterations Used: ${actualIterations}/${this.maxTurns}`);
      console.log(`📈 Improvement: ${bestPrompt === originalPrompt ? 'NO' : 'YES'}`);
      console.log(`📝 Final Prompt: "${bestPrompt}"`);

      return {
        output: String(finalResponse.output || ''),
        tokenUsage: { numRequests },
        metadata: {
          improved: bestPrompt !== originalPrompt,
          originalPrompt,
          finalPrompt: bestPrompt,
          finalScore: bestEvaluation.overallScore,
          finalPassedCount: bestEvaluation.totalPassed,
          iterations: actualIterations,
          testCaseResults: bestEvaluation.testResults,
        },
      };
    } catch (error) {
      return {
        error: `Failed to generate final output: ${error}`,
      };
    }
  }
} 