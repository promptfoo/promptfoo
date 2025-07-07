import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from '../../../../src/redteam/plugins/agentic/constants';

describe('agentic constants', () => {
  it('should have correct REDTEAM_MEMORY_POISONING_PLUGIN_ID', () => {
    expect(REDTEAM_MEMORY_POISONING_PLUGIN_ID).toBe('promptfoo:redteam:agentic:memory-poisoning');
  });
});
