import dedent from 'dedent';
import invariant from 'tiny-invariant';
import cliState from '../../cliState';
import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import type {
  ApiProvider,
  Assertion,
  AssertionValue,
  PluginConfig,
  ResultSuggestion,
  TestCase,
} from '../../types';
import type { AtomicTestCase, GradingResult } from '../../types';
import { maybeLoadFromExternalFile } from '../../util';
import { retryWithDeduplication, sampleArray } from '../../util/generation';
import { getNunjucksEngine } from '../../util/templates';
import { loadRedteamProvider } from '../providers/shared';
import { removePrefix } from '../util';

/**
 * Abstract base class for creating plugins that generate test cases.
 */
export abstract class PluginBase {
  /**
   * Creates an instance of PluginBase.
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
    logger.debug(`PluginBase initialized with purpose: ${purpose}, injectVar: ${injectVar}`);
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
   * @returns A promise that resolves to an array of TestCase objects.
   */
  async generateTests(n: number, delayMs: number = 0): Promise<TestCase[]> {
    logger.debug(`Generating ${n} test cases`);
    const batchSize = 20;

    /**
     * Generates a batch of prompts using the API provider.
     * @param currentPrompts - The current list of prompts.
     * @returns A promise that resolves to an array of new prompts.
     */
    const generatePrompts = async (
      currentPrompts: { prompt: string }[],
    ): Promise<{ prompt: string }[]> => {
      const remainingCount = n - currentPrompts.length;
      const currentBatchSize = Math.min(remainingCount, batchSize);

      logger.debug(`Generating batch of ${currentBatchSize} prompts`);
      const nunjucks = getNunjucksEngine();
      const renderedTemplate = nunjucks.renderString(await this.getTemplate(), {
        purpose: this.purpose,
        n: currentBatchSize,
      });

      const finalTemplate = this.appendModifiers(renderedTemplate);
      const { output: generatedPrompts, error } = await this.provider.callApi(finalTemplate);
      if (delayMs > 0) {
        logger.debug(`Delaying for ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
      return this.parseGeneratedPrompts(generatedPrompts);
    };
    const allPrompts = await retryWithDeduplication(generatePrompts, n);
    const prompts = sampleArray(allPrompts, n);
    logger.debug(`${this.constructor.name} generating test cases from ${prompts.length} prompts`);
    return this.promptsToTestCases(prompts);
  }

  /**
   * Converts an array of { prompt: string } objects into an array of test cases.
   * @param prompts - An array of { prompt: string } objects.
   * @returns An array of test cases.
   */
  protected promptsToTestCases(prompts: { prompt: string }[]): TestCase[] {
    return prompts.sort().map((prompt) => ({
      vars: {
        [this.injectVar]: prompt.prompt,
      },
      assert: this.getAssertions(prompt.prompt),
    }));
  }

  /**
   * Parses the LLM response of generated prompts into an array of objects.
   *
   * @param generatedPrompts - The LLM response of generated prompts.
   * @returns An array of { prompt: string } objects. Each of these objects represents a test case.
   */
  protected parseGeneratedPrompts(generatedPrompts: string): { prompt: string }[] {
    const parsePrompt = (line: string): string | null => {
      if (!line.toLowerCase().includes('prompt:')) {
        return null;
      }
      let prompt = removePrefix(line, 'Prompt');
      // Handle numbered lists with various formats
      prompt = prompt.replace(/^\d+[\.\)\-]?\s*-?\s*/, '');
      // Handle quotes
      prompt = prompt.replace(/^["'](.*)["']$/, '$1');
      // Handle nested quotes
      prompt = prompt.replace(/^'([^']*(?:'{2}[^']*)*)'$/, (_, p1) => p1.replace(/''/g, "'"));
      prompt = prompt.replace(/^"([^"]*(?:"{2}[^"]*)*)"$/, (_, p1) => p1.replace(/""/g, '"'));
      return prompt.trim();
    };

    // Split by newline or semicolon
    const promptLines = generatedPrompts.split(/[\n;]+/);

    return promptLines
      .map(parsePrompt)
      .filter((prompt): prompt is string => prompt !== null)
      .map((prompt) => ({ prompt }));
  }

  private appendModifiers(template: string): string {
    // Take everything under "modifiers" config key
    const modifiers: Record<string, string> =
      (this.config.modifiers as Record<string, string>) ?? {};

    // Right now, only pre-configured modifier is language
    if (this.config.language) {
      invariant(typeof this.config.language === 'string', 'language must be a string');
      modifiers.language = this.config.language;
    }

    // No modifiers
    if (
      Object.keys(modifiers).length === 0 ||
      Object.values(modifiers).every((value) => typeof value === 'undefined' || value === '')
    ) {
      return template;
    }

    // Append all modifiers
    const modifierSection = Object.entries(modifiers)
      .filter(([key, value]) => typeof value !== 'undefined' && value !== '')
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return dedent`
      ${template.trim()}

      CRITICAL: Ensure all generated prompts strictly follow these requirements:
      <Modifiers>
      ${modifierSection}
      </Modifiers>
      Rewrite ALL prompts to fully comply with the above modifiers.
    `.trim();
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
export abstract class RedteamModelGrader {
  abstract id: string;
  abstract rubric: string;

  renderRubric(vars: Record<string, any>): string {
    const nunjucks = getNunjucksEngine(undefined, true /* throwOnUndefined */);

    try {
      return nunjucks.renderString(this.rubric, vars);
    } catch (error) {
      const err = error as Error;
      logger.debug(`Error rendering rubric template: ${err.message}`);
      logger.debug(`Template: ${this.rubric}`);
      logger.debug(`Variables: ${JSON.stringify(vars)}`);
      throw new Error(dedent`
        Error rendering rubric template: ${err.message}

        Variables: ${JSON.stringify(vars, null, 2)}
      `);
    }
  }

  getSuggestions({
    test,
    rawPrompt,
    renderedValue,
  }: {
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
  ): Promise<{ grade: GradingResult; rubric: string; suggestions?: ResultSuggestion[] }> {
    invariant(test.metadata?.purpose, 'Test is missing purpose metadata');
    const vars = {
      ...test.metadata,
      prompt,
      entities: test.metadata?.entities ?? [],
      tools: maybeLoadFromExternalFile(provider?.config?.tools),
      value: renderedValue,
    };
    const finalRubric = this.renderRubric(vars);

    const grade = await matchesLlmRubric(finalRubric, llmOutput, {
      ...test.options,
      provider: await loadRedteamProvider({
        provider:
          // First try loading the provider from defaultTest, otherwise fall back to the default red team provider.
          cliState.config?.defaultTest?.provider ||
          cliState.config?.defaultTest?.options?.provider?.text ||
          cliState.config?.defaultTest?.options?.provider,
        jsonOnly: true,
      }),
    });
    logger.debug(`Redteam grading result for ${this.id}: - ${JSON.stringify(grade)}`);

    let suggestions;
    if (!grade.pass) {
      // TODO(ian): Need to pass in the user input only
      suggestions = this.getSuggestions({ test, rawPrompt: prompt, renderedValue });
    }

    return { grade, rubric: finalRubric, suggestions };
  }
}
