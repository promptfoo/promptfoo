import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const repoRoot = path.resolve(import.meta.dirname, '..');
const rootOwnedPrefixes = ['src/', 'test/', 'scripts/'];
const externalProjectPrefixes = ['src/app/', 'test/code-scan-action/', 'test/site/'];

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

function getTrackedTypeScriptFiles(): string[] {
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
        hasPrefix(filePath, rootOwnedPrefixes) &&
        !hasPrefix(filePath, externalProjectPrefixes),
    )
    .sort();
}

function getRootProjectFiles(): Set<string> {
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

function main(): void {
  const projectFiles = getRootProjectFiles();
  const missingFiles = getTrackedTypeScriptFiles().filter(
    (filePath) => !projectFiles.has(filePath),
  );

  if (missingFiles.length === 0) {
    return;
  }

  console.error('Root tsconfig.json is not type-checking these tracked TypeScript files:');
  for (const filePath of missingFiles) {
    console.error(`- ${filePath}`);
  }
  console.error(
    'Add them to the root project, or add the owning subtree to externalProjectPrefixes with a separate typecheck.',
  );
  process.exitCode = 1;
}

main();
