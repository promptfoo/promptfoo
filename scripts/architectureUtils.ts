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
  leafLayers?: string[];
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

export function resolveInternalModule(
  repoRoot: string,
  importerRelativePath: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith('.') && specifier !== 'src' && !specifier.startsWith('src/')) {
    return undefined;
  }

  const unresolvedPath = specifier.startsWith('.')
    ? path.resolve(path.dirname(path.join(repoRoot, importerRelativePath)), specifier)
    : path.resolve(repoRoot, specifier);

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

export type BoundaryViolationKind = 'facade' | 'leaf';

export interface BoundaryViolation {
  kind: BoundaryViolationKind;
  importer: string;
  importerLayer: string;
  specifier: string;
  /** Resolved import target. Set for both kinds. */
  imported: string;
  /** Layer of the resolved import. Set for both kinds; equals 'facade' when kind === 'facade'. */
  importedLayer: string;
}

/**
 * Walks the source tree under `repoRoot` and returns every layer-boundary
 * violation, given a `LayerConfig`. Pure function: no I/O beyond the file
 * reads required to scan source files; no `process.exit`. Exposed so the
 * pipeline can be unit-tested against fixture trees.
 */
export function findViolations(repoRoot: string, config: LayerConfig): BoundaryViolation[] {
  const publicFacade = normalizePath(config.publicFacade);
  const leafLayers = new Set(config.leafLayers ?? []);
  const violations: BoundaryViolation[] = [];

  for (const importer of getSourceFiles(repoRoot)) {
    if (normalizePath(importer) === publicFacade) {
      continue;
    }

    const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');
    const importerLayer = getLayerForFile(importer, config);

    for (const specifier of extractModuleSpecifiers(sourceText, importer)) {
      const resolvedImport = resolveInternalModule(repoRoot, importer, specifier);
      if (!resolvedImport) {
        continue;
      }

      if (resolvedImport === publicFacade) {
        violations.push({
          kind: 'facade',
          importer,
          importerLayer,
          specifier,
          imported: resolvedImport,
          importedLayer: getLayerForFile(resolvedImport, config),
        });
      }

      if (leafLayers.has(importerLayer)) {
        const importedLayer = getLayerForFile(resolvedImport, config);
        if (importedLayer !== importerLayer) {
          violations.push({
            kind: 'leaf',
            importer,
            importerLayer,
            specifier,
            imported: resolvedImport,
            importedLayer,
          });
        }
      }
    }
  }

  return violations;
}
