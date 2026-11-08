import { fileURLToPath } from 'node:url';

import { Rolldown } from 'tsdown';
import { expect, it } from 'vitest';
import { withWebpackBundle } from '../helpers/webpack';

import type { AssertionParams } from '../../src/types/index';

it('bundles the METEOR assertion without installing Natural', async () => {
  const source = '../../src/assertions/meteor.ts';
  const isNatural = (id: string) => id === 'natural' || id.startsWith('natural/');
  const library = await Rolldown.rolldown({
    input: fileURLToPath(new URL(source, import.meta.url)),
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
    external: (id) => id !== 'virtual:consumer' && !isNatural(id),
    plugins: [
      {
        name: 'consumer-without-natural',
        resolveId(id) {
          if (isNatural(id)) {
            throw new Error(`${id} is not installed in this consumer`);
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
    expect(output[0].code.length).toBeGreaterThan(0);
  } finally {
    await consumer.close();
  }
});

it('loads the installed Natural modules after consumer Webpack bundling', async () => {
  await withWebpackBundle<typeof import('../../src/assertions/meteor')>(
    new URL('../../src/assertions/meteor.ts', import.meta.url),
    async ({ handleMeteorAssertion }) => {
      const result = await handleMeteorAssertion({
        assertion: { type: 'meteor' },
        outputString: 'running jumped tests',
        renderedValue: 'runs jumping test',
        inverse: false,
      } as AssertionParams);
      expect(result).toMatchObject({ pass: true, score: 0.9814814814814815 });
    },
  );
});
