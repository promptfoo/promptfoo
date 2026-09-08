import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Bootstrap artifact acceptance with Node alone, before installing repository dependencies.
const { values } = parseArgs({
  options: {
    'artifact-directory': { type: 'string' },
    'temp-root': { type: 'string' },
  },
});
assert(values['artifact-directory'], '--artifact-directory is required');
const artifactDirectory = path.resolve(values['artifact-directory']);
const archives = fs.readdirSync(artifactDirectory).filter((file) => file.endsWith('.tgz'));
assert.equal(archives.length, 1, 'Expected exactly one downloaded package archive');
const tarball = path.join(artifactDirectory, archives[0]);
assert(fs.statSync(tarball).isFile(), 'Expected a package archive file');

const repository = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(repository, 'package-lock.json'), 'utf8'));
const dependencies = Object.fromEntries(
  ['tsx', 'typescript', 'semver'].map((name) => {
    const version = lock.packages[`node_modules/${name}`]?.version;
    assert(
      typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version),
      `Expected an exact locked tool version: ${name}`,
    );
    return [name, version];
  }),
);
const tempRoot = path.resolve(values['temp-root'] ?? process.env.RUNNER_TEMP ?? os.tmpdir());
const tooling = fs.mkdtempSync(path.join(tempRoot, 'promptfoo-artifact-tools-'));
fs.mkdirSync(path.join(tooling, 'scripts'));
fs.mkdirSync(path.join(tooling, 'test', 'fixtures'), { recursive: true });
for (const filename of ['testPackageArtifact.ts', 'packPackageArtifact.ts', 'postbuild.ts']) {
  fs.copyFileSync(
    path.join(repository, 'scripts', filename),
    path.join(tooling, 'scripts', filename),
  );
}
fs.cpSync(
  path.join(repository, 'test', 'fixtures', 'package-artifact'),
  path.join(tooling, 'test', 'fixtures', 'package-artifact'),
  { recursive: true },
);
fs.writeFileSync(
  path.join(tooling, 'package.json'),
  `${JSON.stringify(
    {
      name: 'promptfoo-artifact-tooling',
      private: true,
      type: 'module',
      scripts: { 'test:artifact': 'tsx scripts/testPackageArtifact.ts' },
      dependencies,
    },
    null,
    2,
  )}\n`,
);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `tooling=${tooling}\ntarball=${tarball}\n`);
}
console.log(JSON.stringify({ tooling, tarball }));
