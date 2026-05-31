import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { globSync } from 'glob';
import ts from 'typescript';

export interface LayerDefinition {
  name: string;
  roots: string[];
  allowedDependencies: string[];
  allowedImportPaths?: string[];
  /**
   * Bare module specifiers (npm packages or Node builtins) a LEAF layer is allowed to import.
   * Only consulted for layers listed in {@link LayerConfig.leafLayers}: a leaf layer may import
   * relative siblings plus these externals, and nothing else. `node:` prefixes are ignored when
   * matching, so `"fs"` and `"node:fs"` are equivalent.
   */
  allowedExternal?: string[];
}

export interface LayerConfig {
  publicFacade: string;
  leafLayers?: string[];
  aliases?: Record<string, string>;
  ignoredRoots?: string[];
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

function validateLayerDefinition(
  repoRoot: string,
  configPath: string,
  layer: LayerDefinition,
): Array<{ layerName: string; root: string }> {
  if (typeof layer.name !== 'string' || layer.name.length === 0) {
    throw new Error(`${configPath} contains a layer without a name.`);
  }
  if (!Array.isArray(layer.roots) || layer.roots.length === 0) {
    throw new Error(`Architecture layer "${layer.name}" must declare roots.`);
  }
  if (!Array.isArray(layer.allowedDependencies)) {
    throw new Error(`Architecture layer "${layer.name}" must declare allowedDependencies.`);
  }
  if (
    layer.allowedImportPaths &&
    (!Array.isArray(layer.allowedImportPaths) ||
      layer.allowedImportPaths.some(
        (allowedImportPath) =>
          typeof allowedImportPath !== 'string' ||
          !fs.existsSync(path.join(repoRoot, allowedImportPath)) ||
          !fs.statSync(path.join(repoRoot, allowedImportPath)).isFile(),
      ))
  ) {
    throw new Error(
      `Architecture layer "${layer.name}" contains an invalid allowedImportPaths entry.`,
    );
  }
  if (
    layer.allowedExternal &&
    (!Array.isArray(layer.allowedExternal) ||
      layer.allowedExternal.some((entry) => typeof entry !== 'string' || entry.length === 0))
  ) {
    throw new Error(
      `Architecture layer "${layer.name}" contains an invalid allowedExternal entry.`,
    );
  }

  return layer.roots.map((root) => {
    if (typeof root !== 'string' || !fs.existsSync(path.join(repoRoot, root))) {
      throw new Error(`Architecture layer "${layer.name}" root "${String(root)}" does not exist.`);
    }
    return { layerName: layer.name, root };
  });
}

function validateDependencies(config: LayerConfig, layerNames: Set<string>): void {
  for (const layer of config.layers) {
    for (const allowedDependency of layer.allowedDependencies) {
      if (typeof allowedDependency !== 'string' || !layerNames.has(allowedDependency)) {
        throw new Error(
          `Architecture layer "${layer.name}" allows unknown dependency "${String(allowedDependency)}".`,
        );
      }
    }
  }
}

function validateAliases(repoRoot: string, aliases: Record<string, string> = {}): void {
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target !== 'string' || !fs.existsSync(path.join(repoRoot, target))) {
      throw new Error(`Architecture alias "${alias}" points to missing path "${String(target)}".`);
    }
  }
}

function validateRootsDoNotOverlap(
  configuredRoots: Array<{ layerName: string; root: string }>,
): void {
  for (let index = 0; index < configuredRoots.length; index++) {
    const root = configuredRoots[index];
    for (const otherRoot of configuredRoots.slice(index + 1)) {
      if (isWithinRoot(root.root, otherRoot.root) || isWithinRoot(otherRoot.root, root.root)) {
        throw new Error(
          `Architecture roots "${root.root}" (${root.layerName}) and "${otherRoot.root}" (${otherRoot.layerName}) overlap.`,
        );
      }
    }
  }
}

export function readLayerConfig(repoRoot: string): LayerConfig {
  const configPath = path.join(repoRoot, 'architecture/layers.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as LayerConfig;

  if (!config || typeof config !== 'object' || !Array.isArray(config.layers)) {
    throw new Error(`${configPath} must define a layers array.`);
  }
  if (
    typeof config.publicFacade !== 'string' ||
    !fs.existsSync(path.join(repoRoot, config.publicFacade))
  ) {
    throw new Error(`${configPath} must define an existing publicFacade path.`);
  }

  const layerNames = new Set<string>();
  const configuredRoots: Array<{ layerName: string; root: string }> = [];

  for (const layer of config.layers) {
    if (layerNames.has(layer.name)) {
      throw new Error(`${configPath} contains duplicate layer "${layer.name}".`);
    }
    layerNames.add(layer.name);
    configuredRoots.push(...validateLayerDefinition(repoRoot, configPath, layer));
  }

  validateDependencies(config, layerNames);
  validateAliases(repoRoot, config.aliases);
  validateRootsDoNotOverlap(configuredRoots);

  return config;
}

export function getSourceFiles(
  repoRoot: string,
  includeApp = true,
  ignoredRoots: string[] = [],
): string[] {
  return globSync('src/**/*.{ts,tsx,mts,cts}', {
    cwd: repoRoot,
    ignore: [
      'src/**/*.d.ts',
      'src/**/node_modules/**',
      ...(includeApp ? [] : ['src/app/**']),
      ...ignoredRoots.map((root) => `${normalizePath(root)}/**`),
    ],
    nodir: true,
  }).map(normalizePath);
}

function isWithinRoot(relativePath: string, root: string): boolean {
  const normalizedPath = normalizePath(relativePath);
  const normalizedRoot = normalizePath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function getLayerForFile(relativePath: string, config: LayerConfig): string {
  const normalizedPath = normalizePath(relativePath);
  for (const layer of config.layers) {
    if (layer.roots.some((root) => isWithinRoot(normalizedPath, root))) {
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

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
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
  aliases: Record<string, string> = {},
): string | undefined {
  const matchingAlias = Object.keys(aliases)
    .sort((left, right) => right.length - left.length)
    .find((alias) => specifier === alias || specifier.startsWith(`${alias}/`));
  const aliasedPath = matchingAlias
    ? `${aliases[matchingAlias]}${specifier.slice(matchingAlias.length)}`
    : undefined;

  if (
    !specifier.startsWith('.') &&
    specifier !== 'src' &&
    !specifier.startsWith('src/') &&
    !aliasedPath
  ) {
    return undefined;
  }

  let unresolvedPath: string;
  if (aliasedPath) {
    unresolvedPath = path.resolve(repoRoot, aliasedPath);
  } else if (specifier.startsWith('.')) {
    unresolvedPath = path.resolve(
      path.dirname(path.join(repoRoot, importerRelativePath)),
      specifier,
    );
  } else {
    unresolvedPath = path.resolve(repoRoot, specifier);
  }

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
      const relativeCandidate = normalizePath(path.relative(repoRoot, candidate));
      if (
        relativeCandidate.startsWith('src/') &&
        TYPESCRIPT_EXTENSIONS.includes(path.extname(relativeCandidate))
      ) {
        return relativeCandidate;
      }
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

/**
 * The bare module name a specifier resolves to for leaf-layer external-import checks. Unlike
 * {@link getPackageName} this also names Node builtins (with the `node:` prefix stripped), so a
 * leaf layer cannot silently pull in `node:fs`. Returns undefined for relative/absolute/`#` subpath
 * specifiers, which are not external dependencies.
 */
export function getExternalModuleName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) {
    return undefined;
  }

  const withoutNodePrefix = specifier.replace(/^node:/, '');
  const segments = withoutNodePrefix.split('/');
  const moduleName = withoutNodePrefix.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];

  return moduleName || undefined;
}

export type BoundaryViolationKind = 'facade' | 'layer' | 'leaf' | 'leaf-external' | 'path';

export interface BoundaryViolation {
  kind: BoundaryViolationKind;
  importer: string;
  importerLayer: string;
  specifier: string;
  /** Resolved import target. Set for every violation kind. */
  imported: string;
  /** Layer of the resolved import. Set for every violation kind. */
  importedLayer: string;
}

export function findUnclassifiedFiles(repoRoot: string, config: LayerConfig): string[] {
  return getSourceFiles(repoRoot, true, config.ignoredRoots).filter(
    (sourceFile) => getLayerForFile(sourceFile, config) === 'unclassified',
  );
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
  const layersByName = new Map(config.layers.map((layer) => [layer.name, layer]));
  const violations: BoundaryViolation[] = [];

  for (const importer of getSourceFiles(repoRoot, true, config.ignoredRoots)) {
    if (normalizePath(importer) === publicFacade) {
      continue;
    }

    const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');
    const importerLayer = getLayerForFile(importer, config);
    const importerIsLeaf = leafLayers.has(importerLayer);
    const allowedExternal = importerIsLeaf
      ? new Set(
          (layersByName.get(importerLayer)?.allowedExternal ?? []).map((entry) =>
            entry.replace(/^node:/, ''),
          ),
        )
      : null;

    for (const specifier of extractModuleSpecifiers(sourceText, importer)) {
      const resolvedImport = resolveInternalModule(repoRoot, importer, specifier, config.aliases);
      if (!resolvedImport) {
        // Not an internal module (internal relative / src-rooted / aliased imports resolve above).
        // A leaf layer may import only its allowlisted external packages and Node builtins; flag
        // any other bare specifier.
        if (importerIsLeaf) {
          const externalName = getExternalModuleName(specifier);
          if (externalName && !allowedExternal!.has(externalName)) {
            violations.push({
              kind: 'leaf-external',
              importer,
              importerLayer,
              specifier,
              imported: specifier,
              importedLayer: 'external',
            });
          }
        }
        continue;
      }

      const importedLayer = getLayerForFile(resolvedImport, config);

      if (resolvedImport === publicFacade) {
        violations.push({
          kind: 'facade',
          importer,
          importerLayer,
          specifier,
          imported: resolvedImport,
          importedLayer,
        });
      }

      if (leafLayers.has(importerLayer)) {
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

      const importerConfig = layersByName.get(importerLayer);
      const allowedLayerDependency =
        importedLayer === importerLayer ||
        (importerConfig?.allowedDependencies.includes(importedLayer) ?? false);

      if (
        importedLayer !== importerLayer &&
        resolvedImport !== publicFacade &&
        !leafLayers.has(importerLayer) &&
        importerConfig &&
        !allowedLayerDependency
      ) {
        violations.push({
          kind: 'layer',
          importer,
          importerLayer,
          specifier,
          imported: resolvedImport,
          importedLayer,
        });
      }

      if (
        importedLayer !== importerLayer &&
        allowedLayerDependency &&
        importerConfig?.allowedImportPaths &&
        !importerConfig.allowedImportPaths.includes(resolvedImport)
      ) {
        violations.push({
          kind: 'path',
          importer,
          importerLayer,
          specifier,
          imported: resolvedImport,
          importedLayer,
        });
      }
    }
  }

  return violations;
}
