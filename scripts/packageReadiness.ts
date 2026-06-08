import fs from 'node:fs';
import path from 'node:path';

import {
  computeCrossLayerEdges,
  computeRuntimeDependencyClosure,
  computeStronglyConnectedComponents,
  extractRuntimeModuleSpecifiers,
  findBackEdges,
  getNodeBuiltinName,
  getPackageName,
  normalizePath,
  readLayerConfig,
  scanArchitectureSources,
} from './architectureUtils';

export type PackageArtifactFormat = 'esm' | 'cjs';

export interface PackageCandidateDefinition {
  name: string;
  entrypoint: string;
  packageSubpath?: string;
  artifacts?: Partial<Record<PackageArtifactFormat, string>>;
  allowedExternal: string[];
  allowedBuiltins: string[];
  maxSourceFiles: number;
  maxArtifactFiles?: number;
  maxArtifactBytes?: number;
}

export interface PackageCandidateConfig {
  candidates: PackageCandidateDefinition[];
}

type PackageExports = Record<string, unknown>;

export interface PackageCandidateReport extends PackageCandidateDefinition {
  files: string[];
  externalDependencies: string[];
  nodeBuiltins: string[];
  unresolvedInternalImports: string[];
  unexpectedExternal: string[];
  unexpectedBuiltins: string[];
  unusedAllowedExternal: string[];
  unusedAllowedBuiltins: string[];
}

export interface PackageArtifactClosure {
  entrypoint: string;
  files: string[];
  totalBytes: number;
  externalDependencies: string[];
  nodeBuiltins: string[];
  missingFiles: string[];
  outsidePackageImports: string[];
  unsupportedPackageImports: string[];
}

export interface PackageArtifactCandidateReport {
  name: string;
  formats: Partial<Record<PackageArtifactFormat, PackageArtifactClosure>>;
}

export interface PackageArtifactReadinessReport {
  candidates: PackageArtifactCandidateReport[];
  violations: string[];
}

export interface ArchitectureTotals {
  sourceFiles: number;
  crossLayerEdges: number;
  crossLayerImports: number;
  backEdges: number;
  backEdgeImports: number;
  largestStronglyConnectedComponent: number;
}

export interface PackageReadinessReport {
  architecture: ArchitectureTotals;
  candidates: PackageCandidateReport[];
  violations: string[];
}

function assertStringArray(value: unknown, field: string, candidateName: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(
      `Package candidate "${candidateName}" must declare unique strings in ${field}.`,
    );
  }
  return value;
}

function assertPositiveInteger(value: unknown, field: string, candidateName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Package candidate "${candidateName}" ${field} must be positive.`);
  }
  return value;
}

function validatePackageSubpath(
  candidate: PackageCandidateDefinition,
  packageSubpaths: Set<string>,
): string | undefined {
  const packageSubpath = candidate.packageSubpath;
  if (packageSubpath === undefined) {
    return undefined;
  }
  if (
    typeof packageSubpath !== 'string' ||
    packageSubpath.length === 0 ||
    packageSubpath.startsWith('.') ||
    packageSubpaths.has(packageSubpath)
  ) {
    throw new Error(
      `Package candidate "${candidate.name}" contains an invalid or duplicate packageSubpath.`,
    );
  }
  packageSubpaths.add(packageSubpath);
  return packageSubpath;
}

function validateArtifactConfig(
  candidate: PackageCandidateDefinition,
  packageSubpath: string | undefined,
): Pick<PackageCandidateDefinition, 'artifacts' | 'maxArtifactFiles' | 'maxArtifactBytes'> {
  const artifacts = candidate.artifacts;
  if (
    artifacts !== undefined &&
    (typeof artifacts !== 'object' ||
      Object.entries(artifacts).some(
        ([format, artifactPath]) =>
          !['esm', 'cjs'].includes(format) ||
          typeof artifactPath !== 'string' ||
          artifactPath.length === 0,
      ))
  ) {
    throw new Error(`Package candidate "${candidate.name}" contains invalid artifacts.`);
  }
  if (
    artifacts &&
    Object.values(artifacts).some(
      (artifactPath) =>
        path.isAbsolute(artifactPath) ||
        normalizePath(artifactPath)
          .split('/')
          .some((segment) => segment === '..'),
    )
  ) {
    throw new Error(
      `Package candidate "${candidate.name}" artifacts must stay inside the package.`,
    );
  }
  if (packageSubpath && (!artifacts?.esm || !artifacts.cjs)) {
    throw new Error(
      `Public package candidate "${candidate.name}" must declare ESM and CommonJS artifacts.`,
    );
  }
  if (!artifacts) {
    return {};
  }
  return {
    artifacts,
    maxArtifactFiles: assertPositiveInteger(
      candidate.maxArtifactFiles,
      'maxArtifactFiles',
      candidate.name,
    ),
    maxArtifactBytes: assertPositiveInteger(
      candidate.maxArtifactBytes,
      'maxArtifactBytes',
      candidate.name,
    ),
  };
}

function validatePackageCandidate(
  repoRoot: string,
  configPath: string,
  candidate: PackageCandidateDefinition,
  names: Set<string>,
  packageSubpaths: Set<string>,
): PackageCandidateDefinition {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`${configPath} contains an invalid package candidate.`);
  }
  if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
    throw new Error(`${configPath} contains a package candidate without a name.`);
  }
  if (names.has(candidate.name)) {
    throw new Error(`${configPath} contains duplicate package candidate "${candidate.name}".`);
  }
  names.add(candidate.name);

  if (typeof candidate.entrypoint !== 'string') {
    throw new Error(
      `Package candidate "${candidate.name}" entrypoint "${candidate.entrypoint}" does not exist.`,
    );
  }
  const entrypointPath = path.join(repoRoot, candidate.entrypoint);
  if (!fs.existsSync(entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
    throw new Error(
      `Package candidate "${candidate.name}" entrypoint "${candidate.entrypoint}" does not exist.`,
    );
  }
  const packageSubpath = validatePackageSubpath(candidate, packageSubpaths);

  return {
    name: candidate.name,
    entrypoint: candidate.entrypoint,
    ...(packageSubpath ? { packageSubpath } : {}),
    ...validateArtifactConfig(candidate, packageSubpath),
    allowedExternal: assertStringArray(
      candidate.allowedExternal,
      'allowedExternal',
      candidate.name,
    ),
    allowedBuiltins: assertStringArray(
      candidate.allowedBuiltins,
      'allowedBuiltins',
      candidate.name,
    ),
    maxSourceFiles: assertPositiveInteger(
      candidate.maxSourceFiles,
      'maxSourceFiles',
      candidate.name,
    ),
  };
}

export function readPackageCandidateConfig(repoRoot: string): PackageCandidateConfig {
  const configPath = path.join(repoRoot, 'architecture/package-candidates.json');
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PackageCandidateConfig>;
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error(`${configPath} must define a non-empty candidates array.`);
  }

  const names = new Set<string>();
  const packageSubpaths = new Set<string>();
  const candidates = parsed.candidates.map((candidate) =>
    validatePackageCandidate(repoRoot, configPath, candidate, names, packageSubpaths),
  );

  return { candidates };
}

export function getPackageCandidateSpecifier(
  candidate: PackageCandidateDefinition,
  packageName = 'promptfoo',
): string | undefined {
  return candidate.packageSubpath ? `${packageName}/${candidate.packageSubpath}` : undefined;
}

function isPackageExports(value: unknown): value is PackageExports {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function findPackageCandidateExportViolations(
  packageExports: unknown,
  candidates: PackageCandidateDefinition[],
): string[] {
  const exports = isPackageExports(packageExports) ? packageExports : {};
  const violations: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.packageSubpath || !candidate.artifacts) {
      continue;
    }

    const exportName = `./${candidate.packageSubpath}`;
    const packageExport = exports[exportName];
    if (!isPackageExports(packageExport)) {
      violations.push(`${candidate.name}: missing package export "${exportName}"`);
      continue;
    }

    const topLevelConditions = Object.keys(packageExport);
    if (JSON.stringify(topLevelConditions) !== JSON.stringify(['import', 'require'])) {
      violations.push(
        `${candidate.name}: package export conditions must be exactly import then require`,
      );
    }

    for (const [format, condition] of [
      ['esm', 'import'],
      ['cjs', 'require'],
    ] as const) {
      const conditionalExport = packageExport[condition];
      if (!isPackageExports(conditionalExport)) {
        violations.push(`${candidate.name}/${format}: missing ${condition} export conditions`);
        continue;
      }

      const conditions = Object.keys(conditionalExport);
      if (JSON.stringify(conditions) !== JSON.stringify(['types', 'default'])) {
        violations.push(
          `${candidate.name}/${format}: ${condition} conditions must be exactly types then default`,
        );
      }

      const typesTarget = conditionalExport.types;
      if (typeof typesTarget !== 'string' || !typesTarget.startsWith('./')) {
        violations.push(
          `${candidate.name}/${format}: ${condition} types target must be package-relative`,
        );
      }

      const expectedRuntimeTarget = `./${candidate.artifacts[format]}`;
      if (conditionalExport.default !== expectedRuntimeTarget) {
        violations.push(
          `${candidate.name}/${format}: ${condition} default target must be ${expectedRuntimeTarget}`,
        );
      }
    }
  }

  return violations;
}

export function resolvePackageArtifactPath(rootDir: string, artifactPath: string): string {
  const resolvedPath = path.resolve(rootDir, artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Package artifact does not exist: ${resolvedPath}`);
  }
  if (!fs.statSync(resolvedPath).isFile() || path.extname(resolvedPath) !== '.tgz') {
    throw new Error(`Package artifact must be a .tgz file: ${resolvedPath}`);
  }
  return resolvedPath;
}

function resolveArtifactImport(
  packageRoot: string,
  importer: string,
  specifier: string,
): { outsidePackage: boolean; relativePath?: string } | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const resolvedPackageRoot = path.resolve(packageRoot);
  const unresolvedPath = path.resolve(
    path.dirname(path.join(resolvedPackageRoot, importer)),
    specifier,
  );
  const unresolvedRelativePath = path.relative(resolvedPackageRoot, unresolvedPath);
  if (
    unresolvedRelativePath.startsWith(`..${path.sep}`) ||
    unresolvedRelativePath === '..' ||
    path.isAbsolute(unresolvedRelativePath)
  ) {
    return { outsidePackage: true };
  }

  const candidates = [
    unresolvedPath,
    ...(path.extname(importer) === '.cjs'
      ? ['.js', '.json', '.node'].map((extension) => `${unresolvedPath}${extension}`)
      : []),
    ...(path.extname(importer) === '.cjs'
      ? ['index.js', 'index.json', 'index.node'].map((indexFile) =>
          path.join(unresolvedPath, indexFile),
        )
      : []),
  ];
  const existingPath = candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  return {
    outsidePackage: false,
    relativePath: normalizePath(path.relative(resolvedPackageRoot, existingPath ?? unresolvedPath)),
  };
}

interface ArtifactClosureState {
  pending: string[];
  files: Set<string>;
  externalDependencies: Set<string>;
  nodeBuiltins: Set<string>;
  outsidePackageImports: Set<string>;
  unsupportedPackageImports: Set<string>;
}

function addArtifactSpecifier(
  packageRoot: string,
  artifactPath: string,
  specifier: string,
  state: ArtifactClosureState,
): void {
  const resolvedArtifact = resolveArtifactImport(packageRoot, artifactPath, specifier);
  if (resolvedArtifact?.outsidePackage) {
    state.outsidePackageImports.add(`${artifactPath}: ${specifier}`);
    return;
  }
  if (resolvedArtifact?.relativePath) {
    if (!state.files.has(resolvedArtifact.relativePath)) {
      state.pending.push(resolvedArtifact.relativePath);
    }
    return;
  }
  const builtinName = getNodeBuiltinName(specifier);
  if (builtinName) {
    state.nodeBuiltins.add(builtinName);
    return;
  }
  if (specifier.startsWith('#')) {
    state.unsupportedPackageImports.add(`${artifactPath}: ${specifier}`);
    return;
  }
  const packageName = getPackageName(specifier);
  if (packageName) {
    state.externalDependencies.add(packageName);
    return;
  }
  state.unsupportedPackageImports.add(`${artifactPath}: ${specifier || '<empty>'}`);
}

export function computePackageArtifactClosure(
  packageRoot: string,
  entrypoint: string,
): PackageArtifactClosure {
  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedEntrypoint = path.resolve(resolvedPackageRoot, entrypoint);
  const relativeEntrypoint = path.relative(resolvedPackageRoot, resolvedEntrypoint);
  if (
    relativeEntrypoint.startsWith(`..${path.sep}`) ||
    relativeEntrypoint === '..' ||
    path.isAbsolute(relativeEntrypoint)
  ) {
    throw new Error(`Package artifact entrypoint "${entrypoint}" escapes the package root.`);
  }
  const normalizedEntrypoint = normalizePath(relativeEntrypoint);
  const pending = [normalizedEntrypoint];
  const files = new Set<string>();
  const externalDependencies = new Set<string>();
  const nodeBuiltins = new Set<string>();
  const missingFiles = new Set<string>();
  const outsidePackageImports = new Set<string>();
  const unsupportedPackageImports = new Set<string>();
  const state: ArtifactClosureState = {
    pending,
    files,
    externalDependencies,
    nodeBuiltins,
    outsidePackageImports,
    unsupportedPackageImports,
  };
  let totalBytes = 0;

  while (pending.length > 0) {
    const artifactPath = pending.pop()!;
    if (files.has(artifactPath) || missingFiles.has(artifactPath)) {
      continue;
    }
    const absolutePath = path.join(packageRoot, artifactPath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      missingFiles.add(artifactPath);
      continue;
    }
    files.add(artifactPath);
    const sourceText = fs.readFileSync(absolutePath, 'utf8');
    totalBytes += Buffer.byteLength(sourceText);
    if (!/\.(?:c|m)?js$/.test(artifactPath)) {
      continue;
    }

    for (const specifier of extractRuntimeModuleSpecifiers(sourceText, artifactPath)) {
      addArtifactSpecifier(packageRoot, artifactPath, specifier, state);
    }
  }

  return {
    entrypoint: normalizedEntrypoint,
    files: [...files].sort(),
    totalBytes,
    externalDependencies: [...externalDependencies].sort(),
    nodeBuiltins: [...nodeBuiltins].sort(),
    missingFiles: [...missingFiles].sort(),
    outsidePackageImports: [...outsidePackageImports].sort(),
    unsupportedPackageImports: [...unsupportedPackageImports].sort(),
  };
}

function addArtifactResolutionViolations(
  candidateName: string,
  format: PackageArtifactFormat,
  closure: PackageArtifactClosure,
  violations: string[],
): void {
  if (closure.missingFiles.length > 0) {
    violations.push(
      `${candidateName}/${format}: missing artifact files: ${closure.missingFiles.join(', ')}`,
    );
  }
  if (closure.outsidePackageImports.length > 0) {
    violations.push(
      `${candidateName}/${format}: relative imports escape the package: ${closure.outsidePackageImports.join(', ')}`,
    );
  }
  if (closure.unsupportedPackageImports.length > 0) {
    violations.push(
      `${candidateName}/${format}: package imports cannot be resolved: ${closure.unsupportedPackageImports.join(', ')}`,
    );
  }
}

export function computePackageArtifactReadinessReport(
  packageRoot: string,
  candidates: PackageCandidateDefinition[],
): PackageArtifactReadinessReport {
  const violations: string[] = [];
  const reports = candidates.flatMap((candidate): PackageArtifactCandidateReport[] => {
    if (!candidate.artifacts) {
      return [];
    }
    const formats: PackageArtifactCandidateReport['formats'] = {};
    for (const [format, artifactPath] of Object.entries(candidate.artifacts) as Array<
      [PackageArtifactFormat, string]
    >) {
      const closure = computePackageArtifactClosure(packageRoot, artifactPath);
      formats[format] = closure;
      addArtifactResolutionViolations(candidate.name, format, closure, violations);
      if (
        candidate.maxArtifactFiles !== undefined &&
        closure.files.length > candidate.maxArtifactFiles
      ) {
        violations.push(
          `${candidate.name}/${format}: artifact closure has ${closure.files.length} files (max ${candidate.maxArtifactFiles})`,
        );
      }
      if (
        candidate.maxArtifactBytes !== undefined &&
        closure.totalBytes > candidate.maxArtifactBytes
      ) {
        violations.push(
          `${candidate.name}/${format}: artifact closure has ${closure.totalBytes} bytes (max ${candidate.maxArtifactBytes})`,
        );
      }
      const unexpectedExternal = closure.externalDependencies.filter(
        (dependency) => !candidate.allowedExternal.includes(dependency),
      );
      if (unexpectedExternal.length > 0) {
        violations.push(
          `${candidate.name}/${format}: unexpected external dependencies: ${unexpectedExternal.join(', ')}`,
        );
      }
      const unexpectedBuiltins = closure.nodeBuiltins.filter(
        (builtin) => !candidate.allowedBuiltins.includes(builtin),
      );
      if (unexpectedBuiltins.length > 0) {
        violations.push(
          `${candidate.name}/${format}: unexpected Node builtins: ${unexpectedBuiltins.join(', ')}`,
        );
      }
    }
    const esmClosure = formats.esm;
    const cjsClosure = formats.cjs;
    if (
      esmClosure &&
      cjsClosure &&
      (JSON.stringify(esmClosure.externalDependencies) !==
        JSON.stringify(cjsClosure.externalDependencies) ||
        JSON.stringify(esmClosure.nodeBuiltins) !== JSON.stringify(cjsClosure.nodeBuiltins))
    ) {
      violations.push(`${candidate.name}: ESM and CommonJS dependency closures differ`);
    }
    return [{ name: candidate.name, formats }];
  });
  return { candidates: reports, violations };
}

export function computePackageReadinessReport(repoRoot: string): PackageReadinessReport {
  const layerConfig = readLayerConfig(repoRoot);
  const sourceScan = scanArchitectureSources(repoRoot, layerConfig);
  const edges = computeCrossLayerEdges(repoRoot, layerConfig, sourceScan);
  const backEdges = layerConfig.tierOrder ? findBackEdges(edges, layerConfig.tierOrder) : [];
  const largestStronglyConnectedComponent =
    computeStronglyConnectedComponents(layerConfig, edges)[0]?.length ?? 1;
  const candidateConfig = readPackageCandidateConfig(repoRoot);
  const violations: string[] = [];

  const candidates = candidateConfig.candidates.map((candidate): PackageCandidateReport => {
    const closure = computeRuntimeDependencyClosure(
      repoRoot,
      candidate.entrypoint,
      layerConfig.aliases,
    );
    const allowedExternal = new Set(candidate.allowedExternal);
    const allowedBuiltins = new Set(candidate.allowedBuiltins);
    const unexpectedExternal = closure.externalDependencies.filter(
      (dependency) => !allowedExternal.has(dependency),
    );
    const unexpectedBuiltins = closure.nodeBuiltins.filter(
      (builtin) => !allowedBuiltins.has(builtin),
    );

    if (closure.files.length > candidate.maxSourceFiles) {
      violations.push(
        `${candidate.name}: runtime source closure has ${closure.files.length} files (max ${candidate.maxSourceFiles})`,
      );
    }
    if (unexpectedExternal.length > 0) {
      violations.push(
        `${candidate.name}: unexpected external dependencies: ${unexpectedExternal.join(', ')}`,
      );
    }
    if (unexpectedBuiltins.length > 0) {
      violations.push(
        `${candidate.name}: unexpected Node builtins: ${unexpectedBuiltins.join(', ')}`,
      );
    }
    if (closure.unresolvedInternalImports.length > 0) {
      violations.push(
        `${candidate.name}: unresolved internal runtime imports: ${closure.unresolvedInternalImports.join(', ')}`,
      );
    }

    return {
      ...candidate,
      ...closure,
      unexpectedExternal,
      unexpectedBuiltins,
      unusedAllowedExternal: candidate.allowedExternal.filter(
        (dependency) => !closure.externalDependencies.includes(dependency),
      ),
      unusedAllowedBuiltins: candidate.allowedBuiltins.filter(
        (builtin) => !closure.nodeBuiltins.includes(builtin),
      ),
    };
  });

  return {
    architecture: {
      sourceFiles: sourceScan.sourceFiles.length,
      crossLayerEdges: edges.length,
      crossLayerImports: edges.reduce((sum, edge) => sum + edge.count, 0),
      backEdges: backEdges.length,
      backEdgeImports: backEdges.reduce((sum, edge) => sum + edge.count, 0),
      largestStronglyConnectedComponent,
    },
    candidates,
    violations,
  };
}
