import { DEFAULT_AGENT_GRADING_PROMPT } from '../prompts/grading';
import { isAgenticProvider } from '../providers/agentic-utils';
import { getCodexDefaultProviders } from '../providers/openai/codexDefaults';
import { getGradingProvider } from './providers';
import { runJsonGradingPrompt } from './rubric';
import { tryParse } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  VarValue,
} from '../types/index';

export async function matchesAgentRubric(
  rubric: string | object,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const configuredProvider = grading.provider
    ? await getGradingProvider('text', grading.provider, null)
    : null;
  const agentProvider = configuredProvider || getCodexDefaultProviders().llmRubricProvider;

  if (!agentProvider || !isAgenticProvider(agentProvider)) {
    throw new Error(
      'agent-rubric assertion requires an agentic grading provider. ' +
        'Use openai:codex-sdk, openai:codex-app-server, anthropic:claude-agent-sdk, opencode:sdk, or pi.',
    );
  }

  const result = await runJsonGradingPrompt({
    assertion,
    checkName: 'agent-rubric check',
    defaultPrompt: DEFAULT_AGENT_GRADING_PROMPT,
    grading: {
      ...grading,
      provider: agentProvider,
    },
    label: 'agent-rubric',
    providerCallContext,
    vars: {
      output: tryParse(llmOutput),
      rubric,
      ...(vars || {}),
    },
  });

  return {
    ...result,
    metadata: {
      ...result.metadata,
      agentProvider: agentProvider.id(),
    },
  };
}
