import fs from 'fs';
import path from 'path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';
import { parseDocument, visit } from 'yaml';

const rootDir = path.join(__dirname, '../..');
const exampleYamlFiles = globSync('examples/**/*.{yaml,yml}', {
  cwd: rootDir,
  absolute: true,
}).sort();

describe('Example YAML compatibility', () => {
  it('keeps YAML alias count within SnakeYAML parser limits', () => {
    // CodeQL's JavaScript extractor parses YAML with SnakeYAML, which defaults to a
    // max of 50 aliases for non-scalar nodes.
    const filesOverLimit = exampleYamlFiles
      .map((file) => {
        const doc = parseDocument(fs.readFileSync(file, 'utf8'));
        let aliasCount = 0;

        visit(doc, {
          Alias() {
            aliasCount += 1;
          },
        });

        return { aliasCount, file: path.relative(rootDir, file) };
      })
      .filter(({ aliasCount }) => aliasCount > 50);

    expect(filesOverLimit).toEqual([]);
  });
});
