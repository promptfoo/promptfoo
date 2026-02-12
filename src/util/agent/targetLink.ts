/**
 * CLI-side TargetLink helper.
 *
 * One-liner to wire probe handling onto an AgentClient:
 *   attachTargetLink(client, provider)
 *
 * Extracted from discover.ts's inline probe handler.
 */

import logger from '../../logger';
import { TargetLinkEvents } from '../../types/targetLink';

import type { ApiProvider } from '../../types/providers';
import type { ProbeRequest } from '../../types/targetLink';
import type { AgentClient } from './agentClient';

/**
 * Wire a target link onto an existing AgentClient.
 *
 * 1. Listens for PROBE events
 * 2. Calls provider.callApi(prompt) for each probe
 * 3. Emits PROBE_RESULT with the result
 * 4. Emits READY to unblock the server's waitForReady
 */
export function attachTargetLink(client: AgentClient, provider: ApiProvider): void {
  // Set up probe handler BEFORE signaling ready
  client.on(TargetLinkEvents.PROBE, (payload: ProbeRequest) => {
    void (async () => {
      const { requestId, prompt } = payload;
      logger.debug('[TargetLink] Received probe request', { requestId });

      try {
        const response = await provider.callApi(prompt, {
          vars: {},
          prompt: { raw: prompt, label: 'target-link-probe' },
        });

        const output = response.output ?? '';
        client.emit(TargetLinkEvents.PROBE_RESULT, {
          requestId,
          output: typeof output === 'string' ? output : JSON.stringify(output),
          tokenUsage: response.tokenUsage
            ? {
                input: response.tokenUsage.prompt || 0,
                output: response.tokenUsage.completion || 0,
                total: response.tokenUsage.total || 0,
              }
            : undefined,
        });
      } catch (error) {
        client.emit(TargetLinkEvents.PROBE_RESULT, {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  // Signal ready — unblocks server's waitForReady
  client.emit(TargetLinkEvents.READY);
}
