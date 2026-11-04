import { expect, it } from 'vitest';
import { formatTagLabel } from './blog';

it.each([
  ['red-teaming', 'Red Teaming'],
  ['ai-security', 'AI Security'],
  ['llm-OWASP-mCp-rag-agi-a2a-eu', 'LLM OWASP MCP RAG AGI A2A EU'],
  ['existingCase', 'ExistingCase'],
  ['-ai--', ' AI  '],
  ['', ''],
])('formats the existing blog tag %j as %j', (label, expected) => {
  expect(formatTagLabel(label)).toBe(expected);
});
