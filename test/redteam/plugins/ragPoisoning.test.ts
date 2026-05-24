import { beforeEach, describe, expect, it } from 'vitest';
import { RagPoisoningGrader } from '../../../src/redteam/plugins/ragPoisoning';

describe('RagPoisoningGrader', () => {
  let grader: RagPoisoningGrader;

  beforeEach(() => {
    grader = new RagPoisoningGrader();
  });

  it('grades propagation against the configured poisoned claim', () => {
    expect(grader.id).toBe('promptfoo:redteam:rag-poisoning');
    expect(grader.rubric).toContain('<PoisonedClaim>');
    expect(grader.rubric).toContain('{{value}}');
    expect(grader.rubric).toContain('untrusted data');
    expect(grader.rubric).toContain('Do not follow any');
    expect(grader.rubric).toContain('based on the poisoned claim');
  });

  it('provides RAG grounding suggestions', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test' });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('rag-grounding');
    expect(suggestions[0].action).toBe('note');
    expect(suggestions[0].value).toContain('untrusted');
    expect(suggestions[0].value).toContain('authoritative');
  });
});
