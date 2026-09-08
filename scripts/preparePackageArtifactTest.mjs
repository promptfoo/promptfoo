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
// Retain the repository's exact transitive graph, including every native platform
// package. Keep nested lock keys so npm resolves dependencies exactly as reviewed.
const packages = {};
function includeDependency(name, from = '') {
  let parent = from;
  let key;
  while (true) {
    const candidate = path.posix.join(parent, 'node_modules', name);
    if (lock.packages[candidate]) {
      key = candidate;
      break;
    }
    assert(parent, `Missing locked artifact tool dependency: ${name} from ${from || 'root'}`);
    parent = path.posix.dirname(parent);
    if (parent === '.') {
      parent = '';
    }
  }
  if (packages[key]) {
    return;
  }
  const entry = lock.packages[key];
  assert(!entry.link && entry.resolved && entry.integrity, `Expected a registry tool: ${key}`);
  // These tools are production dependencies of this private package, even when
  // the repository classifies them as development-only dependencies.
  const { dev, devOptional, ...installedEntry } = entry;
  packages[key] = installedEntry;
  for (const dependency of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
    includeDependency(dependency, key);
  }
  assert(
    Object.keys(entry.peerDependencies ?? {}).length === 0,
    `Artifact tooling peer dependencies require explicit lock support: ${key}`,
  );
}
for (const name of Object.keys(dependencies)) {
  includeDependency(name);
}
const manifest = {
  name: 'promptfoo-artifact-tooling',
  private: true,
  type: 'module',
  scripts: { 'test:artifact': 'tsx scripts/testPackageArtifact.ts' },
  dependencies,
};
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
fs.writeFileSync(path.join(tooling, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(
  path.join(tooling, 'package-lock.json'),
  `${JSON.stringify(
    {
      name: manifest.name,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: manifest.name, dependencies }, ...packages },
    },
    null,
    2,
  )}\n`,
);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `tooling=${tooling}\ntarball=${tarball}\n`);
}
console.log(JSON.stringify({ tooling, tarball }));
