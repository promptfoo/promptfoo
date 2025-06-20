import fs from 'fs';
import { runAssertions } from '../assertions';
import { VARIABLE_OPTIMIZER_PROMPT } from '../prompts';
import {
  type ApiProvider,
  type ProviderResponse,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type ProviderOptions,
  type TestCase,
} from '../types';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { loadApiProvider } from './index';

interface OptimizerConfig {
  maxTurns?: number;
  improverModel?: string;
  template?: string;
  targetVariable?: string;
  stallIterations?: number;
}

export class PromptOptimizerProvider implements ApiProvider {
  private readonly identifier: string;
  private readonly options: Required<OptimizerConfig>;
  private improver?: ApiProvider;

  constructor({ id, label, config }: ProviderOptions) {
    this.identifier = id ?? label ?? 'promptfoo:prompt-optimizer';
    this.options = {
      maxTurns: config?.maxTurns ?? 6,
      improverModel: config?.improverModel,
      template: config?.template,
      targetVariable: config?.targetVariable || 'text', // Default to 'text' if not specified
      stallIterations: config?.stallIterations ?? 2,
    };
  }

  id() {
    return this.identifier;
  }

  private async getImprover(context?: CallApiContextParams) {
    if (this.improver) {
      return this.improver;
    }
    if (this.options.improverModel) {
      this.improver = await loadApiProvider(this.options.improverModel, {
        // Remove env property as it's not part of the interface
      });
    } else {
      invariant(context?.originalProvider, 'Expected originalProvider to be set');
      this.improver = context.originalProvider;
    }
    return this.improver;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    // Get the original prompt template from context
    const promptTemplate = context?.prompt?.raw || prompt;

    const targetProvider = context.originalProvider;
    const improver = await this.getImprover(context);
    const nunjucks = getNunjucksEngine();

    // Find the target variable to optimize
    const targetVar = this.options.targetVariable;
    invariant(
      targetVar in context.vars,
      `Target variable "${targetVar}" not found in test vars. Available: ${Object.keys(context.vars).join(', ')}`,
    );

    const originalValue = context.vars[targetVar];
    const currentVars = { ...context.vars };
    let bestVars = { ...currentVars };
    let bestScore = -Infinity;
    let bestOutput = '';
    let stall = 0;
    const history: {
      iteration: number;
      vars: any;
      output: string;
      score: number;
      reason?: string;
      success: boolean;
    }[] = [];

    for (let i = 0; i < this.options.maxTurns; i++) {
      // Render prompt with current variables
      const rendered = nunjucks.renderString(promptTemplate, currentVars);

      // Test with current variables
      const resp = await targetProvider.callApi(
        rendered,
        { ...context, vars: currentVars },
        options,
      );

      // Run assertions - convert the context.test to the expected format
      const testCase = context.test as TestCase;
      const grading = await runAssertions({
        prompt: rendered,
        provider: targetProvider,
        providerResponse: resp,
        test: testCase,
      });

      const score = grading.score;
      const output = String(resp.output || '');

      history.push({
        iteration: i + 1,
        vars: { ...currentVars },
        output,
        score,
        reason: grading.reason,
        success: grading.pass,
      });

      // Check if we've succeeded
      if (grading.pass) {
        bestVars = { ...currentVars };
        bestScore = score;
        bestOutput = output;
        break;
      }

      // Track best result
      if (score > bestScore) {
        bestVars = { ...currentVars };
        bestScore = score;
        bestOutput = output;
        stall = 0;
      } else {
        stall += 1;
        if (stall >= this.options.stallIterations) {
          break;
        }
      }

      // Prepare failure information for the improver
      const failures = testCase?.assert
        ? testCase.assert.map((a: any) => ({
            assertName: a.type,
            score,
            pass: grading.pass,
            reason: grading.reason,
          }))
        : [];

      // Get template for improvement suggestions
      let templateStr: string;
      if (this.options.template) {
        if (this.options.template.startsWith('file://')) {
          const filePath = this.options.template.slice('file://'.length);
          templateStr = fs.readFileSync(filePath, 'utf8');
        } else {
          templateStr = this.options.template;
        }
      } else {
        templateStr = VARIABLE_OPTIMIZER_PROMPT;
      }

      // Render the improver prompt
      const equalsAssertion = testCase?.assert?.find(
        (a: any) => a.type === 'equals' && 'value' in a,
      ) as any;

      // Extract target classification from JavaScript assertion
      let targetClassification = 'safe'; // default
      const jsAssertion = testCase?.assert?.find(
        (a: any) => a.type === 'javascript' && 'value' in a,
      ) as any;
      if (jsAssertion?.value) {
        if (jsAssertion.value.includes("=== 'unsafe'")) {
          targetClassification = 'unsafe';
        } else if (jsAssertion.value.includes("=== 'safe'")) {
          targetClassification = 'safe';
        }
      }

      const improverPrompt = nunjucks.renderString(templateStr, {
        targetVariable: targetVar,
        promptTemplate,
        currentValue: currentVars[targetVar],
        previousOutput: output,
        reason: grading.reason,
        failures,
        currentPrompt: rendered,
        optimizationHistory: history,
        // Add more context for the optimizer
        expectedOutput: equalsAssertion?.value,
        assertionType: testCase?.assert?.[0]?.type,
        currentIteration: i + 1,
        isExactMatch: !!equalsAssertion,
        targetClassification,
        postContent: currentVars.post_content || '',
      });

      // Get suggestion from improver
      const improvResp = await improver.callApi(improverPrompt, undefined, options);
      if (improvResp.error) {
        break;
      }

      // Update the target variable with the improved value
      const improvedValue = String(improvResp.output || '').trim();
      if (improvedValue) {
        currentVars[targetVar] = improvedValue;
      } else {
        break;
      }
    }

    // Update the original context vars with the optimized values
    if (context.vars) {
      Object.assign(context.vars, bestVars);
    }

    // Return the final result with the best variables
    const finalRendered = nunjucks.renderString(promptTemplate, bestVars);

    // Prepare the redteamFinalPrompt value for frontend display
    const redteamFinalPrompt =
      typeof bestVars[targetVar] === 'string'
        ? (bestVars[targetVar] as string)
        : JSON.stringify(bestVars[targetVar]);

    const optimizationMetadata = {
      promptOptimizer: {
        originalValue,
        optimizedValue: bestVars[targetVar],
        targetVariable: targetVar,
        iterations: history.length,
        finalScore: bestScore,
        succeeded: history.some((h) => h.success),
        stallIterations: this.options.stallIterations,
        maxTurns: this.options.maxTurns,
        history: history.map((h) => ({
          iteration: h.iteration,
          [targetVar]: h.vars[targetVar],
          output: h.output,
          score: h.score,
          reason: h.reason,
          success: h.success,
        })),
      },
      // Add redteamFinalPrompt so frontend displays optimized value
      redteamFinalPrompt,
      // Legacy metadata for backward compatibility
      optimizationHistory: history,
      finalVars: bestVars,
      finalPrompt: finalRendered,
      optimizedVariable: targetVar,
    };

    return {
      output: bestOutput,
      metadata: optimizationMetadata,
    };
  }

  toString() {
    return '[Prompt Optimizer Provider]';
  }
}

export default PromptOptimizerProvider;
