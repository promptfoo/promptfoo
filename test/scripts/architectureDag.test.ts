import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildArchitectureReport,
  buildEdgeBaseline,
  type CrossLayerEdge,
  compareEdgesToBaseline,
  computeCrossLayerEdges,
  computeStronglyConnectedComponents,
  edgeKey,
  findBackEdges,
  findForbiddenDependencyViolations,
  type LayerConfig,
  readEdgeBaseline,
  readLayerConfig,
  scanArchitectureSources,
} from '../../scripts/architectureUtils';

function edge(from: string, to: string, count: number): CrossLayerEdge {
  return { from, to, count, files: [] };
}

function configWith(layers: LayerConfig['layers']): LayerConfig {
  return { publicFacade: 'src/index.ts', layers };
}

describe('computeCrossLayerEdges', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archdag-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = ''): void {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }

  it('reports facade reach, type-only cycles, deferred edges, and incomplete resolution without changing ratchets', () => {
    const config = configWith([
      { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
      { name: 'a', roots: ['src/a'], allowedDependencies: ['b'] },
      { name: 'b', roots: ['src/b'], allowedDependencies: ['a'] },
    ]);
    write('src/index.ts', "export * from './a/entry';");
    write(
      'src/a/entry.ts',
      "import type { B } from '../b/types'; import('./later'); import './missing'; require.resolve('./resolved'); import(target); import 'external';",
    );
    write('src/b/types.ts', "import type { A } from '../a/entry';");
    write('src/a/later.ts', "import './later';");
    write('src/a/resolved.ts');
    const ordinaryScan = scanArchitectureSources(repoRoot, config);
    const fullScan = scanArchitectureSources(repoRoot, config, { includeFacade: true });
    expect(computeCrossLayerEdges(repoRoot, config, fullScan)).toEqual(
      computeCrossLayerEdges(repoRoot, config, ordinaryScan),
    );
    const report = buildArchitectureReport(repoRoot, config, fullScan);
    expect(report.views.type.fileCycles).toEqual([['src/a/entry.ts', 'src/b/types.ts']]);
    expect(report.views.value.fileCycles).toEqual([['src/a/later.ts']]);
    expect(report.entrypoints['src/index.ts'].value.files).toEqual([
      'src/a/entry.ts',
      'src/index.ts',
    ]);
    expect(report.entrypoints['src/index.ts'].valueAndDeferred.files).toEqual([
      'src/a/entry.ts',
      'src/a/later.ts',
      'src/index.ts',
    ]);
    expect(report.entrypoints['src/index.ts'].combined.files).toHaveLength(5);
    expect(report.entrypoints['src/index.ts'].value.externalSpecifiers).toEqual(['external']);
    expect(report.unresolvedInternal).toEqual([
      expect.objectContaining({ importer: 'src/a/entry.ts', specifier: './missing', line: 1 }),
    ]);
    expect(report.computedReferences).toEqual([
      expect.objectContaining({ importer: 'src/a/entry.ts', kind: 'deferred', line: 1 }),
    ]);
    expect(() => buildArchitectureReport(repoRoot, config, fullScan, ['src/missing.ts'])).toThrow(
      'not in the checked source tree',
    );
  });

  it('surfaces reach that crosses ignored/declaration files and requires a facade-inclusive scan', () => {
    const config = {
      ...configWith([{ name: 'facade', roots: ['src'], allowedDependencies: [] }]),
      ignoredRoots: ['src/ignored'],
    };
    write('src/index.ts', "import './ignored/load'; import type { A } from './types.d.ts';");
    write('src/ignored/load.ts', "import 'hidden';");
    write('src/types.d.ts');
    const scan = scanArchitectureSources(repoRoot, config, { includeFacade: true });
    const report = buildArchitectureReport(repoRoot, config, scan);
    expect(report.unscannedInternal.map((reference) => reference.resolvedImport)).toEqual([
      'src/ignored/load.ts',
      'src/types.d.ts',
    ]);
    expect(report.entrypoints['src/index.ts'].value.unscannedInternal).toHaveLength(1);
    expect(() =>
      buildArchitectureReport(repoRoot, config, scanArchitectureSources(repoRoot, config)),
    ).toThrow('includeFacade: true');
  });

  it('runs the real JSON checker with clean stdout and preserves failure exit status', () => {
    const config = configWith([
      { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
      { name: 'a', roots: ['src/a'], allowedDependencies: ['b'] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
    ]);
    write('architecture/layers.json', JSON.stringify(config));
    write('architecture/edge-baseline.json', JSON.stringify({ 'a -> b': 1 }));
    write('src/index.ts', "export * from './a/entry';");
    write('src/a/entry.ts', "import '../b/entry';");
    write('src/b/entry.ts');
    for (const script of ['architectureUtils.ts', 'checkArchitectureBoundaries.ts']) {
      write(
        `scripts/${script}`,
        fs.readFileSync(path.join(process.cwd(), 'scripts', script), 'utf8'),
      );
    }
    write('package.json', JSON.stringify({ type: 'module' }));
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(repoRoot, 'node_modules'),
      'dir',
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          path.join(repoRoot, 'scripts/checkArchitectureBoundaries.ts'),
          '--json',
        ],
        { encoding: 'utf8', cwd: repoRoot },
      );
    const passing = run();
    expect(passing.status, passing.stderr).toBe(0);
    expect(JSON.parse(passing.stdout).views.combined.crossLayerReferences).toBe(1);
    expect(passing.stderr).toContain('Architecture boundaries passed.');
    write('src/a/entry.ts', "import '../b/entry'; export * from '../b/entry';");
    const failing = run();
    expect(failing.status, failing.stderr).toBe(1);
    expect(JSON.parse(failing.stdout).views.combined.crossLayerReferences).toBe(2);
    expect(failing.stderr).toContain('baseline regressions');
  });

  it('tallies cross-layer import edges and skips the facade importer and same-layer imports', () => {
    write(
      'architecture/layers.json',
      JSON.stringify({
        publicFacade: 'src/index.ts',
        leafLayers: ['contracts'],
        layers: [
          { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
          { name: 'app', roots: ['src/app'], allowedDependencies: ['core', 'contracts'] },
          { name: 'core', roots: ['src/core'], allowedDependencies: ['contracts'] },
          { name: 'contracts', roots: ['src/contracts'], allowedDependencies: [] },
        ],
      }),
    );
    write('src/index.ts', "export * from './core/b.js';"); // facade importer is skipped
    write('src/contracts/c.ts', 'export const c = 1;');
    write('src/core/b.ts', "import { c } from '../contracts/c.js';");
    write(
      'src/app/a.ts',
      "import { b } from '../core/b.js';\nimport { c } from '../contracts/c.js';",
    );
    write('src/app/a2.ts', "import { b } from '../core/b.js';"); // 2nd app->core importer

    const config = readLayerConfig(repoRoot);
    const sourceScan = scanArchitectureSources(repoRoot, config);
    const edges = computeCrossLayerEdges(repoRoot, config, sourceScan);

    expect(sourceScan.sourceFiles).toHaveLength(5);
    expect(edges).toEqual([
      { from: 'app', to: 'contracts', count: 1, files: ['src/app/a.ts'] },
      { from: 'app', to: 'core', count: 2, files: ['src/app/a.ts', 'src/app/a2.ts'] },
      { from: 'core', to: 'contracts', count: 1, files: ['src/core/b.ts'] },
    ]);
  });
});

describe('computeStronglyConnectedComponents', () => {
  it('returns a multi-layer component for a cycle and singletons otherwise, largest first', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: [] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
      { name: 'c', roots: ['src/c'], allowedDependencies: [] },
    ]);
    const edges = [edge('a', 'b', 1), edge('b', 'a', 1), edge('c', 'a', 1)];

    expect(computeStronglyConnectedComponents(config, edges)).toEqual([['a', 'b'], ['c']]);
  });

  it('reports every layer as its own component when the graph is a DAG', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: [] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
    ]);
    const components = computeStronglyConnectedComponents(config, [edge('a', 'b', 3)]);
    expect(components.every((component) => component.length === 1)).toBe(true);
  });
});

describe('findBackEdges', () => {
  it('flags edges from a lower tier to a higher tier (cycle-causing)', () => {
    const tierOrder = ['contracts', 'core', 'app'];
    const edges = [
      edge('app', 'core', 4), // high -> low: allowed
      edge('core', 'contracts', 2), // high -> low: allowed
      edge('contracts', 'core', 1), // low -> high: BACK
      edge('core', 'app', 3), // low -> high: BACK
      edge('app', 'unranked', 9), // touches a layer absent from tierOrder: ignored
    ];

    expect(findBackEdges(edges, tierOrder)).toEqual([
      edge('contracts', 'core', 1),
      edge('core', 'app', 3),
    ]);
  });
});

describe('edge baseline', () => {
  it('builds a baseline keyed by edge with import counts', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: [] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
      { name: 'c', roots: ['src/c'], allowedDependencies: [] },
    ]);

    expect(buildEdgeBaseline([edge('a', 'b', 2), edge('a', 'c', 5)], config)).toEqual({
      [edgeKey('a', 'b')]: 2,
      [edgeKey('a', 'c')]: 5,
    });
  });

  it('rejects edges that reference unclassified or unknown layers', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: [] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
    ]);

    expect(() => buildEdgeBaseline([edge('unclassified', 'a', 1)], config)).toThrow(
      'references an unknown layer',
    );
    expect(() => buildEdgeBaseline([edge('a', 'ghost', 1)], config)).toThrow(
      'references an unknown layer',
    );
  });

  it('reports grown/new edges as regressions and shrunk/removed edges as improvements', () => {
    const baseline = { [edgeKey('a', 'b')]: 5, [edgeKey('c', 'd')]: 2, [edgeKey('g', 'h')]: 3 };
    const edges = [
      edge('a', 'b', 6), // grew -> regression
      edge('c', 'd', 1), // shrank -> improvement
      edge('e', 'f', 1), // new edge (baseline 0) -> regression
    ];

    const { regressions, improvements } = compareEdgesToBaseline(edges, baseline);

    expect(regressions).toEqual([
      { from: 'a', to: 'b', count: 6, allowed: 5 },
      { from: 'e', to: 'f', count: 1, allowed: 0 },
    ]);
    expect(improvements).toEqual(
      expect.arrayContaining([
        { from: 'c', to: 'd', count: 1, allowed: 2 },
        { from: 'g', to: 'h', count: 0, allowed: 3 }, // disappeared entirely
      ]),
    );
    expect(improvements).toHaveLength(2);
  });

  it('treats an unchanged edge as neither a regression nor an improvement', () => {
    const result = compareEdgesToBaseline([edge('a', 'b', 4)], { [edgeKey('a', 'b')]: 4 });
    expect(result.regressions).toEqual([]);
    expect(result.improvements).toEqual([]);
  });
});

describe('readEdgeBaseline', () => {
  let repoRoot: string;
  const config = configWith([
    { name: 'a', roots: ['src/a'], allowedDependencies: [] },
    { name: 'b', roots: ['src/b'], allowedDependencies: [] },
  ]);

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archdag-baseline-'));
    fs.mkdirSync(path.join(repoRoot, 'architecture'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeBaseline(baseline: unknown): void {
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/edge-baseline.json'),
      JSON.stringify(baseline),
    );
  }

  it('accepts positive integer counts for known layer edges', () => {
    writeBaseline({ [edgeKey('a', 'b')]: 2 });
    expect(readEdgeBaseline(repoRoot, config)).toEqual({ [edgeKey('a', 'b')]: 2 });
  });

  it('rejects baseline edges that reference unknown layers', () => {
    writeBaseline({ [edgeKey('a', 'ghost')]: 2 });
    expect(() => readEdgeBaseline(repoRoot, config)).toThrow('contains invalid edge');
  });

  it('rejects non-positive or non-integer import counts', () => {
    writeBaseline({ [edgeKey('a', 'b')]: 0 });
    expect(() => readEdgeBaseline(repoRoot, config)).toThrow('contains invalid import count');

    writeBaseline({ [edgeKey('a', 'b')]: 1.5 });
    expect(() => readEdgeBaseline(repoRoot, config)).toThrow('contains invalid import count');
  });
});

describe('findForbiddenDependencyViolations', () => {
  it('flags direct dependencies that violate an explicit forbiddenDependencies lock', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: ['c'], forbiddenDependencies: ['b'] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
      { name: 'c', roots: ['src/c'], allowedDependencies: [] },
    ]);
    const edges = [edge('a', 'b', 1), edge('a', 'c', 3)];

    expect(findForbiddenDependencyViolations(config, edges)).toEqual([
      { from: 'a', to: 'b', path: [edge('a', 'b', 1)] },
    ]);
  });

  it('flags transitive dependencies that violate an explicit forbiddenDependencies lock', () => {
    const config = configWith([
      { name: 'a', roots: ['src/a'], allowedDependencies: ['c'], forbiddenDependencies: ['b'] },
      { name: 'b', roots: ['src/b'], allowedDependencies: [] },
      { name: 'c', roots: ['src/c'], allowedDependencies: ['b'] },
    ]);
    const edges = [edge('a', 'c', 3), edge('c', 'b', 2)];

    expect(findForbiddenDependencyViolations(config, edges)).toEqual([
      { from: 'a', to: 'b', path: [edge('a', 'c', 3), edge('c', 'b', 2)] },
    ]);
  });
});

describe('readLayerConfig DAG policy validation', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archdag-cfg-'));
    fs.mkdirSync(path.join(repoRoot, 'src/core'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'src/index.ts'), '');
    fs.writeFileSync(path.join(repoRoot, 'src/core/a.ts'), '');
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeConfig(extra: Record<string, unknown>): void {
    fs.mkdirSync(path.join(repoRoot, 'architecture'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/layers.json'),
      JSON.stringify({
        publicFacade: 'src/index.ts',
        layers: [
          { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
          { name: 'core', roots: ['src/core'], allowedDependencies: [] },
        ],
        ...extra,
      }),
    );
  }

  it('accepts a valid tierOrder, maxStronglyConnectedComponentSize, and forbiddenDependencies', () => {
    writeConfig({
      tierOrder: ['core', 'facade'],
      maxStronglyConnectedComponentSize: 1,
      layers: [
        {
          name: 'facade',
          roots: ['src/index.ts'],
          allowedDependencies: [],
          forbiddenDependencies: ['core'],
        },
        { name: 'core', roots: ['src/core'], allowedDependencies: [] },
      ],
    });
    expect(() => readLayerConfig(repoRoot)).not.toThrow();
  });

  it('rejects a tierOrder referencing an unknown layer', () => {
    writeConfig({ tierOrder: ['core', 'ghost'] });
    expect(() => readLayerConfig(repoRoot)).toThrow('tierOrder contains unknown layer "ghost"');
  });

  it('rejects a tierOrder that omits a configured layer', () => {
    writeConfig({ tierOrder: ['core'] });
    expect(() => readLayerConfig(repoRoot)).toThrow(
      'tierOrder must list every layer. Missing: facade',
    );
  });

  it('rejects a non-positive maxStronglyConnectedComponentSize', () => {
    writeConfig({ maxStronglyConnectedComponentSize: 0 });
    expect(() => readLayerConfig(repoRoot)).toThrow(
      'maxStronglyConnectedComponentSize must be a positive integer',
    );
  });

  it('rejects a layer that both allows and forbids the same dependency', () => {
    writeConfig({
      layers: [
        { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
        {
          name: 'core',
          roots: ['src/core'],
          allowedDependencies: ['facade'],
          forbiddenDependencies: ['facade'],
        },
      ],
    });
    expect(() => readLayerConfig(repoRoot)).toThrow('both allows and forbids dependency "facade"');
  });

  it('rejects a non-array forbiddenDependencies value', () => {
    writeConfig({
      layers: [
        { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
        {
          name: 'core',
          roots: ['src/core'],
          allowedDependencies: [],
          forbiddenDependencies: 'facade',
        },
      ],
    });
    expect(() => readLayerConfig(repoRoot)).toThrow(
      'forbiddenDependencies must be an array of layer names',
    );
  });
});
