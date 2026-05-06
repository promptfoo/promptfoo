import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { globSync } from 'glob';
import ts from 'typescript';

export interface LayerDefinition {
  name: string;
  roots: string[];
}

export interface LayerConfig {
  publicFacade: string;
  layers: LayerDefinition[];
}

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const DIRECTORY_INDEXES = TYPESCRIPT_EXTENSIONS.map((extension) => `index${extension}`);
const SOURCE_EXTENSIONS_BY_RUNTIME_EXTENSION: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};
const BUILTIN_MODULES = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, moduleName.replace(/^node:/, '')]),
);

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function readLayerConfig(repoRoot: string): LayerConfig {
  const configPath = path.join(repoRoot, 'architecture/layers.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as LayerConfig;
}

export function getSourceFiles(repoRoot: string, includeApp = true): string[] {
  return globSync('src/**/*.{ts,tsx,mts,cts}', {
    cwd: repoRoot,
    ignore: includeApp ? ['src/**/*.d.ts'] : ['src/**/*.d.ts', 'src/app/**'],
    nodir: true,
  }).map(normalizePath);
}

export function getLayerForFile(relativePath: string, config: LayerConfig): string {
  const normalizedPath = normalizePath(relativePath);
  for (const layer of config.layers) {
    if (
      layer.roots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`))
    ) {
      return layer.name;
    }
  }
  return 'unclassified';
}

export function extractModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function addStaticCallSpecifier(node: ts.CallExpression): void {
    if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) {
      return;
    }

    if (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
      (ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'require' &&
        node.expression.name.text === 'resolve')
    ) {
      specifiers.push(node.arguments[0].text);
    }
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    }

    if (ts.isCallExpression(node)) {
      addStaticCallSpecifier(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function resolveRelativeModule(
  repoRoot: string,
  importerRelativePath: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const importerDir = path.dirname(path.join(repoRoot, importerRelativePath));
  const unresolvedPath = path.resolve(importerDir, specifier);
  const runtimeExtension = path.extname(unresolvedPath);
  const runtimeSourceCandidates = (
    SOURCE_EXTENSIONS_BY_RUNTIME_EXTENSION[runtimeExtension] ?? []
  ).map((extension) => `${unresolvedPath.slice(0, -runtimeExtension.length)}${extension}`);
  const candidates = [
    unresolvedPath,
    ...runtimeSourceCandidates,
    ...TYPESCRIPT_EXTENSIONS.map((extension) => `${unresolvedPath}${extension}`),
    ...DIRECTORY_INDEXES.map((indexFile) => path.join(unresolvedPath, indexFile)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return normalizePath(path.relative(repoRoot, candidate));
    }
  }

  return undefined;
}

export function getPackageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) {
    return undefined;
  }

  const withoutNodePrefix = specifier.replace(/^node:/, '');
  const segments = withoutNodePrefix.split('/');
  const packageName = withoutNodePrefix.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];

  if (!packageName || BUILTIN_MODULES.has(packageName)) {
    return undefined;
  }

  return packageName;
}
