import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface PackResult {
  filename: string;
  name: string;
  version: string;
}

const ROOT = path.resolve(import.meta.dirname, '..');

function main(): void {
  const destinationArgumentIndex = process.argv.indexOf('--destination');
  const destination =
    destinationArgumentIndex === -1 ? undefined : process.argv[destinationArgumentIndex + 1];
  if (!destination) {
    throw new Error('--destination requires a package artifact directory.');
  }
  assert(process.env.npm_execpath, 'Expected npm_execpath when packing the package artifact');

  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  const artifactDirectory = path.resolve(ROOT, destination);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const output = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      artifactDirectory,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const results = JSON.parse(output) as PackResult[];
  assert.equal(results.length, 1, 'Expected npm pack to produce exactly one package artifact');
  const [result] = results;
  assert.equal(result.name, packageJson.name, 'Packed artifact name does not match package.json');
  assert.equal(
    result.version,
    packageJson.version,
    'Packed artifact version does not match package.json',
  );
  assert.equal(typeof result.filename, 'string', 'Packed artifact is missing a filename');

  const artifactPath = path.join(artifactDirectory, result.filename);
  assert(fs.existsSync(artifactPath), `Packed artifact does not exist: ${artifactPath}`);
  console.log(artifactPath);
}

main();
