// These metrics are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import { getAndCheckProvider, fail } from '../../matchers';
import { getDefaultProviders } from '../../providers/defaults';
import type { GradingConfig, GradingResult } from '../../types';
import invariant from '../../util/invariant';
import { getNunjucksEngine } from '../../util/templates';

const nunjucks = getNunjucksEngine(undefined, false, true);

function fromVars(vars?: Record<string, string | object>) {
  if (!vars) {
    return {};
  }

  const ret: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'object') {
      ret[key] = JSON.stringify(value, null, 2);
    } else {
      ret[key] = JSON.stringify(value, null, 2).slice(1, -1);
    }
  }

  return ret;
}

export async function matchesConversationRelevance(
  messages: { input: string; actualOutput: string }[],
  threshold: number,
  vars?: Record<string, string | object>,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'conversation relevancy check',
  );

  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
  };

  // Generate verdict using LLM
  const rubricPrompt =
    grading?.rubricPrompt ||
    `Based on the given list of message exchanges between a user and an LLM, generate a JSON object to indicate whether the LAST \`actualOutput\` is relevant to the LAST \`input\` in messages. The JSON will have 2 fields: 'verdict' and 'reason'.
  The 'verdict' key should STRICTLY be either 'yes' or 'no', which states whether the last \`actual output\` is relevant to the last \`input\`. 
  Provide a 'reason' ONLY if the answer is 'no'. 
  You MUST USE the previous messages (if any) provided in the list of messages to make an informed judgement on relevancy.
  **
  IMPORTANT: Please make sure to only return in JSON format.
  You MUST ONLY provide a verdict for the LAST message on the list but MUST USE context from the previous messages.
  You DON'T have to provide a reason if the answer is 'yes'.
  ONLY provide a 'no' answer if the LLM response is COMPLETELY irrelevant to the message input.
  Vague LLM responses to vague inputs, such as greetings DOES NOT count as irrelevancies!
  **
  Messages:
  ${JSON.stringify(messages, null, 2)}
  JSON:`;

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  const promptText = nunjucks.renderString(rubricPrompt, {
    ...fromVars(vars),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    tokensUsed.total += resp.tokenUsage?.total || 0;
    tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
    tokensUsed.completion += resp.tokenUsage?.completion || 0;
    tokensUsed.cached += resp.tokenUsage?.cached || 0;
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(
    typeof resp.output === 'string',
    'conversation relevancy check produced malformed response',
  );

  try {
    const result = JSON.parse(resp.output);
    const pass = result.verdict === 'yes';
    const score = pass ? 1 : 0;

    return {
      pass: score >= threshold - Number.EPSILON,
      score,
      reason: result.reason || `Response ${pass ? 'is' : 'is not'} relevant to the input`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
      },
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}
