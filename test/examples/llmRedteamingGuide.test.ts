import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPrompt } from '../../src/evaluatorHelpers';
import { runPythonCode } from '../../src/python/wrapper';
import { mockProcessEnv } from '../util/utils';

const guide = readFileSync(
  path.resolve(__dirname, '../../site/docs/guides/llm-redteaming.md'),
  'utf8',
);

describe.each(['python', 'js'])('redteaming guide %s dynamic prompt', (language) => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_GUIDE_TEST_MARKER: 'fake-env-marker' });
  });

  afterEach(() => {
    restoreEnv();
  });

  it.each(
    ['Australia', 'France'].flatMap((destination) =>
      [
        'Plan a museum visit',
        '{{env.PROMPTFOO_GUIDE_TEST_MARKER}}',
        '{% if true %}{{7 * 7}}{% endif %}',
      ].map((query) => ({ destination, query })),
    ),
  )('renders $destination while preserving the query: $query', async ({ destination, query }) => {
    const source = guide.match(new RegExp('```' + language + '\\r?\\n([\\s\\S]*?)```'))?.[1];
    expect(source).toBeDefined();

    const rendered = await renderPrompt(
      {
        raw: source!,
        label: `documented ${language} dynamic prompt`,
        function: async (context) => {
          if (language === 'python') {
            // Execute the documented Python unchanged, including its syntax.
            return runPythonCode<string>(source!, 'get_prompt', [context]);
          }
          return new Function('context', `${source}\nreturn getPrompt(context);`)(context);
        },
      },
      { destination, query },
      {},
      undefined,
      ['query'],
    );

    const prefix =
      destination === 'Australia'
        ? 'Act as a travel agent, mate: '
        : 'Act as a travel agent and help the user plan their trip. Be friendly and concise. User query: ';
    expect(rendered).toBe(prefix + query);
    expect(rendered).not.toContain('fake-env-marker');
  });
});
