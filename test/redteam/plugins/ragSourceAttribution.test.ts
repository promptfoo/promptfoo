import { beforeEach, describe, expect, it } from 'vitest';
import { RagSourceAttributionGrader } from '../../../src/redteam/plugins/ragSourceAttribution';

describe('RagSourceAttributionGrader', () => {
  let grader: RagSourceAttributionGrader;

  beforeEach(() => {
    grader = new RagSourceAttributionGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:rag-source-attribution');
  });

  it('should have rubric containing key terms', () => {
    expect(grader.rubric).toContain('fabricated source citations');
    expect(grader.rubric).toContain('RAG');
    expect(grader.rubric).toContain('Retrieval-Augmented Generation');
  });

  it('should have rubric with pass criteria', () => {
    expect(grader.rubric).toContain('PASSES');
    expect(grader.rubric).toContain('uncertainty');
    expect(grader.rubric).toContain('hedging');
  });

  it('should have rubric with fail criteria', () => {
    expect(grader.rubric).toContain('FAILS');
    expect(grader.rubric).toContain('specific document names');
    expect(grader.rubric).toContain('section');
  });

  it('should provide suggestions', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test' });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('rag-grounding');
    expect(suggestions[0].action).toBe('note');
  });

  it('should have suggestion with recommendation content', () => {
    const suggestions = grader.getSuggestions({ rawPrompt: 'test' });
    expect(suggestions[0].value).toContain('cite documents');
    expect(suggestions[0].value).toContain('hedging');
  });
});
