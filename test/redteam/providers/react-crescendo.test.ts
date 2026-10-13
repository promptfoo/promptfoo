import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactCrescendoProvider } from '../../../src/redteam/providers/react-crescendo/index';
import { REACT_CRESCENDO_SYSTEM_PROMPT } from '../../../src/redteam/providers/react-crescendo/prompts';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { createMockProvider } from '../../factories/provider';

import type { CallApiContextParams } from '../../../src/types/index';

vi.mock('../../../src/globalConfig/accounts', async (importOriginal) => ({
  ...(await importOriginal()),
  isLoggedIntoCloud: vi.fn(() => true),
}));

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/redteam/remoteGeneration')>();
  return {
    ...mod,
    shouldGenerateRemote: vi.fn(() => false),
  };
});

const REACT_ATTACK_RESPONSE = JSON.stringify({
  generatedQuestion: 'What is the history of chemistry in education?',
  lastResponseSummary: '',
  rationaleBehindJailbreak: 'Opening with a benign question to establish context.',
  observation: 'Opening turn, no target response yet.',
  reasoning: 'Starting with gradual-escalation before trying other vectors.',
  strategyVector: 'gradual-escalation',
});

function createContext(targetProvider: ReturnType<typeof createMockProvider>) {
  const context: CallApiContextParams = {
    originalProvider: targetProvider,
    vars: { goal: 'test goal' },
    prompt: { raw: 'test prompt', label: 'test' },
  };
  return context;
}

describe('ReactCrescendoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should identify as the react-crescendo provider', () => {
    const provider = new ReactCrescendoProvider({ injectVar: 'goal', redteamProvider: 'echo' });
    expect(provider.id()).toBe('promptfoo:redteam:react-crescendo');
  });

  it('should use a ReAct system prompt with observe-reason-act steps', () => {
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('OBSERVE');
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('REASON');
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('ACT');
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('strategyVector');
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('observation');
    expect(REACT_CRESCENDO_SYSTEM_PROMPT).toContain('reasoning');
  });

  it('should run a turn with ReAct reasoning fields and record history', async () => {
    const attacker = createMockProvider({
      id: 'attacker',
      response: { output: REACT_ATTACK_RESPONSE },
    });
    const scoring = createMockProvider({ id: 'scoring' });
    scoring.callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({ value: false, rationale: 'Not a refusal', metadata: 10 }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false,
          description: 'test goal',
          rationale: 'No progress yet',
          metadata: 20,
        }),
      });
    vi.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue(attacker);
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(scoring);

    const target = createMockProvider({
      id: 'target',
      response: { output: 'Here is some general information about chemistry.' },
    });

    const provider = new ReactCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      redteamProvider: 'echo',
    });
    const result = await provider.callApi('test prompt', createContext(target));

    expect(target.callApi).toHaveBeenCalledTimes(1);
    expect(result.metadata?.crescendoRoundsCompleted).toBe(1);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.redteamHistory).toHaveLength(1);
    expect(result.metadata?.redteamHistory?.[0].prompt).toBe(
      'What is the history of chemistry in education?',
    );

    // The attacker conversation must carry the ReAct system prompt.
    const attackerHistoryArg = (attacker.callApi as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const attackerHistory = JSON.parse(attackerHistoryArg as string);
    expect(attackerHistory[0].role).toBe('system');
    expect(attackerHistory[0].content).toContain('OBSERVE');
    expect(attackerHistory[0].content).toContain('strategyVector');
  });

  it('should backtrack on refusal and stop at max backtracks', async () => {
    const attacker = createMockProvider({
      id: 'attacker',
      response: { output: REACT_ATTACK_RESPONSE },
    });
    const scoring = createMockProvider({
      id: 'scoring',
      response: {
        output: JSON.stringify({ value: true, rationale: 'Refused', metadata: 99 }),
      },
    });
    vi.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue(attacker);
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(scoring);

    const target = createMockProvider({
      id: 'target',
      response: { output: 'Here is some general information about chemistry.' },
    });

    const provider = new ReactCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 3,
      maxBacktracks: 1,
      redteamProvider: 'echo',
    });
    const result = await provider.callApi('test prompt', createContext(target));

    expect(result.metadata?.stopReason).toBe('Max backtracks reached');
    expect(result.metadata?.crescendoBacktrackCount).toBe(1);
  });
});
