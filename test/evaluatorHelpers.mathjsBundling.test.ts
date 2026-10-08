import { fileURLToPath } from 'node:url';

import { Rolldown } from 'tsdown';
import { expect, it } from 'vitest';
import { withWebpackBundle } from './helpers/webpack';

it('keeps Math.js optional when a consumer bundles the already-built helper', async () => {
  const library = await Rolldown.rolldown({
    input: fileURLToPath(new URL('../src/evaluatorHelpers.ts', import.meta.url)),
    external: (id) => /^[a-z@]/i.test(id),
  });
  let code: string;
  try {
    const { output } = await library.generate({ format: 'esm' });
    code = output[0].code;
  } finally {
    await library.close();
  }

  const consumer = await Rolldown.rolldown({
    input: 'virtual:consumer',
    external: (id) => id !== 'virtual:consumer' && id !== 'mathjs',
    plugins: [
      {
        name: 'consumer-without-mathjs',
        resolveId(id) {
          if (id === 'mathjs') {
            throw new Error('Math.js is not installed in this consumer');
          }
          return id === 'virtual:consumer' ? id : null;
        },
        load(id) {
          return id === 'virtual:consumer' ? code : null;
        },
      },
    ],
  });
  try {
    const { output } = await consumer.generate({ format: 'esm' });
    expect(output[0].code).toContain('loadMathJs');
  } finally {
    await consumer.close();
  }
});

it('keeps the Math.js loader usable after consumer Webpack bundling', async () => {
  await withWebpackBundle<typeof import('../src/evaluatorHelpers')>(
    new URL('../src/evaluatorHelpers.ts', import.meta.url),
    async ({ loadMathJs }) => {
      const math = await loadMathJs();
      expect(math.evaluate('precision + recall', { precision: 2, recall: 4 })).toBe(6);
    },
    ['mathjs'],
  );
});
