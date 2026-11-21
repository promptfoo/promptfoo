import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '..');
const rootOwnedPrefixes = ['src/', 'test/', 'scripts/'];
const externalProjectPrefixes = ['src/app/', 'test/code-scan-action/'];

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function getTrackedTypeScriptFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .map((filePath) => filePath.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter(
      (filePath) =>
        /\.(?:[cm]?ts|tsx)$/.test(filePath) &&
        (!filePath.includes('/') ||
          rootOwnedPrefixes.some((prefix) => filePath.startsWith(prefix))) &&
        !externalProjectPrefixes.some((prefix) => filePath.startsWith(prefix)),
    )
    .sort();
}

export function getRootProjectFiles(): Set<string> {
  const compilerPath = fileURLToPath(
    new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
  );
  const compilerOutput = execFileSync(process.execPath, [compilerPath, '--showConfig'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const config: { files: string[] } = JSON.parse(compilerOutput);

  return new Set(
    config.files.map((filePath) =>
      normalizePath(path.relative(repoRoot, path.resolve(repoRoot, filePath))),
    ),
  );
}

export function findMissingRootTypeScriptFiles(): string[] {
  const projectFiles = getRootProjectFiles();
  return getTrackedTypeScriptFiles().filter((filePath) => !projectFiles.has(filePath));
}

export function runTypeScriptCoverageCheck(): number {
  const missingFiles = findMissingRootTypeScriptFiles();

  if (missingFiles.length === 0) {
    return 0;
  }

  console.error('Root tsconfig.json is not type-checking these tracked TypeScript files:');
  for (const filePath of missingFiles) {
    console.error(`- ${filePath}`);
  }
  console.error(
    'Add them to the root project, or add the owning subtree to externalProjectPrefixes with a separate typecheck.',
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
