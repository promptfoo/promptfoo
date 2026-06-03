import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareEdgesToBaseline,
  computeCrossLayerEdges,
  computeStronglyConnectedComponents,
  findBackEdges,
  findForbiddenDependencyViolations,
  findUnclassifiedFiles,
  findViolations,
  readEdgeBaseline,
  readLayerConfig,
  scanArchitectureSources,
} from './architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const sourceScan = scanArchitectureSources(repoRoot, config);
const violations = findViolations(repoRoot, config, sourceScan);

const facadeViolations = violations.filter((v) => v.kind === 'facade');
const leafViolations = violations.filter((v) => v.kind === 'leaf');
const leafExternalViolations = violations.filter((v) => v.kind === 'leaf-external');
const layerViolations = violations.filter((v) => v.kind === 'layer');
const pathViolations = violations.filter((v) => v.kind === 'path');
const unclassifiedFiles = findUnclassifiedFiles(repoRoot, config, sourceScan.sourceFiles);

if (facadeViolations.length > 0) {
  console.error('Architecture boundary violations found:');
  for (const violation of facadeViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports public facade via "${violation.specifier}"`,
    );
  }
  console.error(
    '\nInternal modules must import a narrower internal surface instead of src/index.ts.',
  );
}

if (leafViolations.length > 0) {
  console.error('Leaf-layer boundary violations found:');
  for (const violation of leafViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports ${violation.imported} (${violation.importedLayer}) via "${violation.specifier}"`,
    );
  }
  console.error('\nLeaf layers must not import other product layers.');
}

if (leafExternalViolations.length > 0) {
  console.error('Leaf-layer external dependency violations found:');
  for (const violation of leafExternalViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports external "${violation.specifier}"`,
    );
  }
  console.error(
    '\nLeaf layers may import only their allowlisted external packages (allowedExternal).',
  );
}

if (layerViolations.length > 0) {
  console.error('Layer dependency violations found:');
  for (const violation of layerViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports ${violation.imported} (${violation.importedLayer}) via "${violation.specifier}"`,
    );
  }
  console.error('\nLayers may import only their explicitly allowed dependencies.');
}

if (pathViolations.length > 0) {
  console.error('Restricted layer import violations found:');
  for (const violation of pathViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports ${violation.imported} (${violation.importedLayer}) via "${violation.specifier}"`,
    );
  }
  console.error('\nRestricted layers may import only their explicitly allowed internal paths.');
}

if (unclassifiedFiles.length > 0) {
  console.error('Unclassified source files found:');
  for (const sourceFile of unclassifiedFiles) {
    console.error(`- ${sourceFile}`);
  }
  console.error('\nEvery checked source file must belong to an explicit architecture layer.');
}

// ---- DAG progress checks (layer dependency graph) ----
const edges = computeCrossLayerEdges(repoRoot, config, sourceScan);

// 1. Strongly-connected-component ratchet: the largest dependency cycle may
//    only shrink over time (toward a DAG, where every component has size 1).
const components = computeStronglyConnectedComponents(config, edges);
const cycles = components.filter((component) => component.length > 1);
const largestCycle = cycles[0]?.length ?? 1;
let sccRatchetFailed = false;
if (config.maxStronglyConnectedComponentSize !== undefined) {
  if (largestCycle > config.maxStronglyConnectedComponentSize) {
    sccRatchetFailed = true;
    console.error(
      `Layer dependency cycle grew: largest strongly-connected component has ${largestCycle} layers, ` +
        `but maxStronglyConnectedComponentSize is ${config.maxStronglyConnectedComponentSize}.`,
    );
    for (const cycle of cycles) {
      console.error(`- cycle: {${cycle.join(', ')}}`);
    }
    console.error(
      '\nBreaking a cross-layer cycle should lower maxStronglyConnectedComponentSize in architecture/layers.json; new cycles are not allowed.',
    );
  } else if (largestCycle < config.maxStronglyConnectedComponentSize) {
    console.log(
      `Note: largest dependency cycle is now ${largestCycle} layers (ratchet is ${config.maxStronglyConnectedComponentSize}). ` +
        'Lower maxStronglyConnectedComponentSize in architecture/layers.json to lock in the progress.',
    );
  }
}

// 2. Per-edge baseline ratchet: no cross-layer edge may grow, and no new
//    cross-layer edge may appear, relative to architecture/edge-baseline.json.
const baseline = readEdgeBaseline(repoRoot, config);
const { regressions, improvements } = compareEdgesToBaseline(edges, baseline);
if (regressions.length > 0) {
  console.error('Cross-layer dependency baseline regressions found:');
  for (const regression of regressions) {
    const previously = regression.allowed === 0 ? 'new edge' : `was ${regression.allowed}`;
    console.error(
      `- ${regression.from} -> ${regression.to}: ${regression.count} imports (${previously})`,
    );
  }
  console.error(
    '\nNew or widened cross-layer dependencies are not allowed. Remove the import, or if it is intentional run `npm run architecture:baseline` and justify the change in review.',
  );
}
if (improvements.length > 0) {
  console.log(
    `Note: ${improvements.length} cross-layer edge(s) shrank below baseline. Run \`npm run architecture:baseline\` to lock in the reduction.`,
  );
}

// 3. Explicit forbidden-dependency locks (pairs whose cycle is fully broken).
const forbiddenDependencyViolations = findForbiddenDependencyViolations(config, edges);
if (forbiddenDependencyViolations.length > 0) {
  console.error('Forbidden cross-layer dependencies found:');
  for (const violation of forbiddenDependencyViolations) {
    const layerPath = [violation.from, ...violation.path.map((edge) => edge.to)].join(' -> ');
    console.error(`- ${violation.from} depends on ${violation.to} via ${layerPath} (forbidden)`);
    for (const edge of violation.path) {
      console.error(`    ${edge.from} -> ${edge.to}: ${edge.count} imports`);
      for (const file of edge.files) {
        console.error(`      ${file}`);
      }
    }
  }
  console.error(
    '\nThese layer pairs are locked acyclic via forbiddenDependencies and must not regress directly or transitively.',
  );
}

// 4. Informational: back-edges versus the target topological order.
if (config.tierOrder !== undefined) {
  const backEdges = findBackEdges(edges, config.tierOrder);
  if (backEdges.length > 0) {
    const totalBackImports = backEdges.reduce((sum, edge) => sum + edge.count, 0);
    console.log(
      `\nRemaining back-edges versus target order (${backEdges.length} edges / ${totalBackImports} imports to reach a DAG):`,
    );
    for (const edge of [...backEdges].sort((left, right) => left.count - right.count)) {
      console.log(`- ${edge.from} -> ${edge.to}: ${edge.count} imports`);
    }
  }
}

const dagChecksFailed =
  sccRatchetFailed || regressions.length > 0 || forbiddenDependencyViolations.length > 0;

if (violations.length > 0 || unclassifiedFiles.length > 0 || dagChecksFailed) {
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed.');
}
