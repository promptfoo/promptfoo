import { describe, expect, it, vi } from 'vitest';

// `src/.generated-examples.json` is produced by `scripts/generate-examples.mjs` at build
// time and is gitignored, so in CI it is the empty stub written by the `ensure-stats`
// postinstall hook. Mock it so these tests exercise the query logic against a fixed,
// representative payload instead of whatever happens to be on disk.
const generated = vi.hoisted(() => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  totalCount: 5,
  tags: [
    { id: 'getting-started', label: 'Getting Started', count: 1 },
    { id: 'red-teaming', label: 'Red Teaming', count: 2 },
    { id: 'providers', label: 'Providers', count: 1 },
  ],
  examples: [
    {
      slug: 'getting-started',
      humanName: 'Quickstart Eval',
      description: 'Run your first evaluation in under a minute.',
      tags: ['Getting Started', 'Evaluation'],
      initCommand: 'promptfoo init --example getting-started',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/getting-started',
    },
    {
      slug: 'redteam-chatbot',
      humanName: 'Chatbot Red Team',
      description: 'Probe a customer support bot for jailbreaks.',
      tags: ['Red Teaming'],
      initCommand: 'promptfoo init --example redteam-chatbot',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-chatbot',
    },
    {
      slug: 'redteam-mcp',
      humanName: 'MCP Server Scan',
      description: 'Attack an MCP server through its exposed tools.',
      tags: ['Red Teaming', 'MCP'],
      initCommand: 'promptfoo init --example redteam-mcp',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-mcp',
    },
    {
      slug: 'provider-python',
      humanName: 'Python Provider',
      description: 'Call a local Python script as a provider.',
      tags: ['Providers', 'Python'],
      initCommand: 'promptfoo init --example provider-python',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/provider-python',
    },
    {
      slug: 'config-ts',
      humanName: 'TypeScript Config',
      description: '',
      tags: ['Other'],
      initCommand: 'promptfoo init --example config-ts',
      githubUrl: 'https://github.com/promptfoo/promptfoo/tree/main/examples/config-ts',
    },
  ],
}));

vi.mock('../.generated-examples.json', () => ({ default: generated }));

import { examples, searchExamples, tags, totalCount } from './examples';

const slugsOf = (results: { slug: string }[]) => results.map((r) => r.slug);

describe('examples data', () => {
  it('re-exports the generated payload', () => {
    expect(slugsOf(examples)).toEqual([
      'getting-started',
      'redteam-chatbot',
      'redteam-mcp',
      'provider-python',
      'config-ts',
    ]);
    expect(tags.map((t) => t.label)).toEqual(['Getting Started', 'Red Teaming', 'Providers']);
    expect(totalCount).toBe(5);
  });

  it('keeps the advertised total in step with the example list', () => {
    expect(totalCount).toBe(examples.length);
  });
});

describe('searchExamples', () => {
  it('returns every example when nothing is filtered', () => {
    expect(searchExamples('')).toHaveLength(examples.length);
    expect(searchExamples('', 'all')).toHaveLength(examples.length);
    expect(searchExamples('', undefined)).toHaveLength(examples.length);
  });

  it('filters by tag', () => {
    expect(slugsOf(searchExamples('', 'Red Teaming'))).toEqual(['redteam-chatbot', 'redteam-mcp']);
    expect(slugsOf(searchExamples('', 'MCP'))).toEqual(['redteam-mcp']);
  });

  it('matches tags exactly rather than by prefix', () => {
    // The chips pass a full label; a partial one must not silently widen the filter.
    expect(searchExamples('', 'Red')).toEqual([]);
    expect(searchExamples('', 'red teaming')).toEqual([]);
  });

  it('searches the human name case-insensitively', () => {
    expect(slugsOf(searchExamples('QUICKSTART'))).toEqual(['getting-started']);
    expect(slugsOf(searchExamples('chatbot red team'))).toEqual(['redteam-chatbot']);
  });

  it('searches the description', () => {
    expect(slugsOf(searchExamples('jailbreaks'))).toEqual(['redteam-chatbot']);
  });

  it('searches the slug', () => {
    expect(slugsOf(searchExamples('provider-python'))).toEqual(['provider-python']);
  });

  it('searches tag labels', () => {
    // 'Python' is a tag on provider-python and a word in no other field of the others.
    expect(slugsOf(searchExamples('python'))).toEqual(['provider-python']);
    // Substring matching against tags is intentional here, unlike the tag filter.
    expect(slugsOf(searchExamples('red team'))).toEqual(['redteam-chatbot', 'redteam-mcp']);
  });

  it('intersects the query with the tag filter', () => {
    expect(slugsOf(searchExamples('mcp', 'Red Teaming'))).toEqual(['redteam-mcp']);
    // Same query, a tag the match does not carry: no results.
    expect(searchExamples('mcp', 'Providers')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchExamples('no-such-example')).toEqual([]);
  });

  it('tolerates examples with an empty description', () => {
    expect(slugsOf(searchExamples('typescript'))).toEqual(['config-ts']);
  });

  it('does not mutate the exported example list', () => {
    searchExamples('mcp', 'Red Teaming');

    expect(examples).toHaveLength(5);
    expect(slugsOf(searchExamples(''))).toHaveLength(5);
  });
});
