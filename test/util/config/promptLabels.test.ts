import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { resolveConfigs } from '../../../src/util/config/load';
import { doesPromptRefMatch } from '../../../src/util/promptMatching';

describe('file prompt labels', () => {
  const originalCwd = process.cwd();
  // Labels use the platform's path separator, as file paths do everywhere else.
  const multiPrompt = path.join('prompts', 'multi.txt');
  const docPrompt = path.join('prompts', 'doc.md');
  let directory: string;

  function resolve(configPath: string | string[]) {
    return cliState.withConfig(undefined, () =>
      cliState.withBasePath(undefined, () => resolveConfigs({ config: [configPath].flat() }, {})),
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
        providers: [{ id: 'echo', prompts: [docPrompt] }],
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
      `${multiPrompt}: First {{topic}}`,
      `${multiPrompt}: Second {{topic}}`,
      expect.stringContaining(`${docPrompt}: Markdown {{topic}}`),
    ]);
    expect(testSuite.prompts[2].label.startsWith(docPrompt)).toBe(true);
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
    expect(doesPromptRefMatch(docPrompt, testSuite.prompts[2])).toBe(true);
    expect(doesPromptRefMatch(multiPrompt, testSuite.prompts[0])).toBe(true);
    expect(testSuite.providers[0].prompts).toEqual([docPrompt]);
  });

  it.each([
    ['md', 'Markdown prompt'],
    ['j2', 'Template prompt'],
    ['json', '"JSON prompt"'],
    ['jsonl', '"JSONL prompt"'],
    ['yaml', 'YAML prompt'],
    ['cjs', 'module.exports = () => "JavaScript prompt";'],
    ['py', 'print("Python prompt")'],
    ['sh', '#!/bin/sh\necho "Shell prompt"'],
  ])(
    'preserves authored %s labels containing the resolved filename',
    async (extension, content) => {
      const fileName = `labeled.${extension}`;
      const filePath = path.join(directory, 'project', fileName);
      const label = `Source ${filePath}`;
      fs.writeFileSync(filePath, content);
      fs.writeFileSync(
        path.join(directory, 'project', 'promptfooconfig.json'),
        JSON.stringify({
          prompts: [{ raw: `file://${fileName}`, label }],
          providers: [{ id: 'echo', prompts: [label] }],
          tests: [{ prompts: [label], vars: {} }],
        }),
      );
      process.chdir(path.join(directory, 'project'));

      const { testSuite } = await resolve('promptfooconfig.json');

      expect(testSuite.prompts[0].label).toBe(label);
      expect(doesPromptRefMatch(label, testSuite.prompts[0])).toBe(true);
      expect(testSuite.providers[0].prompts).toEqual([label]);
    },
  );

  it.each(['txt', 'md'])(
    'keeps config-relative %s glob IDs and labels stable',
    async (extension) => {
      const id = `file://prompts/*.${extension}`;
      fs.writeFileSync(
        path.join(directory, 'project', 'promptfooconfig.json'),
        JSON.stringify({
          prompts: [{ id, label: 'Group' }],
          providers: [{ id: 'echo', prompts: [id] }],
          tests: [{ prompts: [id], vars: { topic: 'labels' } }],
        }),
      );
      process.chdir(path.join(directory, 'project'));
      const { testSuite } = await resolve('promptfooconfig.json');
      expect(testSuite.prompts.map((p) => p.id)).toEqual(
        extension === 'txt'
          ? [`${id}:prompts/multi.txt:1`, `${id}:prompts/multi.txt:2`]
          : [`${id}:prompts/doc.md`],
      );
      expect(testSuite.prompts.every((p) => doesPromptRefMatch(id, p))).toBe(true);
      expect(testSuite.prompts.map((p) => p.label)).toEqual(
        extension === 'txt'
          ? [`Group: ${multiPrompt}: First {{topic}}`, `Group: ${multiPrompt}: Second {{topic}}`]
          : ['Group: prompts/doc.md'],
      );
    },
  );

  it.each(['md', 'txt'])(
    'keeps %s glob identities independent of config order',
    async (extension) => {
      const id = `file://prompts/*.${extension}`;
      const configs = ['a', 'b'].map((name) => {
        const source = path.join(directory, name);
        fs.mkdirSync(path.join(source, 'prompts'), { recursive: true });
        fs.writeFileSync(path.join(source, 'prompts', `x.${extension}`), name);
        const configPath = path.join(source, 'config.json');
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            prompts: [{ id, label: `Group ${name}` }],
            providers: ['echo'],
          }),
        );
        return configPath;
      });
      process.chdir(directory);
      const forward = (await resolve(configs)).testSuite.prompts;
      const reverse = (await resolve([...configs].reverse())).testSuite.prompts;
      expect(reverse).toEqual([...forward].reverse());
      expect(forward.map((prompt) => prompt.id)).toEqual([
        `${id}:prompts/x.${extension}`,
        `${id}:prompts/x.${extension}`,
      ]);
    },
  );

  it('preserves an explicitly empty body with a file-shaped ID', async () => {
    const configPath = path.join(directory, 'project', 'empty.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        prompts: [{ id: 'file://logical-empty', raw: '', label: 'Blank' }],
        providers: ['echo'],
      }),
    );
    const { testSuite } = await resolve(configPath);
    expect(testSuite.prompts).toEqual([
      expect.objectContaining({ id: 'file://logical-empty', raw: '', label: 'Blank' }),
    ]);
  });

  it('normalizes only the generated path in text labels with an authored prefix', async () => {
    const fileName = 'labeled.txt';
    const filePath = path.join(directory, 'project', fileName);
    const label = `Source ${filePath}`;
    fs.writeFileSync(filePath, 'First\n---\nSecond');
    fs.writeFileSync(
      path.join(directory, 'project', 'promptfooconfig.json'),
      JSON.stringify({ prompts: [{ raw: `file://${fileName}`, label }], providers: ['echo'] }),
    );
    process.chdir(path.join(directory, 'project'));

    const { testSuite } = await resolve('promptfooconfig.json');

    expect(testSuite.prompts.map((prompt) => prompt.label)).toEqual([
      `${label}: ${fileName}: First`,
      `${label}: ${fileName}: Second`,
    ]);
  });

  it('preserves distinct CSV row labels that contain absolute and relative filenames', async () => {
    const filePath = path.join(directory, 'project', 'prompts.csv');
    const labels = [`Source ${filePath}`, 'Source prompts.csv'];
    fs.writeFileSync(
      filePath,
      `prompt,label\nFirst,"${labels[0].replace(/"/g, '""')}"\nSecond,"${labels[1]}"\n`,
    );
    fs.writeFileSync(
      path.join(directory, 'project', 'promptfooconfig.json'),
      JSON.stringify({
        prompts: ['file://prompts.csv'],
        providers: [{ id: 'echo', prompts: [labels[0]] }],
        tests: [{ prompts: [labels[0]], vars: {} }],
      }),
    );
    process.chdir(path.join(directory, 'project'));

    const { testSuite } = await resolve('promptfooconfig.json');

    expect(testSuite.prompts.map((prompt) => prompt.label)).toEqual(labels);
    expect(doesPromptRefMatch(labels[0], testSuite.prompts[0])).toBe(true);
    expect(doesPromptRefMatch(labels[0], testSuite.prompts[1])).toBe(false);
  });

  describe('files are still read from the config directory', () => {
    function writeConfig(prompts: string[]) {
      fs.writeFileSync(
        path.join(directory, 'project', 'promptfooconfig.json'),
        JSON.stringify({ prompts, providers: ['echo'], tests: [{ vars: { topic: 'labels' } }] }),
      );
    }

    it.each(['txt', 'md', 'j2', 'sh'])(
      'preserves %s file content that equals its absolute path',
      async (extension) => {
        const fileName = `self.${extension}`;
        const filePath = path.join(directory, 'project', fileName);
        fs.writeFileSync(filePath, filePath);
        writeConfig([`file://${fileName}`]);
        process.chdir(path.join(directory, 'project'));

        const { testSuite } = await resolve('promptfooconfig.json');

        expect(testSuite.prompts).toHaveLength(1);
        expect(testSuite.prompts[0].raw).toBe(filePath);
        expect(testSuite.prompts[0].label.startsWith(fileName)).toBe(true);
      },
    );

    it.each(['exec:binary.exe', 'file://binary.exe'])(
      'keeps the relative display fallback for %s',
      async (reference) => {
        fs.writeFileSync(path.join(directory, 'project', 'binary.exe'), Buffer.from([0, 1, 2]));
        writeConfig([reference]);
        process.chdir(path.join(directory, 'project'));

        const { testSuite } = await resolve('promptfooconfig.json');

        expect(testSuite.prompts[0].raw).toBe('binary.exe');
        expect(testSuite.prompts[0].label).toBe('binary.exe');
        expect(testSuite.prompts[0].function).toEqual(expect.any(Function));
      },
    );

    it.each([
      ['the config directory', 'project', 'promptfooconfig.json', ''],
      ['a parent directory', '', path.join('project', 'promptfooconfig.json'), 'project'],
    ])('expands a prompt glob when run from %s', async (_name, cwd, configPath, labelBase) => {
      fs.writeFileSync(path.join(directory, 'project', 'prompts', 'a.txt'), 'Glob A {{topic}}');
      fs.writeFileSync(path.join(directory, 'project', 'prompts', 'b.txt'), 'Glob B {{topic}}');
      // Without the file:// prefix the glob is expanded by the prompt reader itself.
      writeConfig(['prompts/*.txt']);
      process.chdir(path.join(directory, cwd));

      const { testSuite } = await resolve(configPath);

      const labels = testSuite.prompts.map((prompt) => prompt.label).sort();
      expect(labels).toEqual(
        [
          `${path.join(labelBase, 'prompts', 'a.txt')}: Glob A {{topic}}`,
          `${path.join(labelBase, 'prompts', 'b.txt')}: Glob B {{topic}}`,
          `${path.join(labelBase, 'prompts', 'multi.txt')}: First {{topic}}`,
          `${path.join(labelBase, 'prompts', 'multi.txt')}: Second {{topic}}`,
        ].sort(),
      );
    });

    it.each(['exec:generate.sh', 'file://generate.sh'])(
      'runs the executable prompt %s by its full path and labels it by its relative one',
      async (reference) => {
        if (process.platform === 'win32') {
          return;
        }
        const script = path.join(directory, 'project', 'generate.sh');
        fs.writeFileSync(script, '#!/bin/sh\necho "Generated prompt"\n', { mode: 0o755 });
        writeConfig([reference]);
        // From here a bare "generate.sh" is not a path, so only the full path can be run.
        process.chdir(path.join(directory, 'project'));

        const { testSuite } = await resolve('promptfooconfig.json');

        const [prompt] = testSuite.prompts;
        expect(prompt.label).toBe('generate.sh');
        expect(prompt.label).not.toContain(directory);
        await expect(
          prompt.function?.({ vars: {}, provider: { id: () => 'echo' } as never }),
        ).resolves.toBe('Generated prompt');
      },
    );
  });
});
