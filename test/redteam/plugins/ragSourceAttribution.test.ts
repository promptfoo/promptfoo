import { beforeEach, describe, expect, it } from 'vitest';
import { RagSourceAttributionGrader } from '../../../src/redteam/plugins/ragSourceAttribution';

describe('RagSourceAttributionGrader', () => {
  let grader: RagSourceAttributionGrader;

  beforeEach(() => {
    grader = new RagSourceAttributionGrader();
  });

  it('should provide suggestions', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test' });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('rag-grounding');
    expect(suggestions[0].action).toBe('note');
    expect(suggestions[0].value).toContain('cite documents');
    expect(suggestions[0].value).toContain('hedging');
  });
});
