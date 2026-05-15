import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findViolations, readLayerConfig } from './architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const violations = findViolations(repoRoot, config);

const facadeViolations = violations.filter((v) => v.kind === 'facade');
const leafViolations = violations.filter((v) => v.kind === 'leaf');

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

if (violations.length > 0) {
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed.');
}
