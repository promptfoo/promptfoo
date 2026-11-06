import { expect, it } from 'vitest';
import { withWebpackBundle } from '../helpers/webpack';

it('preserves native imports after consumer Webpack bundling', async () => {
  await withWebpackBundle<typeof import('../../src/util/importPackage')>(
    new URL('../../src/util/importPackage.ts', import.meta.url),
    async ({ importPackage }) => {
      const loaded = (await importPackage('node:path')) as typeof import('node:path');
      expect(loaded.basename('/directory/file.txt')).toBe('file.txt');
    },
  );
});
