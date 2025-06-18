import fs from 'fs';
import { runAssertions } from '../assertions';
import logger from '../logger';
import { OPTIMIZER_PROMPT_V1 } from '../prompts';
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

    const targetProvider = context.originalProvider;
    const improver = await this.getImprover(context);
    const nunjucks = getNunjucksEngine();

    // Find the target variable to optimize
    const targetVar = this.options.targetVariable;
    invariant(
      targetVar in context.vars,
      `Target variable "${targetVar}" not found in test vars. Available: ${Object.keys(context.vars).join(', ')}`,
    );

    const currentVars = { ...context.vars };
    let bestVars = { ...currentVars };
    let bestScore = -Infinity;
    let bestOutput = '';
    let stall = 0;
    const history: { vars: any; output: string; score: number }[] = [];

    for (let i = 0; i < this.options.maxTurns; i++) {
      // Render prompt with current variables
      const rendered = nunjucks.renderString(prompt, currentVars);

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

      history.push({ vars: { ...currentVars }, output, score });

      logger.debug(`PromptOptimizer iteration ${i + 1}: score=${score}, pass=${grading.pass}`);
      logger.debug(`Current ${targetVar}: ${currentVars[targetVar]}`);
      logger.debug(`Output: ${output}`);

      // Check if we've succeeded
      if (grading.pass) {
        bestVars = { ...currentVars };
        bestScore = score;
        bestOutput = output;
        logger.debug(`PromptOptimizer succeeded on iteration ${i + 1}`);
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
          logger.debug(`PromptOptimizer stalled after ${stall} iterations`);
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
        templateStr = OPTIMIZER_PROMPT_V1;
      }

      // Render the improver prompt
      const improverPrompt = nunjucks.renderString(templateStr, {
        targetVariable: targetVar,
        promptTemplate: prompt,
        currentValue: currentVars[targetVar],
        previousOutput: output,
        reason: grading.reason,
        failures,
        currentPrompt: rendered,
      });

      logger.debug(`PromptOptimizer improver prompt: ${improverPrompt}`);

      // Get suggestion from improver
      const improvResp = await improver.callApi(improverPrompt, undefined, options);
      if (improvResp.error) {
        logger.debug(`PromptOptimizer improver error: ${improvResp.error}`);
        break;
      }

      // Update the target variable with the improved value
      const improvedValue = String(improvResp.output || '').trim();
      if (improvedValue) {
        currentVars[targetVar] = improvedValue;
        logger.debug(`PromptOptimizer updated ${targetVar} to: ${improvedValue}`);
      } else {
        logger.debug('PromptOptimizer got empty improvement, stopping');
        break;
      }
    }

    // Return the final result with the best variables
    const finalRendered = nunjucks.renderString(prompt, bestVars);

    return {
      output: bestOutput,
      metadata: {
        optimizationHistory: history,
        finalVars: bestVars,
        finalPrompt: finalRendered,
        optimizedVariable: targetVar,
      },
    };
  }

  toString() {
    return '[Prompt Optimizer Provider]';
  }
}

export default PromptOptimizerProvider;
