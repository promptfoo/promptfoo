import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { shouldCopyDrizzlePath } from './postbuild';

function listFiles(packageDir: string, rootDir: string): string[] {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    return entry.isDirectory()
      ? listFiles(packageDir, fullPath)
      : [path.relative(packageDir, fullPath).split(path.sep).join('/')];
  });
}

// Validate the complete build inventory here, including lazy-loaded UI chunks.
// Existing-archive consumers can then run without the original source/build tree.
export function assertBuiltAssetsPackaged(
  packageDir: string,
  files: Array<{ path: string }>,
): void {
  const packagedPaths = new Set(files.map((file) => file.path));
  const expectedPaths = [
    ...listFiles(packageDir, path.join(packageDir, 'drizzle'))
      .filter(shouldCopyDrizzlePath)
      .map((file) => `dist/${file}`),
    ...listFiles(packageDir, path.join(packageDir, 'dist', 'src', 'app')).filter(
      (file) => !file.endsWith('.map'),
    ),
  ];
  const missing = expectedPaths.filter((file) => !packagedPaths.has(file));
  assert.deepEqual(missing, [], `Missing packaged build assets: ${missing.join(', ')}`);
}

// Pack prebuilt output once. The release workflow runs prepublishOnly explicitly before
// this step, then passes this exact file to consumer acceptance and npm publish.
export function packPackageArtifact(packageDir: string, destination: string): string {
  assert(process.env.npm_execpath, 'Run the artifact packer through npm');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'promptfoo', 'Expected the promptfoo package');
  const artifactDirectory = path.resolve(destination);
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
    { cwd: packageDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  const results = JSON.parse(output) as Array<{
    name: string;
    version: string;
    filename: string;
    files: Array<{ path: string }>;
  }>;
  assert.equal(results.length, 1, 'Expected exactly one package artifact');
  const [result] = results;
  assert.equal(result.name, manifest.name);
  assert.equal(result.version, manifest.version);
  assert.equal(typeof result.filename, 'string');
  assert.equal(
    path.basename(result.filename),
    result.filename,
    'Expected a plain artifact filename',
  );
  const artifactPath = path.join(artifactDirectory, result.filename);
  assert(fs.statSync(artifactPath).isFile(), `Missing package artifact: ${artifactPath}`);
  assertBuiltAssetsPackaged(packageDir, result.files);
  return artifactPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { destination: { type: 'string' } } });
  assert(values.destination, '--destination requires an artifact directory');
  console.log(packPackageArtifact(path.resolve(import.meta.dirname, '..'), values.destination));
}
