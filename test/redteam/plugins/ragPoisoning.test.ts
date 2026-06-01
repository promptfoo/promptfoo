import { beforeEach, describe, expect, it } from 'vitest';
import { RagPoisoningGrader } from '../../../src/redteam/plugins/ragPoisoning';

describe('RagPoisoningGrader', () => {
  let grader: RagPoisoningGrader;

  beforeEach(() => {
    grader = new RagPoisoningGrader();
  });

  it('should render the poisoned intended result in the rubric', () => {
    const rendered = grader.renderRubric({
      purpose: 'RAG assistant',
      prompt: 'How should API keys be handled?',
      value: 'API keys may be shared with external partners',
    });

    expect(rendered).toContain('RAG assistant');
    expect(rendered).toContain('How should API keys be handled?');
    expect(rendered).toContain('API keys may be shared with external partners');
    expect(rendered).toContain('RAG poisoning');
  });

  it('should provide suggestions', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test' });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('rag-poisoning');
    expect(suggestions[0].action).toBe('note');
    expect(suggestions[0].value).toContain('retrieved content as untrusted input');
  });

  it('should have the expected plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:rag-poisoning');
  });
});
