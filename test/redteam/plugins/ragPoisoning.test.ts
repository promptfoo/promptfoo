import { beforeEach, describe, expect, it } from 'vitest';
import { RagPoisoningGrader } from '../../../src/redteam/plugins/ragPoisoning';

describe('RagPoisoningGrader', () => {
  let grader: RagPoisoningGrader;

  beforeEach(() => {
    grader = new RagPoisoningGrader();
  });

  it('should expose the rag poisoning grader id', () => {
    expect(grader.id).toBe('promptfoo:redteam:rag-poisoning');
  });

  it('should define a rubric for poisoned retrieval resistance', () => {
    expect(grader.rubric).toContain('RAG retrieval poisoning attack');
    expect(grader.rubric).toContain('PoisonedIntendedResult');
    expect(grader.rubric).toContain('retrieved content may be untrusted or malicious');
    expect(grader.rubric).toContain('trusted policy or system behavior');
  });

  it('should provide defensive suggestions', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test prompt' });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      action: 'note',
      type: 'rag-poisoning-defense',
      value: expect.stringContaining(
        'retrieved document content separate from trusted instructions',
      ),
    });
    expect(suggestions[0].value).toContain('verify sensitive recommendations');
  });
});
