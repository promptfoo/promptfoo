import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractModuleSpecifiers,
  getLayerForFile,
  getPackageName,
  getSourceFiles,
  readLayerConfig,
} from './architectureUtils';

interface DependencyUsage {
  files: Set<string>;
  layers: Set<string>;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as PackageJson;

const runtimeDependencies = new Map<string, Set<'dependency' | 'optional'>>();
for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
  runtimeDependencies.set(dependency, new Set(['dependency']));
}
for (const dependency of Object.keys(packageJson.optionalDependencies ?? {})) {
  const kinds = runtimeDependencies.get(dependency) ?? new Set<'dependency' | 'optional'>();
  kinds.add('optional');
  runtimeDependencies.set(dependency, kinds);
}

const usages = new Map<string, DependencyUsage>();
const undeclaredUsages = new Map<string, DependencyUsage>();

for (const sourceFile of getSourceFiles(repoRoot, false)) {
  const sourceText = fs.readFileSync(path.join(repoRoot, sourceFile), 'utf8');
  const layer = getLayerForFile(sourceFile, config);

  for (const specifier of extractModuleSpecifiers(sourceText, sourceFile)) {
    const packageName = getPackageName(specifier);
    if (!packageName) {
      continue;
    }

    const targetMap = runtimeDependencies.has(packageName) ? usages : undeclaredUsages;
    const usage = targetMap.get(packageName) ?? {
      files: new Set<string>(),
      layers: new Set<string>(),
    };
    usage.files.add(sourceFile);
    usage.layers.add(layer);
    targetMap.set(packageName, usage);
  }
}

const rows = [...runtimeDependencies.entries()]
  .map(([dependency, kinds]) => {
    const usage = usages.get(dependency);
    const layers = usage ? [...usage.layers].sort() : [];
    return {
      dependency,
      kind: [...kinds].sort().join('+'),
      owner: layers.length === 0 ? 'unreferenced' : layers.length === 1 ? layers[0] : 'shared',
      layers: layers.join(', ') || '-',
      files: usage?.files.size ?? 0,
    };
  })
  .sort((left, right) => left.dependency.localeCompare(right.dependency));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

console.log('| Dependency | Kind | Candidate owner | Direct layers | Source files |');
console.log('| --- | --- | --- | --- | ---: |');
for (const row of rows) {
  console.log(`| ${row.dependency} | ${row.kind} | ${row.owner} | ${row.layers} | ${row.files} |`);
}

if (undeclaredUsages.size > 0) {
  console.log('\nImported packages outside root runtime dependencies:');
  for (const [dependency, usage] of [...undeclaredUsages.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    console.log(`- ${dependency}: ${[...usage.layers].sort().join(', ')}`);
  }
}
