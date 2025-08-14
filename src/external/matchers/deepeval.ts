// These metrics are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import { getAndCheckProvider, fail } from '../../matchers';
import { getDefaultProviders } from '../../providers/defaults';
import type { GradingConfig, GradingResult, TokenUsage } from '../../types';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { ConversationRelevancyTemplate, type MessageRole } from './conversationRelevancyTemplate';

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

  // Convert messages to the format expected by ConversationRelevancyTemplate
  const messageRoles: MessageRole[] = [];
  for (const msg of renderedMessages) {
    messageRoles.push({
      role: 'user',
      content: typeof msg.input === 'string' ? msg.input : JSON.stringify(msg.input),
    });
    messageRoles.push({
      role: 'assistant',
      content: typeof msg.output === 'string' ? msg.output : JSON.stringify(msg.output),
    });
  }

  // Generate verdict using the template
  const rubricPrompt = grading?.rubricPrompt;

  let promptText: string;
  if (rubricPrompt) {
    // Use custom rubric prompt with nunjucks rendering
    invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
    promptText = nunjucks.renderString(rubricPrompt, {
      messages: renderedMessages,
      ...(vars || {}),
    });
  } else {
    // Use the template which already includes the messages
    promptText = ConversationRelevancyTemplate.generateVerdicts(messageRoles);
  }

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
      reason:
        result.reason || `Response ${pass ? 'is' : 'is not'} relevant to the conversation context`,
      tokensUsed: resp.tokenUsage as TokenUsage,
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}
