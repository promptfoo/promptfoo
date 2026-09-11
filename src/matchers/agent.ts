import { DEFAULT_AGENT_GRADING_PROMPT } from '../prompts/grading';
import { isAgenticGradingProvider } from '../providers/agentic-utils';
import { getProviderLoadPath } from '../providers/index';
import { getCodexDefaultProviders } from '../providers/openai/codexDefaults';
import { renderGradingProviderConfig } from '../util/gradingProviderConfig';
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

  const gradingVars = { ...vars, output: tryParse(llmOutput), rubric };
  const configuredProvider = grading.provider
    ? await getGradingProvider('text', grading.provider, null, (config, env) =>
        renderGradingProviderConfig(config, gradingVars, env, providerCallContext?.filters),
      )
    : null;
  const agentProvider = configuredProvider || getCodexDefaultProviders().llmRubricProvider;

  const providerPath = agentProvider && getProviderLoadPath(agentProvider);
  // Factory identity recognizes custom IDs, while custom file providers retain
  // their existing ability to identify themselves as an agentic runtime.
  const runtimeProvider =
    providerPath && !isAgenticGradingProvider(agentProvider)
      ? { ...agentProvider, id: () => providerPath }
      : agentProvider;
  if (!agentProvider || !isAgenticGradingProvider(runtimeProvider)) {
    throw new Error(
      'agent-rubric assertion requires an agentic grading provider. ' +
        'Use openai:codex-sdk, openai:codex-app-server, anthropic:claude-agent-sdk, openinterpreter, or opencode:sdk.',
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
    vars: gradingVars,
  });

  return {
    ...result,
    metadata: {
      ...result.metadata,
      agentProvider: agentProvider.id(),
    },
  };
}
