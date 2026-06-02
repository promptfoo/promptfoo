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
   * Layers this layer must NOT depend on, even transitionally. Used to lock a
   * cross-layer pair once its cycle has been fully broken so it cannot regress.
   * Entries must be known layer names and must not also appear in
   * `allowedDependencies`.
   */
  forbiddenDependencies?: string[];
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
  /**
   * Target topological order, listed most-depended-upon first (the intended
   * DAG bottom-to-top). A cross-layer edge from an earlier entry to a later one
   * is a cycle-causing "back edge". When defined, every configured layer must
   * appear exactly once so the back-edge report cannot silently omit a layer.
   */
  tierOrder?: string[];
  /**
   * Ratchet for the largest strongly-connected component (dependency cycle) in
   * the layer graph. The checker fails if the real graph exceeds this size, so
   * the value can only be lowered over time (8 today, 1 == a DAG).
   */
  maxStronglyConnectedComponentSize?: number;
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

function validateTierOrder(tierOrder: LayerConfig['tierOrder'], layerNames: Set<string>): void {
  if (tierOrder === undefined) {
    return;
  }
  if (!Array.isArray(tierOrder)) {
    throw new Error('Architecture tierOrder must be an array of layer names.');
  }
  const seen = new Set<string>();
  for (const layerName of tierOrder) {
    if (typeof layerName !== 'string' || !layerNames.has(layerName)) {
      throw new Error(`Architecture tierOrder contains unknown layer "${String(layerName)}".`);
    }
    if (seen.has(layerName)) {
      throw new Error(`Architecture tierOrder lists layer "${layerName}" more than once.`);
    }
    seen.add(layerName);
  }
  if (seen.size !== layerNames.size) {
    const missingLayers = [...layerNames].filter((layerName) => !seen.has(layerName)).sort();
    throw new Error(
      `Architecture tierOrder must list every layer. Missing: ${missingLayers.join(', ')}.`,
    );
  }
}

function validateMaxStronglyConnectedComponentSize(max: number | undefined): void {
  if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max) || max < 1)) {
    throw new Error('Architecture maxStronglyConnectedComponentSize must be a positive integer.');
  }
}

function validateForbiddenDependencies(layers: LayerDefinition[], layerNames: Set<string>): void {
  for (const layer of layers) {
    if (layer.forbiddenDependencies !== undefined && !Array.isArray(layer.forbiddenDependencies)) {
      throw new Error(
        `Architecture layer "${layer.name}" forbiddenDependencies must be an array of layer names.`,
      );
    }
    for (const forbidden of layer.forbiddenDependencies ?? []) {
      if (typeof forbidden !== 'string' || !layerNames.has(forbidden)) {
        throw new Error(
          `Architecture layer "${layer.name}" forbids unknown dependency "${String(forbidden)}".`,
        );
      }
      if (layer.allowedDependencies.includes(forbidden)) {
        throw new Error(
          `Architecture layer "${layer.name}" both allows and forbids dependency "${forbidden}".`,
        );
      }
    }
  }
}

function validateDagPolicy(config: LayerConfig, layerNames: Set<string>): void {
  validateTierOrder(config.tierOrder, layerNames);
  validateMaxStronglyConnectedComponentSize(config.maxStronglyConnectedComponentSize);
  validateForbiddenDependencies(config.layers, layerNames);
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
  validateDagPolicy(config, layerNames);

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

/**
 * The bare module name a specifier resolves to: its package root (`@scope/pkg`) or builtin name,
 * with any `node:` prefix stripped. Returns undefined for relative/absolute/`#` subpath specifiers,
 * which are not external dependencies. Unlike {@link getPackageName} this also names Node builtins,
 * so a leaf-layer external check cannot let `node:fs` slip through.
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

/** The npm package name a specifier imports, or undefined for relative imports and Node builtins. */
export function getPackageName(specifier: string): string | undefined {
  const moduleName = getExternalModuleName(specifier);
  return moduleName && !BUILTIN_MODULES.has(moduleName) ? moduleName : undefined;
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

export interface CrossLayerEdge {
  from: string;
  to: string;
  /** Number of import statements crossing from `from` to `to`. */
  count: number;
  /** Distinct importer files behind the edge, sorted. */
  files: string[];
}

/**
 * Tallies the directed cross-layer import edges across the source tree. Each
 * edge is an (importerLayer -> importedLayer) pair with the number of import
 * statements and the distinct importer files behind it. The public facade file
 * is skipped as an importer (it intentionally re-exports every layer);
 * same-layer and unresolved/external imports are ignored. Pure function aside
 * from the source reads, so it can be unit-tested against fixture trees.
 */
export function computeCrossLayerEdges(repoRoot: string, config: LayerConfig): CrossLayerEdge[] {
  const publicFacade = normalizePath(config.publicFacade);
  const tallies = new Map<string, { count: number; files: Set<string> }>();

  for (const importer of getSourceFiles(repoRoot, true, config.ignoredRoots)) {
    if (normalizePath(importer) === publicFacade) {
      continue;
    }

    const importerLayer = getLayerForFile(importer, config);
    const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');

    for (const specifier of extractModuleSpecifiers(sourceText, importer)) {
      const resolvedImport = resolveInternalModule(repoRoot, importer, specifier, config.aliases);
      if (!resolvedImport) {
        continue;
      }

      const importedLayer = getLayerForFile(resolvedImport, config);
      if (importedLayer === importerLayer) {
        continue;
      }

      const key = edgeKey(importerLayer, importedLayer);
      const tally = tallies.get(key) ?? { count: 0, files: new Set<string>() };
      tally.count += 1;
      tally.files.add(importer);
      tallies.set(key, tally);
    }
  }

  return [...tallies.entries()]
    .map(([key, tally]) => {
      const [from, to] = key.split(EDGE_SEPARATOR);
      return { from, to, count: tally.count, files: [...tally.files].sort() };
    })
    .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}

/**
 * Computes the strongly-connected components of the layer dependency graph
 * (Tarjan's algorithm). Every configured layer is a node, so singletons are
 * included; a component with more than one layer is a dependency cycle.
 * Components are returned with their layers sorted, ordered by descending size.
 */
export function computeStronglyConnectedComponents(
  config: LayerConfig,
  edges: CrossLayerEdge[],
): string[][] {
  const nodes = config.layers.map((layer) => layer.name);
  const adjacency = new Map<string, string[]>(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from)!.push(edge.to);
    }
  }

  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const strongConnect = (node: string): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(next)!));
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(next)!));
      }
    }

    if (lowLinks.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component.sort());
    }
  };

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return components.sort((left, right) => right.length - left.length);
}

/**
 * Given a target topological order (`tierOrder`, most-depended-upon first),
 * returns the cross-layer edges that violate it — a lower-tier layer importing
 * a higher-tier layer. These are the cycle-causing "back edges" to eliminate on
 * the way to a DAG. Edges touching a layer absent from `tierOrder` are ignored.
 */
export function findBackEdges(edges: CrossLayerEdge[], tierOrder: string[]): CrossLayerEdge[] {
  const rank = new Map(tierOrder.map((layer, index) => [layer, index]));
  return edges.filter((edge) => {
    const fromRank = rank.get(edge.from);
    const toRank = rank.get(edge.to);
    return fromRank !== undefined && toRank !== undefined && fromRank < toRank;
  });
}

export interface ForbiddenDependencyViolation {
  from: string;
  to: string;
  path: CrossLayerEdge[];
}

function findDependencyPath(
  edgesByFrom: Map<string, CrossLayerEdge[]>,
  from: string,
  to: string,
): CrossLayerEdge[] | undefined {
  const queue: Array<{ layer: string; path: CrossLayerEdge[] }> = [{ layer: from, path: [] }];
  const visited = new Set([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edgesByFrom.get(current.layer) ?? []) {
      const path = [...current.path, edge];
      if (edge.to === to) {
        return path;
      }
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ layer: edge.to, path });
      }
    }
  }

  return undefined;
}

/**
 * Returns direct or transitive dependency paths that violate an explicit
 * `forbiddenDependencies` lock.
 */
export function findForbiddenDependencyViolations(
  config: LayerConfig,
  edges: CrossLayerEdge[],
): ForbiddenDependencyViolation[] {
  const edgesByFrom = new Map<string, CrossLayerEdge[]>();
  for (const edge of edges) {
    const outgoing = edgesByFrom.get(edge.from) ?? [];
    outgoing.push(edge);
    edgesByFrom.set(edge.from, outgoing);
  }
  for (const outgoing of edgesByFrom.values()) {
    outgoing.sort((left, right) => left.to.localeCompare(right.to));
  }

  const violations: ForbiddenDependencyViolation[] = [];
  for (const layer of config.layers) {
    for (const forbidden of layer.forbiddenDependencies ?? []) {
      const path = findDependencyPath(edgesByFrom, layer.name, forbidden);
      if (path !== undefined) {
        violations.push({ from: layer.name, to: forbidden, path });
      }
    }
  }
  return violations;
}

export type EdgeBaseline = Record<string, number>;

const EDGE_SEPARATOR = ' -> ';

export function edgeKey(from: string, to: string): string {
  return `${from}${EDGE_SEPARATOR}${to}`;
}

/** Builds a baseline mapping each cross-layer edge to its current import count. */
export function buildEdgeBaseline(edges: CrossLayerEdge[]): EdgeBaseline {
  const baseline: EdgeBaseline = {};
  for (const edge of edges
    .slice()
    .sort((left, right) =>
      edgeKey(left.from, left.to).localeCompare(edgeKey(right.from, right.to)),
    )) {
    baseline[edgeKey(edge.from, edge.to)] = edge.count;
  }
  return baseline;
}

export interface EdgeBaselineComparison {
  /** Edges whose import count exceeds the baseline (or are entirely new). */
  regressions: Array<{ from: string; to: string; count: number; allowed: number }>;
  /** Edges whose count dropped below the baseline (baseline can be lowered). */
  improvements: Array<{ from: string; to: string; count: number; allowed: number }>;
}

/**
 * Compares the live cross-layer edges against a committed baseline. Any edge
 * whose count exceeds its baseline (including a brand-new edge, baseline 0) is
 * a regression; any edge that shrank — or disappeared — is an improvement that
 * the baseline can be lowered to capture.
 */
export function compareEdgesToBaseline(
  edges: CrossLayerEdge[],
  baseline: EdgeBaseline,
): EdgeBaselineComparison {
  const regressions: EdgeBaselineComparison['regressions'] = [];
  const improvements: EdgeBaselineComparison['improvements'] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const key = edgeKey(edge.from, edge.to);
    seen.add(key);
    const allowed = baseline[key] ?? 0;
    if (edge.count > allowed) {
      regressions.push({ from: edge.from, to: edge.to, count: edge.count, allowed });
    } else if (edge.count < allowed) {
      improvements.push({ from: edge.from, to: edge.to, count: edge.count, allowed });
    }
  }

  for (const key of Object.keys(baseline)) {
    if (!seen.has(key) && baseline[key] > 0) {
      const [from, to] = key.split(EDGE_SEPARATOR);
      improvements.push({ from, to, count: 0, allowed: baseline[key] });
    }
  }

  return { regressions, improvements };
}

/** Reads and validates the committed cross-layer edge baseline, or an empty baseline if absent. */
export function readEdgeBaseline(repoRoot: string, config: LayerConfig): EdgeBaseline {
  const baselinePath = path.join(repoRoot, 'architecture/edge-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    return {};
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as unknown;
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error(`${baselinePath} must contain an object mapping layer edges to import counts.`);
  }

  const layerNames = new Set(config.layers.map((layer) => layer.name));
  for (const [key, count] of Object.entries(baseline)) {
    const parts = key.split(EDGE_SEPARATOR);
    if (
      parts.length !== 2 ||
      parts.some((layerName) => layerName.length === 0 || !layerNames.has(layerName))
    ) {
      throw new Error(`${baselinePath} contains invalid edge "${key}".`);
    }
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new Error(`${baselinePath} contains invalid import count for edge "${key}".`);
    }
  }

  return baseline as EdgeBaseline;
}
