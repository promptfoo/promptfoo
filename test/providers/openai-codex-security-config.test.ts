import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { type JsonObject, writeCodexConfig } from '@openai/codex-security';
import { afterEach, describe, expect, it } from 'vitest';

// Exercise the TOML parser used by the installed SDK, including nested dependency resolution.
const { parse } = createRequire(import.meta.resolve('@openai/codex-security'))('smol-toml') as {
  parse: (source: string) => JsonObject;
};

describe('Codex Security TOML configuration', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it.each(['flat keys', 'array tables'] as const)(
    'preserves a dot-free document containing many %s through the SDK config writer',
    async (shape) => {
      // Both shapes exercise the unbounded remainder scans from GHSA-r4xh-jqrq-34v2.
      // Keep the workload finite and assert data rather than platform-dependent timings.
      const count = 2048;
      const source = Array.from({ length: count }, (_, index) =>
        shape === 'flat keys' ? `key${index} = ${index}\n` : `[[entry]]\nvalue = ${index}\n`,
      ).join('');
      const config = parse(source);
      if (shape === 'flat keys') {
        expect(Object.keys(config)).toHaveLength(count);
        expect(config.key0).toBe(0);
        expect(config[`key${count - 1}`]).toBe(count - 1);
      } else {
        expect(config.entry).toHaveLength(count);
        expect(config.entry).toEqual(Array.from({ length: count }, (_, value) => ({ value })));
      }

      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-codex-config-'));
      directories.push(directory);
      const filename = path.join(directory, 'config.toml');
      await writeCodexConfig(filename, config);
      expect(parse(await fs.readFile(filename, 'utf8'))).toEqual(config);
    },
  );

  it('rejects duplicate keys instead of silently replacing configuration', () => {
    expect(() => parse('model = "first"\nmodel = "second"\n')).toThrow();
  });
});
