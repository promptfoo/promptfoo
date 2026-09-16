import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { checkNodeApiDocsClean, validateNodeApiDocs } from '../../scripts/checkNodeApiDocs';

describe('validateNodeApiDocs', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  function copyContract() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-api-docs-'));
    tempDirs.push(root);
    for (const relativePath of [
      'site/docs/api/node/reference',
      'site/docs/usage',
      'site/src/data/nodeApiLegacyAnchors.json',
    ]) {
      const destination = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(relativePath, destination, { recursive: true });
    }
    return root;
  }

  it.each(['modified', 'untracked'])('rejects %s generated documentation', (change) => {
    const root = copyContract();
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', 'site/docs/api/node/reference'], { cwd: root });
    expect(() => checkNodeApiDocsClean(root)).not.toThrow();
    const file = path.join(
      root,
      'site/docs/api/node/reference',
      change === 'untracked' ? 'new.md' : 'README.md',
    );
    fs.appendFileSync(file, '\nGenerated content changed.\n');
    expect(() => checkNodeApiDocsClean(root)).toThrow();
  });

  it('accepts the checked-in Node.js API docs contract', () => {
    expect(() => validateNodeApiDocs()).not.toThrow();
  });

  it('accepts Windows line endings around legacy anchors', () => {
    const root = copyContract();
    const target = path.join(root, 'site/docs/usage/node-api-examples.md');
    const contents = fs.readFileSync(target, 'utf8').replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(target, contents);
    expect(() => validateNodeApiDocs(root)).not.toThrow();
  });

  it('rejects corrupted generic signatures', () => {
    const root = copyContract();
    const target = path.join(root, 'site/docs/api/node/reference/functions/evaluate.md');
    fs.appendFileSync(target, '\n> **evaluate**(): `Promise`\\<`Eval`>>\\>\n');
    expect(() => validateNodeApiDocs(root)).toThrow('malformed generic delimiters');
  });

  it('rejects aliases moved away from their destination section', () => {
    const root = copyContract();
    const target = path.join(root, 'site/docs/usage/node-api-examples.md');
    const usage = '<LegacyHeadingAnchors page="examples" section="Isolate caches" />';
    const contents = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${usage}\n${contents.replace(usage, '')}`);
    expect(() => validateNodeApiDocs(root)).toThrow('immediately after its heading');
  });

  it.each([
    ['malformed frontmatter', 'site/docs/api/node/reference/README.md', 'not frontmatter'],
    [
      'wrong sidebar position',
      'site/docs/api/node/reference/README.md',
      '---\nsidebar_position: 2\ntitle: Node.js API Reference\ndescription: A deliberately long description that remains within the required one hundred and fifty to one hundred and sixty character contract for this fixture.\n---\n',
    ],
    [
      'missing legacy anchor import',
      'site/docs/usage/node-api-examples.md',
      '# Node API examples\n',
    ],
  ])('rejects %s', (_name, relativePath, contents) => {
    const root = copyContract();
    fs.writeFileSync(path.join(root, relativePath), contents);
    expect(() => validateNodeApiDocs(root)).toThrow();
  });
});
