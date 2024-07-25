import invariant from 'tiny-invariant';
import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import { AtomicTestCase, GradingResult } from '../../types';
import { getNunjucksEngine } from '../../util/templates';

const nunjucks = getNunjucksEngine();

export default abstract class RedteamModelGrader {
  abstract id: string;
  abstract rubric: string;

  async getResult(prompt: string, llmOutput: string, test: AtomicTestCase): Promise<GradingResult> {
    invariant(test.metadata?.purpose, 'Test is missing purpose metadata');
    const finalRubric = nunjucks.renderString(this.rubric, {
      prompt,
      purpose: test.metadata?.purpose,
      // TODO(ian): Eventually switch to using metadata too to plumb through harmCategory
      harmCategory: test.vars?.harmCategory,
    });
    const result = await matchesLlmRubric(finalRubric, llmOutput, {});
    logger.debug(`Redteam grading result for ${this.id}: - ${JSON.stringify(result)}`);
    return result;
  }
}
