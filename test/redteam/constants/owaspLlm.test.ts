import { describe, expect, it } from 'vitest';
import { OWASP_LLM_RED_TEAM_MAPPING } from '../../../src/redteam/constants/frameworks';

describe('OWASP LLM red team presets', () => {
  it('keeps Unicode normalization as an explicit opt-in strategy', () => {
    expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:implementation'].strategies).not.toContain(
      'unicode-normalization',
    );
  });
});
