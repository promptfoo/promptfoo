import fs from 'fs';
import path from 'path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';
import { validateFileReferences } from '../../src/util/file';
import { loadYaml } from '../../src/util/yamlLoad';

const rootDir = path.join(__dirname, '../..');
const examplesDir = path.join(rootDir, 'examples');

const configFiles = globSync('**/promptfooconfig*.{yaml,yml}', {
  cwd: examplesDir,
  ignore: ['**/node_modules/**'],
}).sort();

/**
 * `combineConfigs` rejects a config whose structural `file://` references (prompts,
 * provider ids, test/scenario files, extensions) do not exist. Every shipped example
 * must survive that check, otherwise `promptfoo eval` fails before it starts.
 *
 * Examples that intentionally reference files the user supplies themselves —
 * `google-video`'s `providers[0].config.image`, `config-pdf-variables`'s
 * `tests[N].vars.paper`, `simple-test`'s `outputPath` — are runtime data, not
 * structure, and must stay exempt. This suite pins both halves.
 */
describe('Example config file references', () => {
  it('finds example configs', () => {
    expect(configFiles.length).toBeGreaterThan(0);
  });

  it.each(configFiles)('%s resolves every structural file:// reference', (relativePath) => {
    const absolutePath = path.join(examplesDir, relativePath);
    const config = loadYaml(fs.readFileSync(absolutePath, 'utf8'));
    const result = validateFileReferences(config, path.dirname(absolutePath));

    expect(
      result.missingFiles.map(
        ({ reference, resolvedPath }) =>
          `${reference.configPath}: ${reference.original} -> ${resolvedPath}`,
      ),
    ).toEqual([]);
  });

  it('does not require user-supplied assets referenced as runtime data', () => {
    const userSuppliedAssetExamples = [
      // `providers[0].config.image` — README tells the user to `cp` their own image in.
      { config: 'google-video/promptfooconfig-image.yaml', missing: 'assets/start-frame.jpg' },
      // `tests[N].vars.paper` — PDFs are downloaded by `fetch_pdfs.sh`.
      { config: 'config-pdf-variables/promptfooconfig.yaml', missing: 'pdfs/arxiv_1.pdf' },
    ];

    for (const { config: relativePath, missing } of userSuppliedAssetExamples) {
      const absolutePath = path.join(examplesDir, relativePath);
      // The asset really is absent from the repo; that is the point of the example.
      expect(fs.existsSync(path.join(path.dirname(absolutePath), missing))).toBe(false);

      const config = loadYaml(fs.readFileSync(absolutePath, 'utf8'));
      expect(validateFileReferences(config, path.dirname(absolutePath)).valid).toBe(true);
    }
  });
});
