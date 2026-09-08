import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readLayerConfig } from './architectureUtils';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rootOwnedPrefixes = ['src/', 'test/', 'scripts/', 'packages/'];
const externalProjectPrefixes = ['src/app/', 'test/code-scan-action/'];

interface ProjectConfig {
  files?: string[];
  references?: { path: string }[];
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function isTypeScriptFile(filePath: string): boolean {
  return (
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.mts') ||
    filePath.endsWith('.cts')
  );
}

function hasPrefix(filePath: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

function isRootOwnedTypeScriptFile(filePath: string, configuredRoots: string[]): boolean {
  return (
    !filePath.includes('/') ||
    hasPrefix(filePath, rootOwnedPrefixes) ||
    configuredRoots.some((root) => filePath === root || filePath.startsWith(`${root}/`))
  );
}

export function getTrackedTypeScriptFiles(repositoryRoot = repoRoot): string[] {
  const configuredRoots = fs.existsSync(path.join(repositoryRoot, 'architecture/layers.json'))
    ? readLayerConfig(repositoryRoot).layers.flatMap((layer) =>
        layer.roots.map((root) =>
          normalizePath(path.relative(repositoryRoot, path.resolve(repositoryRoot, root))),
        ),
      )
    : [];
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .filter(
      (filePath) =>
        isTypeScriptFile(filePath) &&
        isRootOwnedTypeScriptFile(filePath, configuredRoots) &&
        !hasPrefix(filePath, externalProjectPrefixes),
    )
    .sort();
}

function runCompiler(configPath: string, repositoryRoot: string, args: string[]): string {
  const compilerPath = fileURLToPath(
    new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
  );
  const result = spawnSync(process.execPath, [compilerPath, '--project', configPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    // The root project includes dependency declarations; its file list is large.
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = args.includes('--listFilesOnly')
      ? result.stdout
          .split(/\r?\n/)
          .filter((line) => /\berror TS\d+:/.test(line) || /^\s+\S/.test(line))
          .join('\n')
      : result.stdout;
    const diagnostics = [output.trim(), result.stderr.trim()].filter(Boolean).join('\n');
    throw new Error(
      `Could not read TypeScript project ${normalizePath(path.relative(repositoryRoot, configPath))}:\n${diagnostics || `Compiler exited with status ${result.status}`}`,
    );
  }
  return result.stdout;
}

function readProjectConfig(configPath: string, repositoryRoot: string): ProjectConfig {
  // --showConfig can discard invalid options without returning an error.
  // Validate every project, including root reference diagnostics, without emitting.
  runCompiler(configPath, repositoryRoot, ['--listFilesOnly', '--pretty', 'false']);
  return JSON.parse(runCompiler(configPath, repositoryRoot, ['--showConfig']));
}

function getProjectFiles(
  config: ProjectConfig,
  configPath: string,
  repositoryRoot: string,
): Set<string> {
  return new Set(
    (config.files ?? []).map((filePath) =>
      normalizePath(
        path.relative(repositoryRoot, path.resolve(path.dirname(configPath), filePath)),
      ),
    ),
  );
}

export function getRootProjectFiles(repositoryRoot = repoRoot): Set<string> {
  const configPath = path.join(repositoryRoot, 'tsconfig.json');
  return getProjectFiles(readProjectConfig(configPath, repositoryRoot), configPath, repositoryRoot);
}

export function findMissingRootTypeScriptFiles(repositoryRoot = repoRoot): string[] {
  const rootConfigPath = path.join(repositoryRoot, 'tsconfig.json');
  const rootConfig = readProjectConfig(rootConfigPath, repositoryRoot);
  const projectFiles = getProjectFiles(rootConfig, rootConfigPath, repositoryRoot);
  const packageProjectFiles = new Map<string, Set<string>>();
  const visited = new Set([rootConfigPath]);

  function visitReferences(config: ProjectConfig, configPath: string): void {
    for (const reference of config.references ?? []) {
      const referencePath = path.resolve(path.dirname(configPath), reference.path);
      const referencedConfigPath = fs.statSync(referencePath).isDirectory()
        ? path.join(referencePath, 'tsconfig.json')
        : referencePath;
      if (visited.has(referencedConfigPath)) {
        continue;
      }
      visited.add(referencedConfigPath);
      const referencedConfig = readProjectConfig(referencedConfigPath, repositoryRoot);
      const projectPrefix = `${normalizePath(
        path.relative(repositoryRoot, path.dirname(referencedConfigPath)),
      )}/`;

      // Package projects must be explicitly referenced. They can own only files
      // beneath their own directory; root source and tooling keep their ratchet.
      if (projectPrefix.startsWith('packages/')) {
        const ownedFiles = packageProjectFiles.get(projectPrefix) ?? new Set<string>();
        for (const filePath of getProjectFiles(
          referencedConfig,
          referencedConfigPath,
          repositoryRoot,
        )) {
          if (filePath.startsWith(projectPrefix)) {
            ownedFiles.add(filePath);
          }
        }
        packageProjectFiles.set(projectPrefix, ownedFiles);
      }
      visitReferences(referencedConfig, referencedConfigPath);
    }
  }

  visitReferences(rootConfig, rootConfigPath);
  // A registered package owns its subtree even if the root also includes it.
  // Prefer the closest project so a parent cannot mask a child's missing files.
  const packageProjects = [...packageProjectFiles].sort(([a], [b]) => b.length - a.length);
  return getTrackedTypeScriptFiles(repositoryRoot).filter((filePath) => {
    const owner = packageProjects.find(([prefix]) => filePath.startsWith(prefix));
    return !(owner?.[1] ?? projectFiles).has(filePath);
  });
}

export function runTypeScriptCoverageCheck(): number {
  const missingFiles = findMissingRootTypeScriptFiles();

  if (missingFiles.length === 0) {
    return 0;
  }

  console.error('Tracked TypeScript files are missing from their owning compiler project:');
  for (const filePath of missingFiles) {
    console.error(`- ${filePath}`);
  }
  console.error(
    'Add them to the root project. Files under packages/ may instead belong to a package tsconfig explicitly referenced by the root project.',
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runTypeScriptCoverageCheck();
  } catch (error) {
    console.error(
      `Failed to verify root TypeScript coverage: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
