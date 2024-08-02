import invariant from 'tiny-invariant';
import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import type { AtomicTestCase, GradingResult } from '../../types';
import { getNunjucksEngine } from '../../util/templates';

const nunjucks = getNunjucksEngine();

/**
 * Base class for all redteam graders.
 *
 * Each grader should implement an id (e.g. `promptfoo:redteam:foo`) and a rubric (grading prompt).
 * By default, the rubric is passed to `llm-rubric` grader.
 *
 * But if you'd like, you can override the `getResult` method to use a different grading method.
 */
export default abstract class RedteamModelGrader {
  abstract id: string;
  abstract rubric: string;

  async getResult(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
  ): Promise<{ grade: GradingResult; rubric: string }> {
    invariant(test.metadata?.purpose, 'Test is missing purpose metadata');
    const finalRubric = nunjucks.renderString(this.rubric, {
      prompt,
      purpose: test.metadata?.purpose,
      entities: test.metadata?.entities ?? [],
      harmCategory: test.metadata?.harmCategory,
    });
    const grade = await matchesLlmRubric(finalRubric, llmOutput, {});
    logger.debug(`Redteam grading result for ${this.id}: - ${JSON.stringify(grade)}`);
    return { grade, rubric: finalRubric };
  }
}
