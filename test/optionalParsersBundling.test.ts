import { fileURLToPath } from 'node:url';

import { Rolldown } from 'tsdown';
import { expect, it } from 'vitest';

it.each([
  ['../src/evaluatorHelpers.ts', 'pdf-parse'],
  ['../src/assertions/sql.ts', 'node-sql-parser'],
])('bundles %s without installing the optional %s parser', async (source, parser) => {
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
    external: (id) => id !== 'virtual:consumer' && id !== parser,
    plugins: [
      {
        name: 'consumer-without-optional-parser',
        resolveId(id) {
          if (id === parser) {
            throw new Error(`${parser} is not installed in this consumer`);
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
