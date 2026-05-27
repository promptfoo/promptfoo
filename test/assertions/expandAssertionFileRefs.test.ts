import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandAssertionFileRefs } from '../../src/assertions/expandAssertionFileRefs';
import cliState from '../../src/cliState';

import type { AssertionOrSet } from '../../src/types';

let fixtureDir: string;
let previousBasePath: string | undefined;

function writeFixture(relPath: string, contents: string): string {
  const absolute = path.resolve(fixtureDir, relPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents, 'utf8');
  return absolute;
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-assertion-refs-'));
  previousBasePath = cliState.basePath;
  cliState.basePath = fixtureDir;
});

afterEach(() => {
  cliState.basePath = previousBasePath;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('expandAssertionFileRefs', () => {
  it('returns the input unchanged when no file-include items are present', async () => {
    const input: AssertionOrSet[] = [
      { type: 'is-json', value: 'file://schema.json' },
      { type: 'contains', value: 'hello' },
    ];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('expands a bare { value: file://*.yaml } include into the loaded list', async () => {
    writeFixture(
      'assertions/default.yaml',
      `- type: is-json\n  value: ok\n- type: contains\n  value: hello\n`,
    );
    const input: AssertionOrSet[] = [{ value: 'file://assertions/default.yaml' } as any];

    const out = await expandAssertionFileRefs(input);

    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({ type: 'is-json', value: 'ok' });
    expect(out?.[1]).toMatchObject({ type: 'contains', value: 'hello' });
  });

  it('rebases nested file:// refs to absolute paths anchored at the loaded file', async () => {
    writeFixture('assertions/default.yaml', `- type: is-json\n  value: file://schemas/ok.json\n`);
    writeFixture('assertions/schemas/ok.json', '{"ok":true}');

    const input: AssertionOrSet[] = [{ value: 'file://assertions/default.yaml' } as any];
    const out = await expandAssertionFileRefs(input);

    expect(out).toHaveLength(1);
    const expected = `file://${path.resolve(fixtureDir, 'assertions/schemas/ok.json')}`;
    expect((out?.[0] as any).value).toBe(expected);
  });

  it('supports nested assertion-file includes with per-file baseDir rebasing', async () => {
    writeFixture('assertions/outer.yaml', `- value: file://inner/middle.yaml\n`);
    writeFixture('assertions/inner/middle.yaml', `- type: is-json\n  value: file://schema.json\n`);
    writeFixture('assertions/inner/schema.json', '{"a":1}');

    const input: AssertionOrSet[] = [{ value: 'file://assertions/outer.yaml' } as any];
    const out = await expandAssertionFileRefs(input);

    expect(out).toHaveLength(1);
    const expected = `file://${path.resolve(fixtureDir, 'assertions/inner/schema.json')}`;
    expect((out?.[0] as any).value).toBe(expected);
  });

  it('rebases namespaced Ruby script refs without splitting their method name', async () => {
    writeFixture(
      'assertions/default.yaml',
      `- type: ruby\n  value: file://scripts/grader.rb:MyModule::Nested.method\n`,
    );

    const input: AssertionOrSet[] = [{ value: 'file://assertions/default.yaml' } as any];
    const out = await expandAssertionFileRefs(input);

    expect((out?.[0] as any).value).toBe(
      `file://${path.resolve(fixtureDir, 'assertions/scripts/grader.rb')}:MyModule::Nested.method`,
    );
  });

  it('recurses into assert-set entries', async () => {
    writeFixture('assertions/default.yaml', `- type: contains\n  value: hello\n`);
    const input: AssertionOrSet[] = [
      {
        type: 'assert-set',
        assert: [{ value: 'file://assertions/default.yaml' } as any],
      } as any,
    ];

    const out = await expandAssertionFileRefs(input);

    expect(out).toHaveLength(1);
    expect((out?.[0] as any).type).toBe('assert-set');
    expect((out?.[0] as any).assert).toHaveLength(1);
    expect((out?.[0] as any).assert[0]).toMatchObject({ type: 'contains', value: 'hello' });
  });

  it('preserves .py / .js / .ts / .rb file refs as literals (no include expansion)', async () => {
    const input: AssertionOrSet[] = [
      { type: 'python', value: 'file://grader.py' },
      { type: 'javascript', value: 'file://grader.js' },
      { type: 'javascript', value: 'file://grader.ts' },
      // A hypothetical ruby assertion reference — should also pass through untouched.
      { type: 'python', value: 'file://grader.rb:my_fn' },
    ];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('leaves .txt-file references as literals (they are loaded at runtime)', async () => {
    const input: AssertionOrSet[] = [{ type: 'llm-rubric', value: 'file://rubric.txt' }];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('does not expand an entry that has a type field set', async () => {
    writeFixture('assertions/default.yaml', `- type: is-json\n  value: ok\n`);
    const input: AssertionOrSet[] = [{ type: 'is-json', value: 'file://assertions/default.yaml' }];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('does not discard properties attached to an assertion include entry', async () => {
    writeFixture('assertions/default.yaml', `- type: contains\n  value: hello\n`);
    const input: AssertionOrSet[] = [
      { value: 'file://assertions/default.yaml', threshold: 0.5 } as any,
    ];

    const out = await expandAssertionFileRefs(input);

    expect(out).toEqual(input);
  });

  it('treats two independent references to the same file as non-cyclic', async () => {
    writeFixture('assertions/shared.yaml', `- type: contains\n  value: hello\n`);
    const input: AssertionOrSet[] = [
      { value: 'file://assertions/shared.yaml' } as any,
      { value: 'file://assertions/shared.yaml' } as any,
    ];
    const out = await expandAssertionFileRefs(input);
    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({ type: 'contains', value: 'hello' });
    expect(out?.[1]).toMatchObject({ type: 'contains', value: 'hello' });
  });

  it('reports a real include cycle with the files that form the loop', async () => {
    writeFixture('cycle/a.yaml', `- value: file://b.yaml\n`);
    writeFixture('cycle/b.yaml', `- value: file://a.yaml\n`);

    const input: AssertionOrSet[] = [{ value: 'file://cycle/a.yaml' } as any];
    const aPath = path.resolve(fixtureDir, 'cycle/a.yaml');
    const bPath = path.resolve(fixtureDir, 'cycle/b.yaml');

    await expect(expandAssertionFileRefs(input)).rejects.toThrow(
      `Cyclic assertion file include detected: ${aPath} -> ${bPath} -> ${aPath}`,
    );
  });

  it('reports include nesting beyond the recursion limit explicitly', async () => {
    for (let index = 0; index < 18; index++) {
      writeFixture(`depth/${index}.yaml`, `- value: file://${index + 1}.yaml\n`);
    }
    const input: AssertionOrSet[] = [{ value: 'file://depth/0.yaml' } as any];

    await expect(expandAssertionFileRefs(input)).rejects.toThrow(
      'Assertion file include expansion exceeded maximum depth of 16',
    );
  });

  it('does not count nested assert-set groups toward file include depth', async () => {
    writeFixture('assertions/default.yaml', `- type: contains\n  value: hello\n`);
    let nested: unknown = { value: 'file://assertions/default.yaml' };
    for (let index = 0; index < 20; index++) {
      nested = { type: 'assert-set', assert: [nested] };
    }

    const out = await expandAssertionFileRefs([nested as AssertionOrSet]);
    let assertion = out?.[0] as { assert?: unknown[] };
    for (let index = 0; index < 20; index++) {
      assertion = assertion.assert?.[0] as { assert?: unknown[] };
    }
    expect(assertion).toMatchObject({ type: 'contains', value: 'hello' });
  });

  it('does not mutate the input assertions array', async () => {
    writeFixture('assertions/default.yaml', `- type: contains\n  value: hi\n`);
    const input: AssertionOrSet[] = [{ value: 'file://assertions/default.yaml' } as any];
    const snapshot = JSON.stringify(input);
    await expandAssertionFileRefs(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('passes a malformed assert-set (missing assert array) through unchanged', async () => {
    const input: AssertionOrSet[] = [{ type: 'assert-set' } as any];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('passes an assert-set whose assert is not an array through unchanged', async () => {
    const input: AssertionOrSet[] = [{ type: 'assert-set', assert: 'not-an-array' } as any];
    const out = await expandAssertionFileRefs(input);
    expect(out).toEqual(input);
  });

  it('uses the provided baseDir rather than cliState.basePath', async () => {
    const subdir = path.join(fixtureDir, 'nested');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(
      path.join(subdir, 'list.yaml'),
      `- type: contains\n  value: inside-nested\n`,
      'utf8',
    );

    // With cliState.basePath still pointing at fixtureDir, the resolution must
    // honor the explicit baseDir override — otherwise this would fail to find
    // the file under fixtureDir/list.yaml.
    const input: AssertionOrSet[] = [{ value: 'file://list.yaml' } as any];
    const out = await expandAssertionFileRefs(input, { baseDir: subdir });

    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({ type: 'contains', value: 'inside-nested' });
  });
});
