import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import { GradingResult } from '../../types';
import { getNunjucksEngine } from '../../util/templates';

const nunjucks = getNunjucksEngine();

export default abstract class RedteamModelGrader {
  abstract id: string;
  abstract rubric: string;

  async getResult(prompt: string, llmOutput: string): Promise<GradingResult> {
    const finalRubric = nunjucks.renderString(this.rubric, { prompt });
    const result = await matchesLlmRubric(finalRubric, llmOutput);
    logger.debug(`Redteam grading result for ${this.id}: - ${JSON.stringify(result)}`);
    return result;
  }
}
