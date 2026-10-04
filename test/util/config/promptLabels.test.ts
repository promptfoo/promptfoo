import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { resolveConfigs } from '../../../src/util/config/load';
import { doesPromptRefMatch } from '../../../src/util/promptMatching';

describe('file prompt labels', () => {
  const originalCwd = process.cwd();
  let directory: string;

  function resolve(configPath: string) {
    return cliState.withConfig(undefined, () =>
      cliState.withBasePath(undefined, () => resolveConfigs({ config: [configPath] }, {})),
    );
  }

  beforeEach(() => {
    // Module resolution canonicalizes paths (for example /var to /private/var on macOS).
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-labels-')));
    fs.mkdirSync(path.join(directory, 'project', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'project', 'prompts', 'multi.txt'),
      'First {{topic}}\n---\nSecond {{topic}}\n',
    );
    fs.writeFileSync(path.join(directory, 'project', 'prompts', 'doc.md'), 'Markdown {{topic}}\n');
    fs.writeFileSync(
      path.join(directory, 'project', 'promptfooconfig.json'),
      JSON.stringify({
        prompts: ['file://prompts/multi.txt', 'file://prompts/doc.md'],
        providers: [{ id: 'echo', prompts: ['prompts/doc.md'] }],
        tests: [{ vars: { topic: 'labels' } }],
      }),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('labels prompts relative to the working directory when run from the config directory', async () => {
    process.chdir(path.join(directory, 'project'));

    const { testSuite } = await resolve('promptfooconfig.json');

    expect(testSuite.prompts.map((prompt) => prompt.label)).toEqual([
      'prompts/multi.txt: First {{topic}}',
      'prompts/multi.txt: Second {{topic}}',
      expect.stringMatching(/^prompts\/doc\.md: Markdown \{\{topic\}\}/),
    ]);
    expect(testSuite.prompts.map((prompt) => prompt.raw)).toEqual([
      'First {{topic}}',
      'Second {{topic}}',
      'Markdown {{topic}}\n',
    ]);
  });

  it('labels prompts with the config path as given when run from a parent directory', async () => {
    process.chdir(directory);

    const { testSuite } = await resolve(path.join('project', 'promptfooconfig.json'));

    expect(testSuite.prompts[0].label).toBe(
      `${path.join('project', 'prompts', 'multi.txt')}: First {{topic}}`,
    );
  });

  it('keeps labels free of the checkout directory so prompt references by file name match', async () => {
    process.chdir(path.join(directory, 'project'));

    const { testSuite } = await resolve(path.join(directory, 'project', 'promptfooconfig.json'));

    for (const prompt of testSuite.prompts) {
      expect(prompt.label).not.toContain(directory);
    }
    // Provider and test `prompts:` filters use the group-prefix rule against the label.
    expect(doesPromptRefMatch('prompts/doc.md', testSuite.prompts[2])).toBe(true);
    expect(doesPromptRefMatch('prompts/multi.txt', testSuite.prompts[0])).toBe(true);
    expect(testSuite.providerPromptMap).toEqual({ echo: ['prompts/doc.md'] });
  });
});
