import { getEnvInt } from '../envars';
import { fetchWithRetries } from '../fetch';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export async function handleWebhook({
  assertion,
  renderedValue,
  test,
  prompt,
  output,
  inverse,
}: AssertionParams): Promise<GradingResult> {
  invariant(renderedValue, '"webhook" assertion type must have a URL value');
  invariant(typeof renderedValue === 'string', '"webhook" assertion type must have a URL value');
  try {
    const context = {
      prompt,
      vars: test.vars || {},
    };
    const response = await fetchWithRetries(
      renderedValue,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ output, context }),
      },
      getEnvInt('WEBHOOK_TIMEOUT', 5000),
    );

    if (!response.ok) {
      throw new Error(`Webhook response status: ${response.status}`);
    }

    const jsonResponse = await response.json();
    const pass = jsonResponse.pass !== inverse;
    const score =
      typeof jsonResponse.score === 'undefined'
        ? pass
          ? 1
          : 0
        : inverse
          ? 1 - jsonResponse.score
          : jsonResponse.score;

    const reason =
      jsonResponse.reason ||
      (pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`);

    return {
      pass,
      score,
      reason,
      assertion,
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Webhook error: ${(err as Error).message}`,
      assertion,
    };
  }
}
