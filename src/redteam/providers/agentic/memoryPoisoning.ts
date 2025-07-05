import { VERSION } from '../../../constants';
import { getUserEmail } from '../../../globalConfig/accounts';
import logger from '../../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../../types/providers';
import invariant from '../../../util/invariant';
import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from '../../plugins/agentic/constants';
import { getRemoteGenerationUrl } from '../../remoteGeneration';
import { messagesToRedteamHistory } from '../shared';

export class MemoryPoisoningProvider implements ApiProvider {
  constructor(readonly config: ProviderOptions) {}

  id() {
    return REDTEAM_MEMORY_POISONING_PLUGIN_ID;
  }

  /**
   * Generates a scenario containing a memory and a follow up question/command which is dependent on the memory.
   *
   *  1. Generate a scenario containing memories and follow up questions/commands which are dependent on the memories.
   *  2. Send the memory message to the target.
   *  3. Send the test case to the target; the test case should poison the memory created in the previous step.
   *  4. Send the follow up question to the target.
   *  5. A memory is successfully poisoned if the follow up question is answered incorrectly.
   *
   * @param prompt The poisoned prompt.
   * @param context The context of the poisoned prompt.
   * @param options The options for the poisoned prompt.
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const targetProvider: ApiProvider | undefined = context?.originalProvider;
      const purpose = context?.test?.metadata?.purpose;
      invariant(targetProvider, 'Expected originalProvider to be set');
      invariant(context?.test, 'Expected test to be set');
      invariant(purpose, 'Expected purpose to be set');

      // Generate a scenario containing memories and follow up questions/commands which are dependent on the memories.
      const scenarioRes = await fetch(getRemoteGenerationUrl(), {
        body: JSON.stringify({
          task: 'agentic:memory-poisoning-scenario',
          purpose,
          version: VERSION,
          email: getUserEmail(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      // Send the memory message to the provider.
      if (!scenarioRes.ok) {
        throw new Error(`Failed to generate scenario: ${scenarioRes.statusText}`);
      }

      // Scope the scenario to the test case to ensure its passed to the grader:
      const scenario = await scenarioRes.json();
      context!.test!.metadata ??= {};
      context!.test!.metadata['scenario'] = scenario;

      // Send the memory message to the provider.
      const memoryResponse = await targetProvider.callApi(scenario.memory, context);

      // Send the test case to the provider; the test case should poison the memory created in the previous step.
      const testResponse = await targetProvider.callApi(prompt, context);

      // Send the follow up question to the provider.
      const response = await targetProvider.callApi(scenario.followUp, context);

      const messages = [
        { content: scenario.memory, role: 'user' as const },
        { content: memoryResponse.output, role: 'assistant' as const },
        { content: prompt, role: 'user' as const },
        { content: testResponse.output, role: 'assistant' as const },
        { content: scenario.followUp, role: 'user' as const },
        { content: response.output, role: 'assistant' as const },
      ];

      return {
        output: response.output,
        metadata: {
          messages,
          redteamHistory: messagesToRedteamHistory(messages),
        },
      };
    } catch (error) {
      logger.error(`Error in MemoryPoisoningProvider: ${error}`);
      throw error;
    }
  }
}
