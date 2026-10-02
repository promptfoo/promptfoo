import { describe, expect, it } from 'vitest';
import { formatTagLabel } from './formatTagLabel';

describe('blog tag labels', () => {
  it.each([
    ['red-teaming', 'Red Teaming'],
    ['AI-security', 'AI Security'],
    ['llm-evals', 'LLM Evals'],
    ['owasp-top-10', 'OWASP Top 10'],
    ['mcp-and-rag', 'MCP And RAG'],
    ['agi', 'AGI'],
    ['a2a', 'A2A'],
    ['eu-ai-act', 'EU AI Act'],
    ['', ''],
    ['-mixed--Case-', ' Mixed  Case '],
  ])('displays %s as %s', (tag, label) => {
    expect(formatTagLabel(tag)).toBe(label);
  });
});
