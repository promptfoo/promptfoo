import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rootOwnedPrefixes = ['src/', 'test/', 'scripts/'];
const externalProjectPrefixes = ['src/app/', 'test/code-scan-action/'];

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

function isRootOwnedTypeScriptFile(filePath: string): boolean {
  return !filePath.includes('/') || hasPrefix(filePath, rootOwnedPrefixes);
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
        isTypeScriptFile(filePath) &&
        isRootOwnedTypeScriptFile(filePath) &&
        !hasPrefix(filePath, externalProjectPrefixes),
    )
    .sort();
}

export function getRootProjectFiles(): Set<string> {
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error('Could not find root tsconfig.json');
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  if (parsedConfig.errors.length > 0) {
    const message = parsedConfig.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
      .join('\n');
    throw new Error(message);
  }

  return new Set(
    parsedConfig.fileNames.map((filePath) => normalizePath(path.relative(repoRoot, filePath))),
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
