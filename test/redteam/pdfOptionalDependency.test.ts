import { describe, expect, it, vi } from 'vitest';
import { createPdf, inspectPdf, scanPdf } from '../../src/redteam/pdf';

vi.mock('node:module', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:module')>();
  return {
    ...original,
    createRequire: (filename: string | URL) => {
      const require = original.createRequire(filename);
      const resolve = require.resolve;
      require.resolve = Object.assign(
        (specifier: string) => {
          if (specifier === 'pdf-parse') {
            throw Object.assign(new Error("Cannot find module 'pdf-parse'"), {
              code: 'MODULE_NOT_FOUND',
            });
          }
          return resolve(specifier);
        },
        { paths: resolve.paths },
      );
      return require;
    },
  };
});

describe('PDF optional dependency', () => {
  it.each([
    { name: 'inspection', operation: inspectPdf },
    { name: 'scanning', operation: scanPdf },
  ])('explains how to install the parser for $name', async ({ operation }) => {
    await expect(operation(await createPdf('Invoice'))).rejects.toThrow(
      'PDF strategy requires pdf-parse. Install it with: npm install pdf-parse',
    );
  });
});
