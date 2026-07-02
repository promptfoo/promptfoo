import { describe, expect, it } from 'vitest';
import { isDeferredMinimumAgenticSeed } from '../../../src/redteam/shared/agenticSeed';

describe('isDeferredMinimumAgenticSeed', () => {
  it.each([
    { strategyId: 'best-of-n' },
    { strategyId: 'authoritative-markup-injection' },
    { providerId: 'promptfoo:redteam:best-of-n' },
    { providerId: 'promptfoo:redteam:authoritative-markup-injection' },
    { strategyId: 'jailbreak:hydra/audio' },
    { strategyId: 'layer/hydra-audio:jailbreak:hydra/audio' },
    { strategyId: 'layer/meta-base64:jailbreak:meta/base64' },
    { strategyId: 'layer/tree-rot13:jailbreak:tree/rot13' },
    { providerId: 'promptfoo:redteam:hydra' },
    { providerId: 'promptfoo:redteam:iterative:meta/tree' },
    { providerId: 'promptfoo:redteam:iterative:tree/base64' },
  ])('recognizes normalized deferred seed $strategyId$providerId', (ids) => {
    expect(isDeferredMinimumAgenticSeed(ids)).toBe(true);
  });

  it.each([
    { strategyId: 'mischievous-user' },
    { providerId: 'promptfoo:redteam:mischievous-user' },
    { strategyId: 'base64' },
    { providerId: 'openai:gpt-4o' },
  ])('does not exempt target-calling or non-agentic IDs $strategyId$providerId', (ids) => {
    expect(isDeferredMinimumAgenticSeed(ids)).toBe(false);
  });
});
