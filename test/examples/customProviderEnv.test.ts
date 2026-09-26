import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { transformSync } from '@swc/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

const formats = [
  'basic/customProvider.js',
  'basic/customProvider.cjs',
  'mjs/customProvider.mjs',
  'typescript/customProvider.ts',
  'embeddings/customProvider.js',
];
const response = {
  choices: [{ message: { content: 'fixture' } }],
  data: [{ embedding: [1, 2] }],
  usage: { total_tokens: 2, prompt_tokens: 1, completion_tokens: 1 },
};
const request = vi.fn();
let restoreEnv = () => {};

// Load the actual examples without requiring a built or published promptfoo package.
// Only the outgoing request dependencies are replaced.
function loadExample(file: string): new (options: ProviderOptions) => ApiProvider {
  const filename = path.resolve('examples/provider-custom', file);
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = transformSync(source, {
    filename,
    jsc: {
      parser: { syntax: file.endsWith('.ts') ? 'typescript' : 'ecmascript' },
      target: 'es2022',
    },
    module: { type: 'commonjs' },
  });
  const exports = {};
  const module = { exports };
  new vm.Script(code, { filename }).runInNewContext({
    module,
    exports,
    process,
    fetch: async (...args: unknown[]) => {
      request(...args);
      return Response.json(response);
    },
    require: (name: string) => {
      expect(name).toBe('promptfoo');
      return {
        __esModule: true,
        default: {
          cache: {
            fetchWithCache: async (...args: unknown[]) => {
              request(...args);
              return { data: response };
            },
          },
        },
      };
    },
  });
  return (
    typeof module.exports === 'function'
      ? module.exports
      : (module.exports as { default: unknown }).default
  ) as new (
    options: ProviderOptions,
  ) => ApiProvider;
}

beforeEach(() => {
  request.mockReset();
  restoreEnv = mockProcessEnv({ OPENAI_API_KEY: 'host' });
});
afterEach(() => {
  restoreEnv();
  request.mockReset();
});

describe.each(formats)('%s environment settings', (file) => {
  it.each([
    {
      options: { config: { apiKey: 'explicit' }, env: { OPENAI_API_KEY: 'scoped' } },
      expected: 'explicit',
    },
    { options: { env: { OPENAI_API_KEY: 'scoped' } }, expected: 'scoped' },
    { options: {}, expected: 'late-file' },
    { options: {}, expected: undefined },
    { options: { env: { OPENAI_API_KEY: '' } }, expected: '' },
    { options: { config: { apiKey: '' }, env: { OPENAI_API_KEY: 'scoped' } }, expected: '' },
  ])('uses $expected in the outgoing request', async ({ options, expected }) => {
    const Provider = loadExample(file);
    const provider = new Provider(options);
    const restoreLate = mockProcessEnv({
      OPENAI_API_KEY: expected === undefined ? undefined : 'late-file',
    });
    try {
      if (file.startsWith('embeddings/')) {
        await provider.callEmbeddingApi!('fixture');
      } else {
        await provider.callApi('fixture');
      }
      expect(request).toHaveBeenCalledOnce();
      const headers = new Headers(request.mock.calls[0][1].headers);
      expect(headers.get('authorization')).toBe(`Bearer ${expected}`.trim());
    } finally {
      restoreLate();
    }
  });
});
