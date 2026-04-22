// These metrics are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import { callProviderWithContext, getAndCheckProvider } from '../../matchers/providers';
import { loadRubricPrompt } from '../../matchers/rubric';
import { fail } from '../../matchers/shared';
import { getDefaultProviders } from '../../providers/defaults';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { ConversationRelevancyTemplate, type MessageRole } from './conversationRelevancyTemplate';

import type {
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  TokenUsage,
  VarValue,
} from '../../types/index';

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
  vars?: Record<string, VarValue>,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'conversation relevancy check',
  );

  // Convert messages to the format expected by ConversationRelevancyTemplate
  // Messages contain runtime data (model output in msg.output, conversation prompts in
  // msg.input) and must NOT be rendered as Nunjucks templates. Rendering untrusted model
  // output as a template enables SSTI — credential exfiltration via {{env.SECRET}} and
  // RCE via {{range.constructor(...)()}}. Pass messages through as data only.
  const messageRoles: MessageRole[] = [];
  for (const msg of messages) {
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
  // Load rubric prompt from file if specified, supporting file:// references with templates
  const loadedRubricPrompt = grading?.rubricPrompt
    ? await loadRubricPrompt(grading.rubricPrompt, '')
    : '';

  let promptText: string;
  if (loadedRubricPrompt) {
    // Use custom rubric prompt with nunjucks rendering
    promptText = nunjucks.renderString(loadedRubricPrompt, {
      messages,
      ...(vars || {}),
    });
  } else {
    // Use the template which already includes the messages
    promptText = ConversationRelevancyTemplate.generateVerdicts(messageRoles);
  }

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'conversation-relevance',
    { messages, ...(vars || {}) },
    providerCallContext,
  );
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
