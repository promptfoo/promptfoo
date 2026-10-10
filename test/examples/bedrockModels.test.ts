import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runAssertions } from '../../src/assertions';
import { UnifiedConfigSchema } from '../../src/types';

import type { AtomicTestCase } from '../../src/types';

function readExample(filename: string) {
  return UnifiedConfigSchema.parse(
    parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../examples/amazon-bedrock/models', filename),
        'utf8',
      ),
    ),
  );
}

describe('Bedrock model examples', () => {
  it.each([
    'promptfooconfig.inference-profiles.yaml',
    'promptfooconfig.inference-profiles-simple.yaml',
  ])('uses supported assertions in %s', (filename) => {
    expect(() => readExample(filename)).not.toThrow();
  });

  it.each([
    ['valid tool arguments', { name: 'color_json', input: { name: 'sky', color: 'blue' } }, true],
    ['missing name', { name: 'color_json', input: { color: 'blue' } }, false],
    ['missing color', { name: 'color_json', input: { name: 'sky' } }, false],
    ['wrong color', { name: 'color_json', input: { name: 'sky', color: 'red' } }, false],
    ['plain text', 'The sky is blue.', false],
  ] as const)('grades %s without a transform error', async (_name, output, pass) => {
    const config = readExample('promptfooconfig.nova.tool.yaml');
    const result = await runAssertions({
      test: { ...(config.defaultTest as AtomicTestCase), vars: { expectedColor: 'blue' } },
      providerResponse: { output: typeof output === 'string' ? output : JSON.stringify(output) },
    });
    expect(result.pass).toBe(pass);
    expect(result.score).toBe(pass ? 1 : 0);
  });
});
