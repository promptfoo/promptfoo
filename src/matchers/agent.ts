import { DEFAULT_AGENT_GRADING_PROMPT } from '../prompts/grading';
import { isAgenticGradingProvider } from '../providers/agentic-utils';
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
  targetWorkingDir?: string,
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

  if (!agentProvider || !isAgenticGradingProvider(agentProvider)) {
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
    // A copied target workspace is the default grader workspace. Explicit grader
    // working_dir remains authoritative; the shared instance is never mutated.
    providerPromptConfig:
      targetWorkingDir && (!configuredProvider || !agentProvider.config?.working_dir)
        ? { working_dir: targetWorkingDir }
        : undefined,
    vars: {
      ...(vars || {}),
      output: tryParse(llmOutput),
      rubric,
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
