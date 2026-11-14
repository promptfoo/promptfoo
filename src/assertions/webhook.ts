import { getEnvInt } from '../envars';
import { fetchWithRetries } from '../util/fetch/index';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

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
    invariant(
      typeof jsonResponse?.pass === 'boolean',
      'Webhook response must be a JSON object with a boolean "pass" property',
    );
    const webhookScore = jsonResponse.score;
    invariant(
      webhookScore === undefined ||
        (typeof webhookScore === 'number' && webhookScore >= 0 && webhookScore <= 1),
      'Webhook response "score" must be a finite number between 0 and 1',
    );
    const pass = jsonResponse.pass !== inverse;
    const score = webhookScore ?? (jsonResponse.pass ? 1 : 0);

    const reason =
      jsonResponse.reason ||
      (pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`);

    return {
      pass,
      score: inverse ? 1 - score : score,
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
