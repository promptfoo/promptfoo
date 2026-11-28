import { shouldGenerateRemote } from '../../remoteGeneration';
import {
  type CrescendoConfig,
  CrescendoProvider,
  type CrescendoResponse,
} from '../crescendo/index';
import { REACT_CRESCENDO_SYSTEM_PROMPT } from './prompts';

// Derived from the base class (same-layer import above) so this module adds
// no new redteam -> legacy-contracts imports; the architecture baseline
// ratchet rejects any widening of that cross-layer edge.
type ReactCrescendoContext = Parameters<CrescendoProvider['callApi']>[1];
type ReactCrescendoOptions = Parameters<CrescendoProvider['callApi']>[2];

/**
 * ReAct crescendo provider.
 *
 * Reuses the full crescendo multi-turn execution path (backtracking,
 * refusal/eval scoring, grading, tracing, per-turn layers) but drives attack
 * generation with an explicit per-turn ReAct loop (OBSERVE -> REASON -> ACT)
 * inspired by PAIR (Chao et al. 2023) and TAP (Mehrotra et al. 2023).
 *
 * The attacker must observe each target response, reason about why the last
 * approach succeeded or failed, switch strategy vectors when stalled, and
 * only then generate the next prompt.
 */
export class ReactCrescendoProvider extends CrescendoProvider {
  constructor(config: CrescendoConfig) {
    super(config, {
      providerId: 'promptfoo:redteam:react-crescendo',
      strategyId: 'react-crescendo',
      systemPromptTemplate: REACT_CRESCENDO_SYSTEM_PROMPT,
    });
  }

  async callApi(
    prompt: string,
    context?: ReactCrescendoContext,
    options?: ReactCrescendoOptions,
  ): Promise<CrescendoResponse> {
    // The shared remote `crescendo` task does not know the ReAct prompt, so
    // running it remotely would silently record plain-Crescendo attacks as
    // `react-crescendo` results. Fail fast and point at a local provider
    // instead. (Refusal/eval scoring stays remote-capable via the base class.)
    if (shouldGenerateRemote() && !this.config.redteamProvider) {
      throw new Error(
        '[ReactCrescendo] Remote attack generation does not support the ReAct prompt. ' +
          'Set `redteamProvider` to a local provider in the strategy config, or disable remote generation.',
      );
    }
    return super.callApi(prompt, context, options);
  }
}
