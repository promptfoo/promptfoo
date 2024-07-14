import invariant from 'tiny-invariant';
import type { ApiProvider, Assertion, TestCase } from '../../types';
import { getNunjucksEngine } from '../../util';

/**
 * Abstract base class for creating plugins that generate test cases.
 */
export default abstract class PluginBase {
  /**
   * Template string used to generate prompts.
   */
  protected abstract template: string;

  /**
   * Constructs a new PluginBase instance.
   *
   * @param provider - The API provider used to call the API.
   * @param purpose - The purpose of the system being tested.
   * @param injectVar - The variable to inject into the test cases.
   */
  constructor(
    protected provider: ApiProvider,
    protected purpose: string,
    protected injectVar: string,
  ) {}

  /**
   * Abstract method to get the assertion for a given prompt.
   *
   * @param prompt - The prompt for which to get the assertion.
   * @returns The assertion object.
   */
  protected abstract getAssertions(prompt: string): Assertion[];

  /**
   * Generates test cases based on the provided template and purpose.
   *
   * @returns A promise that resolves to an array of test cases.
   */
  async generateTests(): Promise<TestCase[]> {
    const nunjucks = getNunjucksEngine();
    const { output: generatedPrompts } = await this.provider.callApi(
      nunjucks.renderString(this.template, {
        purpose: this.purpose,
      }),
    );
    invariant(typeof generatedPrompts === 'string', 'Expected generatedPrompts to be a string');
    const prompts = generatedPrompts
      .split('\n')
      .filter((line) => line.includes('Prompt:'))
      .map((line) => line.substring(line.indexOf('Prompt:') + 'Prompt:'.length).trim());

    return prompts.map((prompt) => ({
      vars: {
        [this.injectVar]: prompt,
      },
      assert: this.getAssertions(prompt),
    }));
  }
}
