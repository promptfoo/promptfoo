import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEdgeBaseline,
  computeCrossLayerEdges,
  readLayerConfig,
  scanArchitectureSources,
} from './architectureUtils';

/**
 * Regenerates architecture/edge-baseline.json from the current source tree.
 * The baseline records the import count for every cross-layer edge; the
 * architecture checker fails if any edge grows above its baseline or a new
 * cross-layer edge appears. Run this after intentionally reducing (or, with
 * justification, changing) cross-layer coupling so the ratchet captures the
 * new, lower numbers.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const sourceScan = scanArchitectureSources(repoRoot, config);
const edges = computeCrossLayerEdges(repoRoot, config, sourceScan);
const baseline = buildEdgeBaseline(edges, config);

const baselinePath = path.join(repoRoot, 'architecture/edge-baseline.json');
fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

const totalEdges = Object.keys(baseline).length;
const totalImports = Object.values(baseline).reduce((sum, count) => sum + count, 0);
console.log(
  `Wrote ${path.relative(repoRoot, baselinePath)} with ${totalEdges} cross-layer edges / ${totalImports} imports.`,
);
