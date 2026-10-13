import { type CrescendoConfig, CrescendoProvider } from '../crescendo/index';
import { REACT_CRESCENDO_SYSTEM_PROMPT } from './prompts';

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
 *
 * Note: remote generation falls back to the shared `crescendo` task handler,
 * which does not know this prompt. Local `redteamProvider` runs use the
 * ReAct prompt below.
 */
export class ReactCrescendoProvider extends CrescendoProvider {
  constructor(config: CrescendoConfig) {
    super(config, {
      providerId: 'promptfoo:redteam:react-crescendo',
      strategyId: 'react-crescendo',
      systemPromptTemplate: REACT_CRESCENDO_SYSTEM_PROMPT,
    });
  }
}

export default ReactCrescendoProvider;
