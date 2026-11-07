import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import cliState from '../../../src/cliState';
import { renderPrompt } from '../../../src/evaluatorHelpers';
import { resolveConfigs } from '../../../src/util/config/load';

import type { AtomicTestCase } from '../../../src/types/index';

describe('unquoted YAML dates in config and test files', () => {
  const originalCwd = process.cwd();
  let directory: string;

  beforeEach(() => {
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-yaml-dates-')));
    fs.writeFileSync(
      path.join(directory, 'promptfooconfig.yaml'),
      `
prompts:
  - 'on {{d}} at {{t}}'
providers:
  - echo
defaultTest:
  vars:
    d: 2024-01-02
  metadata:
    when: 2024-01-02
tests:
  - description: inline
    vars:
      d: 2024-01-02
      t: 2024-01-02T10:00:00Z
      nested:
        day: 2024-03-04
      list: [2024-05-06, kept]
      quoted: '2024-01-02'
    metadata:
      when: 2024-01-02
      at: 2024-01-02T10:00:00Z
    assert:
      - type: contains
        value: 2024-01-02
  - file://tests.yaml
`,
    );
    fs.writeFileSync(
      path.join(directory, 'tests.yaml'),
      `
- description: from file
  vars: vars.yaml
  metadata:
    when: 2024-01-02
  assert:
    - type: contains
      value: 2024-01-02
`,
    );
    fs.writeFileSync(path.join(directory, 'vars.yaml'), 'd: 2024-01-02\nt: 2024-01-02T10:00:00Z\n');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function load() {
    process.chdir(directory);
    const { testSuite } = await cliState.withConfig(undefined, () =>
      cliState.withBasePath(undefined, () =>
        resolveConfigs({ config: ['promptfooconfig.yaml'] }, {}),
      ),
    );
    return testSuite;
  }

  it('loads dates as ISO strings in vars, metadata and assertion values', async () => {
    const testSuite = await load();
    const [inline, fromFile] = testSuite.tests as AtomicTestCase[];

    expect(inline.vars).toEqual({
      d: '2024-01-02',
      t: '2024-01-02T10:00:00.000Z',
      nested: { day: '2024-03-04' },
      list: ['2024-05-06', 'kept'],
      quoted: '2024-01-02',
    });
    expect(inline.metadata).toEqual({ when: '2024-01-02', at: '2024-01-02T10:00:00.000Z' });
    expect(inline.assert?.[0]).toMatchObject({ type: 'contains', value: '2024-01-02' });
    expect(fromFile.vars).toEqual({ d: '2024-01-02', t: '2024-01-02T10:00:00.000Z' });
    expect(fromFile.metadata).toEqual({ when: '2024-01-02' });
    expect(testSuite.defaultTest).toMatchObject({
      vars: { d: '2024-01-02' },
      metadata: { when: '2024-01-02' },
    });
  });

  it('renders loaded dates into the prompt and passes assertions on them', async () => {
    const testSuite = await load();
    const [inline, fromFile] = testSuite.tests as AtomicTestCase[];

    await expect(renderPrompt(testSuite.prompts[0], inline.vars ?? {})).resolves.toBe(
      'on 2024-01-02 at 2024-01-02T10:00:00.000Z',
    );
    await expect(renderPrompt(testSuite.prompts[0], fromFile.vars ?? {})).resolves.toBe(
      'on 2024-01-02 at 2024-01-02T10:00:00.000Z',
    );
    for (const test of [inline, fromFile]) {
      const result = await runAssertion({
        prompt: 'p',
        provider: testSuite.providers[0],
        assertion: test.assert![0] as any,
        test,
        providerResponse: { output: 'it happened on 2024-01-02' },
      });
      expect(result.pass).toBe(true);
    }
  });
});
