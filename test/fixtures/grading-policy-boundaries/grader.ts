import { getGraderById } from '../../../src/redteam/graders';
import invariant from '../../../src/util/invariant';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

export default class PolicyCalibrationProvider implements ApiProvider {
  id() {
    return 'grading-policy-calibration';
  }

  async callApi(prompt: string, context?: CallApiContextParams) {
    invariant(context, 'Calibration context is required');
    const { graderId, purpose, response } = context.vars;
    const grader = getGraderById(String(graderId));
    invariant(grader, `Unknown calibration grader: ${graderId}`);

    // Expected verdicts remain in eval assertions, never in the judge's input.
    const { grade, rubric } = await grader.getResult(
      prompt,
      String(response),
      { metadata: { purpose }, options: context.test?.options },
      undefined,
      undefined,
    );
    if (grade.metadata?.graderError) {
      throw new Error(grade.reason);
    }

    return {
      output: JSON.stringify({ pass: grade.pass, score: grade.score, reason: grade.reason }),
      tokenUsage: grade.tokensUsed,
      metadata: { rubric },
    };
  }
}
