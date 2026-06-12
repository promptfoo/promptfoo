import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { ConfigResolutionError } from '../../../src/util/config/errors';
import {
  expandScenarioConfigValues,
  loadScenarioConfigs,
  resolveFileRefFromBase,
  resolveScenarioConfigValuesRefs,
} from '../../../src/util/config/scenarioMatrix';

import type { Scenario } from '../../../src/types/index';

describe('scenarioMatrix (real filesystem)', () => {
  let tmpDir: string;

  const write = (relativePath: string, contents: string): string => {
    const filePath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-matrix-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('resolveFileRefFromBase', () => {
    it('resolves relative refs against the base path', () => {
      expect(resolveFileRefFromBase('/base/dir', 'file://matrix.yaml')).toBe(
        `file://${path.resolve('/base/dir', 'matrix.yaml')}`,
      );
    });

    it('is idempotent for absolute refs', () => {
      const absolute = `file://${path.resolve('/base/dir', 'matrix.yaml')}`;
      expect(resolveFileRefFromBase('/other', absolute)).toBe(absolute);
    });

    it('returns non-file refs unchanged', () => {
      expect(resolveFileRefFromBase('/base', 'matrix.yaml')).toBe('matrix.yaml');
    });
  });

  describe('expandScenarioConfigValues', () => {
    it('expands $values rows and keeps inline rows in order', async () => {
      const matrixPath = write(
        'matrix.yaml',
        '- vars:\n    language: French\n- vars:\n    language: Spanish\n',
      );

      const expanded = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }, { vars: { language: 'German' } }],
        tmpDir,
      );

      expect(expanded).toEqual([
        { vars: { language: 'French' } },
        { vars: { language: 'Spanish' } },
        { vars: { language: 'German' } },
      ]);
    });

    it('resolves relative $values refs against the provided base path', async () => {
      write('nested/matrix.yaml', '- vars:\n    language: French\n');

      const expanded = await expandScenarioConfigValues(
        [{ $values: 'file://matrix.yaml' }],
        path.join(tmpDir, 'nested'),
      );

      expect(expanded).toEqual([{ vars: { language: 'French' } }]);
    });

    it('wraps a single-object matrix file into one row', async () => {
      const matrixPath = write('single.yaml', 'vars:\n  language: French\n');

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { language: 'French' } }]);
    });

    it('supports JSON matrix files', async () => {
      const matrixPath = write('matrix.json', JSON.stringify([{ vars: { topic: 'billing' } }]));

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { topic: 'billing' } }]);
    });

    it('expands glob $values refs across files', async () => {
      write('matrices/a.yaml', '- vars:\n    language: French\n');
      write('matrices/b.yaml', '- vars:\n    language: Spanish\n');

      const expanded = await expandScenarioConfigValues([
        { $values: `file://${path.join(tmpDir, 'matrices', '*.yaml')}` },
      ]);

      expect(expanded).toHaveLength(2);
      expect(expanded).toEqual(
        expect.arrayContaining([
          { vars: { language: 'French' } },
          { vars: { language: 'Spanish' } },
        ]),
      );
    });

    it('rejects $expand with a pointer to $values', async () => {
      await expect(expandScenarioConfigValues([{ $expand: 'file://matrix.yaml' }])).rejects.toThrow(
        /do not support \$expand; use \$values/,
      );
    });

    it('rejects $values mixed with other keys', async () => {
      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrix.yaml', description: 'oops' }]),
      ).rejects.toThrow(/\$values as its only key/);
    });

    it('rejects non-file:// $values refs', async () => {
      await expect(expandScenarioConfigValues([{ $values: 'matrix.yaml' }])).rejects.toThrow(
        /must be a file:\/\/ reference/,
      );
    });

    it('rejects non-string $values', async () => {
      await expect(expandScenarioConfigValues([{ $values: 42 }])).rejects.toThrow(
        /must be a file:\/\/ reference/,
      );
    });

    it('rejects string config values with a pointer to $values syntax', async () => {
      await expect(expandScenarioConfigValues('file://matrix.yaml')).rejects.toThrow(
        /config: \[\{ \$values: "file:\/\/matrix\.yaml" \}\]/,
      );
    });

    it('rejects empty matrix files instead of injecting null rows', async () => {
      const matrixPath = write('empty.yaml', '# only comments\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(ConfigResolutionError);
      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/is empty/);
    });

    it('rejects non-object matrix rows instead of spreading them into tests', async () => {
      const matrixPath = write('strings.yaml', '- French\n- Spanish\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/must be objects/);
    });

    it('rejects nested $values rows instead of passing them through silently', async () => {
      write('outer.yaml', '- $values: file://inner.yaml\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${path.join(tmpDir, 'outer.yaml')}` }]),
      ).rejects.toThrow(/Nested \$values references are not supported/);
    });

    it('flattens one level of nested arrays in matrix files', async () => {
      const matrixPath = write(
        'nested-arrays.json',
        JSON.stringify([[{ vars: { a: '1' } }], [{ vars: { a: '2' } }]]),
      );

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { a: '1' } }, { vars: { a: '2' } }]);
    });

    it('rejects rows with no recognized test case fields (flat-CSV mistake)', async () => {
      const matrixPath = write('flat.yaml', '- language: French\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/no recognized test case fields.*nest them under "vars"/);
    });

    it('warns once per file about unrecognized fields on otherwise-valid rows', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const matrixPath = write(
        'typo.yaml',
        '- vars:\n    language: French\n  asserts:\n    - type: contains\n- vars:\n    language: Spanish\n  asserts:\n    - type: contains\n',
      );

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unrecognized test case fields [asserts]'),
      );
    });

    it('allows empty-object rows', async () => {
      const matrixPath = write('empty-row.yaml', '- {}\n- vars:\n    language: French\n');

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{}, { vars: { language: 'French' } }]);
    });

    it('rejects matrix files that contribute no rows', async () => {
      const matrixPath = write('no-rows.json', '[]');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/contributed no rows/);
    });

    it('passes through missing-file errors with the resolved path', async () => {
      await expect(
        expandScenarioConfigValues([{ $values: `file://${path.join(tmpDir, 'nope.yaml')}` }]),
      ).rejects.toThrow(/nope\.yaml/);
    });
  });

  describe('loadScenarioConfigs', () => {
    it('returns undefined for missing scenarios', async () => {
      await expect(loadScenarioConfigs(undefined)).resolves.toBeUndefined();
    });

    it('resolves inline scenario $values refs against the base path', async () => {
      const scenarios: Scenario[] = [{ config: [{ $values: 'file://matrix.yaml' }], tests: [{}] }];

      const loaded = await loadScenarioConfigs(scenarios, tmpDir);

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'matrix.yaml')}`,
      });
    });

    it('resolves $values refs in file scenarios against the scenario file directory', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'scenarios', 'matrix.yaml')}`,
      });
    });

    it('resolves $values per matched file for glob scenarios', async () => {
      write(
        'scenarios/unit/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );
      write(
        'scenarios/integration/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', '**', 'scenario.yaml')}`],
        tmpDir,
      );

      const refs = loaded?.map((scenario) =>
        'config' in scenario ? scenario.config[0] : undefined,
      );
      expect(refs).toEqual(
        expect.arrayContaining([
          { $values: `file://${path.join(tmpDir, 'scenarios', 'unit', 'matrix.yaml')}` },
          { $values: `file://${path.join(tmpDir, 'scenarios', 'integration', 'matrix.yaml')}` },
        ]),
      );
    });

    it('rejects bare scenario strings instead of mangling them', async () => {
      await expect(loadScenarioConfigs(['scenario.yaml'], tmpDir)).rejects.toThrow(
        /must be objects or file:\/\/ references/,
      );
    });

    it('loads plain refs from directories whose names contain glob metacharacters', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      fs.mkdirSync(weirdDir, { recursive: true });
      fs.writeFileSync(
        path.join(weirdDir, 'scenario.yaml'),
        '- config:\n    - vars:\n        a: "1"\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(['file://scenario.yaml'], weirdDir);

      expect(loaded).toHaveLength(1);
      expect(loaded?.[0].config).toEqual([{ vars: { a: '1' } }]);
    });

    it('loads refs whose own path contains glob metacharacters in a directory name', async () => {
      // combineConfigs absolutizes scenario refs, baking bracketed parent dirs into
      // the ref itself; the glob branch must fall back to the literal file.
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      fs.mkdirSync(weirdDir, { recursive: true });
      fs.writeFileSync(
        path.join(weirdDir, 'scenario.yaml'),
        '- config:\n    - vars:\n        a: "1"\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(weirdDir, 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded).toHaveLength(1);
      expect(loaded?.[0].config).toEqual([{ vars: { a: '1' } }]);
    });

    it('rejects scenario files containing non-object entries', async () => {
      write('bad-scenario.yaml', '- just-a-string\n');

      await expect(
        loadScenarioConfigs([`file://${path.join(tmpDir, 'bad-scenario.yaml')}`], tmpDir),
      ).rejects.toThrow(/must contain scenario objects.*just-a-string/);
    });

    it('throws a clear error when a scenario glob matches nothing', async () => {
      await expect(
        loadScenarioConfigs([`file://${path.join(tmpDir, 'missing', '*.yaml')}`], tmpDir),
      ).rejects.toThrow(/No files found matching pattern/);
    });
  });

  describe('resolveScenarioConfigValuesRefs', () => {
    it('leaves plain rows untouched and resolves only $values rows', () => {
      const scenario: Scenario = {
        config: [{ vars: { a: '1' } }, { $values: 'file://matrix.yaml' }],
        tests: [{}],
      };

      const resolved = resolveScenarioConfigValuesRefs('/base', scenario);

      expect(resolved.config).toEqual([
        { vars: { a: '1' } },
        { $values: `file://${path.resolve('/base', 'matrix.yaml')}` },
      ]);
    });
  });
});
