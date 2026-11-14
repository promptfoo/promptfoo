import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { generateVarCombinations, runEval } from '../../src/evaluator';
import { getStructuredVarSources } from '../../src/evaluator/structuredVarSources';
import { renderPrompt } from '../../src/evaluatorHelpers';
import { readTest } from '../../src/util/testCaseReader';

it('keeps file references from structured data literal alongside authored references on replay', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-vars-'));
  const basePath = cliState.basePath;
  const reference = 'file://value.txt';
  try {
    cliState.basePath = dir;
    await writeFile(path.join(dir, 'value.txt'), 'first hop');
    await writeFile(path.join(dir, 'data.json'), JSON.stringify({ ref: reference }));
    await writeFile(
      path.join(dir, 'vars.yaml'),
      [
        'helper: file://value.txt',
        'nested:',
        '  authored: file://value.txt',
        "  alias: '{{ helper }}'",
        '  left: &shared { data: file://data.json }',
        '  right: *shared',
      ].join('\n'),
    );
    const test = await readTest({ vars: 'vars.yaml' }, dir);
    const prompt = {
      raw: '{{nested.authored}}|{{nested.alias}}|{{nested.left.data.ref}}|{{nested.right.data.ref}}',
      label: 'one pass',
    };
    const [row] = await runEval({
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      prompt,
      test: JSON.parse(JSON.stringify(test)),
      conversations: {},
      registers: {},
      provider: {
        id: () => 'echo-twice',
        async callApi(first, context) {
          const second = await renderPrompt(prompt, { ...context?.vars });
          return { output: [first, second] };
        },
      },
    });
    expect(row.error).toBeUndefined();
    expect(row.response?.output).toEqual([
      'first hop|first hop|file://value.txt|file://value.txt',
      'first hop|first hop|file://value.txt|file://value.txt',
    ]);
  } finally {
    cliState.basePath = basePath;
    await rm(dir, { recursive: true, force: true });
  }
});

it('selects the origin of each expanded array entry by index', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-choice-'));
  const basePath = cliState.basePath;
  try {
    cliState.basePath = dir;
    await writeFile(path.join(dir, 'first.txt'), 'authored');
    await writeFile(path.join(dir, 'choice.json'), JSON.stringify('file://first.txt'));
    await writeFile(path.join(dir, 'vars.yaml'), 'choice: [file://choice.json, file://first.txt]');
    const test = await readTest({ vars: 'vars.yaml' }, dir);
    const rows = generateVarCombinations(test.vars ?? {}, getStructuredVarSources(test));
    const prompt = { raw: '{{choice}}', label: 'choice' };
    expect(await Promise.all(rows.map((vars) => renderPrompt(prompt, vars)))).toEqual([
      'file://first.txt',
      'authored',
    ]);
  } finally {
    cliState.basePath = basePath;
    await rm(dir, { recursive: true, force: true });
  }
});
