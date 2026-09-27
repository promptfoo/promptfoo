import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use the same isolated, pinned Renovate installation as the config validator.
// These internal APIs deliberately fail loudly if a tool upgrade changes them.
const renovateDir = process.argv[2];
assert.ok(renovateDir, 'Pass the installed Renovate package directory');
const load = (file) => import(pathToFileURL(path.resolve(renovateDir, 'dist', file)).href);
const [
  { migrateConfig },
  { extractPackageFile },
  { applyPackageRules },
  { api: pep440 },
  { regexEngineStatus },
] = await Promise.all([
  load('config/migration.js'),
  load('modules/manager/pip_requirements/extract.js'),
  load('util/package-rules/index.js'),
  load('modules/versioning/pep440/index.js'),
  load('util/regex.js'),
]);
assert.equal(
  regexEngineStatus.type,
  'available',
  'Install native RE2 so validation uses the same regex engine as Renovate',
);

const configFile = process.argv[3] ?? new URL('../../renovate.json', import.meta.url);
const config = JSON.parse(await readFile(configFile, 'utf8'));
const { packageRules } = migrateConfig(config).migratedConfig;

// Fixture versions exercise the legacy-bound transition, independently of which
// example migrations have landed. Use Renovate's extractor, ordered local rules,
// and PEP 440 implementation rather than reimplementing any matching logic.
const providerFile = 'examples/provider-python/requirements.txt';
const agentsFile = 'examples/openai-agents/requirements.txt';
const otherFile = 'examples/another-example/requirements.txt';
const fixtures = [
  {
    name: 'legacy AnyIO pin permits patches but holds the Python-floor change',
    file: providerFile,
    requirement: 'anyio==4.12.1',
    candidates: { '4.12.2': true, '4.13.0': false },
  },
  {
    name: 'legacy AnyIO pin accepts whitespace',
    file: providerFile,
    requirement: 'anyio == 4.12.1',
    candidates: { '4.12.2': true, '4.13.0': false },
  },
  {
    name: 'migrated AnyIO range can receive the newer release',
    file: providerFile,
    requirement: 'anyio>=4.13.0,<5',
    candidates: { '4.13.0': true },
  },
  {
    name: 'AnyIO in another example is not held',
    file: otherFile,
    requirement: 'anyio==4.12.1',
    candidates: { '4.13.0': true },
  },
  {
    name: 'another package in the provider example is not held',
    file: providerFile,
    requirement: 'openai==4.12.1',
    candidates: { '4.13.0': true },
  },
  {
    name: 'legacy Agents OpenAI bound rejects the incompatible usage object',
    file: agentsFile,
    requirement: 'openai>=1.109.1,<2.45.0',
    candidates: { '2.44.0': true, '2.45.0': false },
  },
  {
    name: 'legacy Agents bound accepts reordered constraints and whitespace',
    file: agentsFile,
    requirement: 'openai< 2.45,>=1.109.1',
    candidates: { '2.44.0': true, '2.45.0': false },
  },
  {
    name: 'migrated Agents range can receive the newer SDK',
    file: agentsFile,
    requirement: 'openai>=3.19.2,<4',
    candidates: { '3.19.2': true },
  },
  {
    name: 'OpenAI in another example is not held',
    file: otherFile,
    requirement: 'openai>=1.109.1,<2.45.0',
    candidates: { '2.45.0': true },
  },
  {
    name: 'another package in the Agents example is not held',
    file: agentsFile,
    requirement: 'anyio>=1.109.1,<2.45.0',
    candidates: { '2.45.0': true },
  },
];

for (const fixture of fixtures) {
  const extracted = extractPackageFile(`${fixture.requirement}\n`);
  assert.equal(extracted?.deps.length, 1, `${fixture.name}: extract one requirement`);
  const [dependency] = extracted.deps;
  assert.ok(dependency.currentValue, `${fixture.name}: extract its version constraint`);
  assert.equal(dependency.skipReason, undefined, `${fixture.name}: supported requirement`);
  const result = await applyPackageRules({
    ...dependency,
    manager: 'pip_requirements',
    packageFile: fixture.file,
    packageRules,
  });
  assert.notEqual(result.enabled, false, `${fixture.name}: dependency updates remain enabled`);
  for (const [version, expected] of Object.entries(fixture.candidates)) {
    const allowed = !result.allowedVersions || pep440.matches(version, result.allowedVersions);
    assert.equal(allowed, expected, `${fixture.name}: compatibility policy for ${version}`);
  }
}

console.log(`Renovate Python compatibility holds: ${fixtures.length} fixtures passed`);
