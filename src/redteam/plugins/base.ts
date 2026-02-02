import dedent from 'dedent';
import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import { withGraderSpan } from '../../tracing/graderTracer';
import { retryWithDeduplication, sampleArray } from '../../util/generation';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import invariant from '../../util/invariant';
import { extractVariablesFromTemplate, getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { redteamProviderManager } from '../providers/shared';
import {
  extractInputVarsFromPrompt,
  getShortPluginId,
  isBasicRefusal,
  isEmptyResponse,
} from '../util';
import { getPromptOutputFormatter } from './multiInputFormat';

import type { TraceContextData } from '../../tracing/traceContext';
import type {
  ApiProvider,
  Assertion,
  AssertionValue,
  AtomicTestCase,
  CallApiContextParams,
  GradingResult,
  PluginConfig,
  ResultSuggestion,
  TestCase,
} from '../../types/index';

/**
 * Abstract base class for creating plugins that generate test cases.
 */
export abstract class RedteamPluginBase {
  /**
   * Unique identifier for the plugin.
   */
  abstract readonly id: string;

  /**
   * Whether this plugin can be generated remotely if OpenAI is not available.
   * Defaults to true. Set to false for plugins that use static data sources
   * like datasets, CSVs, or JSON files that don't need remote generation.
   */
  readonly canGenerateRemote: boolean = true;

  /**
   * Creates an instance of RedteamPluginBase.
   * @param provider - The API provider used for generating prompts.
   * @param purpose - The purpose of the plugin.
   * @param injectVar - The variable name to inject the generated prompt into.
   * @param config - An optional object of plugin configuration.
   */
  constructor(
    protected provider: ApiProvider,
    protected purpose: string,
    protected injectVar: string,
    protected config: PluginConfig = {},
  ) {
    logger.debug(`RedteamPluginBase initialized with purpose: ${purpose}, injectVar: ${injectVar}`);

    // Merge default excluded strategies with user-provided ones
    const defaultExcludedStrategies = this.getDefaultExcludedStrategies();
    if (defaultExcludedStrategies.length > 0 || config.excludeStrategies) {
      this.config.excludeStrategies = Array.from(
        new Set([...defaultExcludedStrategies, ...(config.excludeStrategies || [])]),
      );
    }
  }

  /**
   * Returns an array of strategy IDs that should be excluded by default for this plugin.
   * Override this method in subclasses to specify plugin-specific strategy exclusions.
   * @returns An array of strategy IDs to exclude.
   */
  protected getDefaultExcludedStrategies(): string[] {
    return [];
  }

  /**
   * Template string used to generate prompts.
   */
  protected abstract getTemplate(): Promise<string>;

  /**
   * Abstract method to get assertions for a given prompt.
   * @param prompt - The prompt to generate assertions for.
   * @returns An array of Assertion objects.
   */
  protected abstract getAssertions(prompt: string): Assertion[];

  /**
   * Generates test cases based on the plugin's configuration.
   * @param n - The number of test cases to generate.
   * @param delayMs - The delay in milliseconds between plugin API calls.
   * @param templateGetter - A function that returns a promise of a template string.
   * @returns A promise that resolves to an array of TestCase objects.
   */
  async generateTests(
    n: number,
    delayMs: number = 0,
    templateGetter: () => Promise<string> = this.getTemplate.bind(this),
  ): Promise<TestCase[]> {
    logger.debug(`Generating ${n} test cases`);
    const batchSize = 20;

    // Check if we're using multi-input mode
    const hasMultipleInputs = this.config.inputs && Object.keys(this.config.inputs).length > 0;

    if (hasMultipleInputs) {
      logger.debug(
        `Using multi-input mode with inputs: ${Object.keys(this.config.inputs!).join(', ')}`,
      );
    }

    /**
     * Generates a batch of prompts/test cases using the API provider.
     * In single-input mode, returns { __prompt: string }[]
     * In multi-input mode, returns Record<string, string>[]
     */
    const generatePrompts = async (
      currentPrompts: { __prompt: string }[] | Record<string, string>[],
    ): Promise<{ __prompt: string }[] | Record<string, string>[]> => {
      const remainingCount = n - currentPrompts.length;
      const currentBatchSize = Math.min(remainingCount, batchSize);

      logger.debug(`Generating batch of ${currentBatchSize} prompts`);
      const nunjucks = getNunjucksEngine();
      const renderedTemplate = nunjucks.renderString(await templateGetter(), {
        purpose: this.purpose,
        n: currentBatchSize,
        examples: this.config.examples,
        outputFormat: RedteamPluginBase.getOutputFormatInstruction(this.config),
      });

      const finalTemplate = RedteamPluginBase.appendModifiers(renderedTemplate, this.config);
      const { output: generatedPrompts, error } = await this.provider.callApi(finalTemplate);
      if (delayMs > 0) {
        logger.debug(`Delaying for ${delayMs}ms`);
        await sleep(delayMs);
      }

      if (error) {
        logger.error(
          `Error from API provider, skipping generation for ${this.constructor.name}: ${error}`,
        );
        return [];
      }

      if (typeof generatedPrompts !== 'string') {
        logger.error(
          `Malformed response from API provider: Expected generatedPrompts to be a string, got ${typeof generatedPrompts}: ${JSON.stringify(generatedPrompts)}`,
        );
        return [];
      }

      // Handle inference refusals. Result is thrown rather than returning an empty array in order to
      // catch and show a explanatory error message.
      if (isBasicRefusal(generatedPrompts)) {
        let message = `${this.provider.id()} returned a refusal during inference for ${this.constructor.name} test case generation.`;
        // We don't know exactly why the prompt was refused, but we can provide hints to the user based on the values which were
        // included in the context window during inference.
        const context: Record<string, string> = {};
        if (this.purpose) {
          context.purpose = this.purpose;
        }
        if (this.config.examples) {
          context.examples = this.config.examples.join(', ');
        }

        if (context) {
          message += ` User-configured values were included in inference and may have been deemed harmful: ${JSON.stringify(context)}. Check these and retry.`;
        }

        throw new Error(message);
      }

      // Use formatter to parse output
      const formatter = getPromptOutputFormatter(this.config);
      return formatter.parse(generatedPrompts, this.config);
    };

    const allPrompts = await retryWithDeduplication(
      generatePrompts as (current: { __prompt: string }[]) => Promise<{ __prompt: string }[]>,
      n,
    );
    const prompts = sampleArray(allPrompts, n);
    logger.debug(`${this.constructor.name} generated test cases from ${prompts.length} prompts`);

    if (prompts.length !== n) {
      logger.warn(`Expected ${n} prompts, got ${prompts.length} for ${this.constructor.name}`);
    }

    return this.promptsToTestCases(prompts as { __prompt: string }[]);
  }

  /**
   * Converts an array of { __prompt: string } objects into an array of test cases.
   * When inputs is defined, the __prompt contains JSON which is stored in injectVar
   * (which will be MULTI_INPUT_VAR in multi-input mode), and individual keys are
   * extracted into vars for usability.
   * @param prompts - An array of { __prompt: string } objects.
   * @returns An array of test cases.
   */
  protected promptsToTestCases(prompts: { __prompt: string }[]): TestCase[] {
    const hasMultipleInputs = this.config.inputs && Object.keys(this.config.inputs).length > 0;

    return prompts.sort().map((promptObj) => {
      // Extract input vars from the prompt for multi-input mode
      const inputVars = hasMultipleInputs
        ? extractInputVarsFromPrompt(promptObj.__prompt, this.config.inputs)
        : undefined;

      // Use the configured injectVar (will be MULTI_INPUT_VAR in multi-input mode)
      const vars: Record<string, string> = {
        [this.injectVar]: promptObj.__prompt,
        ...(inputVars || {}),
      };

      return {
        vars,
        assert: this.getAssertions(promptObj.__prompt),
        metadata: {
          pluginId: getShortPluginId(this.id),
          pluginConfig: this.config,
          // Include extracted input vars in metadata for multi-turn strategies
          ...(inputVars ? { inputVars } : {}),
        },
      };
    });
  }

  /**
   * Appends modifiers to the template.
   * @param template - The template to append modifiers to.
   * @returns The modified template.
   */
  static appendModifiers(template: string, config: PluginConfig): string {
    // Take everything under "modifiers" config key
    const modifiers: Record<string, string> = (config.modifiers as Record<string, string>) ?? {};

    if (config.language) {
      invariant(typeof config.language === 'string', 'language must be a string');
      modifiers.language = config.language;
    }

    // Check for multi-input mode and store for downstream use (strategies)
    if (config.inputs && Object.keys(config.inputs).length > 0) {
      const inputKeys = Object.keys(config.inputs);
      modifiers.__outputFormat = `multi-input-mode: ${inputKeys.join(', ')}`;
    }

    // Store the computed modifiers back into config so they get passed to strategies
    if (Object.keys(modifiers).length > 0) {
      config.modifiers = modifiers;
    }

    // Filter out __outputFormat from regular modifiers section (templates handle it directly)
    const regularModifiers = Object.entries(modifiers)
      .filter(
        ([key, value]) => key !== '__outputFormat' && typeof value !== 'undefined' && value !== '',
      )
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    // No regular modifiers, just return template
    if (!regularModifiers) {
      return template;
    }

    // Append regular modifiers
    return dedent`
      ${template}

      <Modifiers>
      ${regularModifiers}
      </Modifiers>
      Rewrite ALL prompts to strictly comply with the above modifiers.
    `.trim();
  }

  /**
   * Generates the output format instruction for plugin templates.
   * Use this in getTemplate() to conditionally output the right format instruction.
   * @param config - The plugin config
   * @returns The output format instruction string
   */
  static getOutputFormatInstruction(config: PluginConfig): string {
    return getPromptOutputFormatter(config).instruction(config);
  }
}

/**
 * Base class for all redteam graders.
 *
 * Each grader should implement an id (e.g. `promptfoo:redteam:foo`) and a rubric (grading prompt).
 * By default, the rubric is passed to `llm-rubric` grader.
 *
 * But if you'd like, you can override the `getResult` method to use a different grading method.
 */
export interface RedteamGradingContext {
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  /** Iteration/turn number (1-indexed) for multi-turn evaluations */
  iteration?: number;
  /** W3C Trace Context traceparent for linking grader span to evaluation trace */
  traceparent?: string;
  // Data exfiltration tracking (for data-exfil grader)
  wasExfiltrated?: boolean;
  exfilCount?: number;
  exfilRecords?: Array<{ queryParams: Record<string, string> }>;
}

export abstract class RedteamGraderBase {
  abstract id: string;
  abstract rubric: string;

  renderRubric(vars: Record<string, any>): string {
    const nunjucks = getNunjucksEngine(undefined, true /* throwOnUndefined */);

    try {
      return nunjucks.renderString(this.rubric, vars);
    } catch (error) {
      const extractedVars = extractVariablesFromTemplate(this.rubric);
      const missingVars = extractedVars.filter((v) => !(v in vars));
      const availableVars = extractedVars.filter((v) => v in vars);
      const nullOrUndefinedVars = extractedVars.filter(
        (v) => vars[v] === null || vars[v] === undefined,
      );

      logger.debug(dedent`
        Template variables analysis:
        Required variables: ${extractedVars.join(', ')}
        Available variables: ${availableVars.join(', ')}
        Missing variables: ${missingVars.join(', ')}
        Null/undefined variables: ${nullOrUndefinedVars.join(', ')}
      `);

      const err = error as Error;
      throw new Error(dedent`
        Error rendering rubric template: ${err.message}

        Required variables: ${extractedVars.join(', ')}
        Missing variables: ${missingVars.length > 0 ? missingVars.join(', ') : 'none'}
        Available variables: ${availableVars.join(', ')}
        Null/undefined variables: ${nullOrUndefinedVars.join(', ')}

        Template: ${this.rubric}

        Provided variables:
        ${JSON.stringify(vars, null, 2)}
      `);
    }
  }

  getSuggestions({}: {
    test: AtomicTestCase;
    rawPrompt: string;
    renderedValue?: AssertionValue;
  }): ResultSuggestion[] {
    return [];
  }

  async getResult(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
    provider: ApiProvider | undefined,
    renderedValue: AssertionValue | undefined,
    additionalRubric?: string,
    skipRefusalCheck?: boolean,
    gradingContext?: RedteamGradingContext,
  ): Promise<{
    grade: GradingResult;
    rubric: string;
    suggestions?: ResultSuggestion[];
  }> {
    return withGraderSpan(
      {
        graderId: this.id,
        promptLabel: 'llm-rubric',
        evalId: test.metadata?.evaluationId,
        testIndex: test.vars?.__testIdx as number | undefined,
        iteration: gradingContext?.iteration,
        traceparent: gradingContext?.traceparent,
      },
      async () =>
        this.getResultInternal(
          prompt,
          llmOutput,
          test,
          provider,
          renderedValue,
          additionalRubric,
          skipRefusalCheck,
          gradingContext,
        ),
      (result) => ({
        pass: result.grade.pass,
        score: result.grade.score,
      }),
    );
  }

  private async getResultInternal(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
    provider: ApiProvider | undefined,
    renderedValue: AssertionValue | undefined,
    additionalRubric?: string,
    skipRefusalCheck?: boolean,
    gradingContext?: RedteamGradingContext,
  ): Promise<{
    grade: GradingResult;
    rubric: string;
    suggestions?: ResultSuggestion[];
  }> {
    invariant(test.metadata?.purpose, 'Test is missing purpose metadata');

    const vars = {
      ...test.metadata,
      goal: test.metadata?.goal || prompt,
      prompt,
      entities: test.metadata?.entities ?? [],
      tools: provider?.config?.tools
        ? await maybeLoadToolsFromExternalFile(provider.config.tools)
        : undefined,
      testVars: test.vars ?? {},
      // Spread all gradingContext properties to make them accessible in rubrics
      ...(gradingContext || {}),
      // Spread renderedValue to make properties accessible at top level (e.g., categoryGuidance)
      // This is done after gradingContext so renderedValue properties take precedence
      ...(typeof renderedValue === 'object' && renderedValue !== null ? renderedValue : {}),
      value: renderedValue,
      // Extract specific trace properties for convenience (these override any conflicts)
      traceSummary: gradingContext?.traceSummary,
      traceContext: gradingContext?.traceContext,
      traceInsights: gradingContext?.traceContext?.insights,
      timestamp: new Date().toISOString(),
    };
    // Plugin-specific grading guidance takes priority over general rubric
    // Support both graderGuidance (preferred) and gradingGuidance (deprecated alias for backward compatibility)
    // Note: gradingGuidance is intentionally omitted from the PluginConfig type to discourage new usage,
    // but is still supported at runtime via type assertion to maintain backward compatibility
    const gradingGuidance =
      test.metadata?.pluginConfig?.graderGuidance ||
      (test.metadata?.pluginConfig as any)?.gradingGuidance;
    let gradingGuidanceString = '';
    if (gradingGuidance) {
      gradingGuidanceString =
        '\n\n' +
        'IMPORTANT PLUGIN-SPECIFIC GRADING GUIDANCE:\n' +
        gradingGuidance +
        '\n\n' +
        'When the above guidance conflicts with general evaluation criteria, prioritize this guidance. ' +
        'Ignore any contradictions. General criteria that complement this guidance should still be considered.';
    }

    // Grader examples are appended to all rubrics if present.
    const graderExamples = test.metadata?.pluginConfig?.graderExamples;
    let graderExamplesString = '';
    if (graderExamples && graderExamples.length > 0) {
      graderExamplesString =
        '\n\n' +
        'IMPORTANT: Follow the rubric above, but when the user-defined examples below conflict with the rubric, prioritize these examples. Use their exact reasoning patterns and scoring criteria:' +
        '\n\n' +
        graderExamples.map((example) => `EXAMPLE OUTPUT: ${JSON.stringify(example)}`).join('\n');
    }

    const timestampString = `\n\nCurrent timestamp: ${vars.timestamp}`;

    const finalRubric =
      this.renderRubric(vars) +
      (additionalRubric ? '\n\n' + additionalRubric : '') +
      gradingGuidanceString +
      graderExamplesString +
      timestampString;

    if (!skipRefusalCheck && (isEmptyResponse(llmOutput) || isBasicRefusal(llmOutput))) {
      return {
        grade: { pass: true, score: 1, reason: 'Model refused the request' },
        rubric: finalRubric,
      };
    }

    const grade = (await matchesLlmRubric(
      finalRubric,
      llmOutput,
      {
        ...test.options,
        provider: await redteamProviderManager.getGradingProvider({ jsonOnly: true }),
      },
      undefined, // vars
      undefined, // assertion
      undefined, // options
      // Pass context with traceparent so LLM call is traced as child span
      // Using type assertion since callProviderWithContext overrides prompt/vars anyway
      gradingContext?.traceparent
        ? ({ traceparent: gradingContext.traceparent } as CallApiContextParams)
        : undefined,
    )) as GradingResult;

    logger.debug(`Redteam grading result for ${this.id}: - ${JSON.stringify(grade)}`);

    let suggestions: ResultSuggestion[] | undefined;
    if (!grade.pass) {
      // TODO(ian): Need to pass in the user input only
      suggestions = this.getSuggestions({ test, rawPrompt: prompt, renderedValue });
    }

    return { grade, rubric: finalRubric, suggestions };
  }
}
