// These metrics are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import dedent from 'dedent';
import { getAndCheckProvider, fail } from '../../matchers';
import { getDefaultProviders } from '../../providers/defaults';
import type { GradingConfig, GradingResult, TokenUsage } from '../../types';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';

const nunjucks = getNunjucksEngine(undefined, false, true);

export interface Message {
  input: string;
  output: string | object;
}

interface VerdictResult {
  verdict: 'yes' | 'no';
  reason?: string;
}

export async function matchesConversationRelevance(
  messages: Message[],
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

  // First, render any variables within the messages themselves
  const renderedMessages = messages.map((msg) => ({
    input:
      typeof msg.input === 'string' && vars ? nunjucks.renderString(msg.input, vars) : msg.input,
    output:
      typeof msg.output === 'string' && vars ? nunjucks.renderString(msg.output, vars) : msg.output,
  }));

  // Generate verdict using LLM
  const defaultRubricPrompt = dedent`Based on the given list of message exchanges between a user and an LLM, generate a JSON object to indicate whether the LAST \`output\` is relevant to the LAST \`input\` in messages. The JSON will have 2 fields: 'verdict' and 'reason'.
  The 'verdict' key should STRICTLY be either 'yes' or 'no', which states whether the last \`output\` is relevant to the last \`input\`. 
  Provide a 'reason' ONLY if the answer is 'no'. 
  You MUST USE the previous messages (if any) provided in the list of messages to make an informed judgement on relevancy.
  
  **
  IMPORTANT: 
  - Please make sure to only return in JSON format.
  - You MUST ONLY provide a verdict for the LAST message on the list but MUST USE context from the previous messages.
  - You DON'T have to provide a reason if the answer is 'yes'.
  - ONLY provide a 'no' answer if the LLM response is COMPLETELY irrelevant to the message input.
  - Vague LLM responses to vague inputs, such as greetings DOES NOT count as irrelevant to the conversation.
  **
  Messages:
  {{ messages | dump(2) }}
  JSON:`;

  const rubricPrompt = grading?.rubricPrompt || defaultRubricPrompt;

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  const promptText = nunjucks.renderString(rubricPrompt, {
    messages: renderedMessages,
    ...(vars || {}),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(
    typeof resp.output === 'string',
    'conversation relevancy check produced malformed response',
  );

  try {
    const jsonObjects = extractJsonObjects(resp.output);
    if (jsonObjects.length === 0) {
      throw new Error('No JSON object found in response');
    }

    const result = jsonObjects[0] as VerdictResult;
    const pass = result.verdict === 'yes';
    const score = pass ? 1 : 0;

    return {
      pass: score >= threshold - Number.EPSILON,
      score,
      reason: result.reason || `Response ${pass ? 'is' : 'is not'} relevant to the input`,
      tokensUsed: resp.tokenUsage as TokenUsage,
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}
