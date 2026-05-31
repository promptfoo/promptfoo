import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findUnclassifiedFiles, findViolations, readLayerConfig } from './architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const violations = findViolations(repoRoot, config);

const facadeViolations = violations.filter((v) => v.kind === 'facade');
const leafViolations = violations.filter((v) => v.kind === 'leaf');
const layerViolations = violations.filter((v) => v.kind === 'layer');
const pathViolations = violations.filter((v) => v.kind === 'path');
const unclassifiedFiles = findUnclassifiedFiles(repoRoot, config);

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

if (violations.length > 0 || unclassifiedFiles.length > 0) {
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed.');
}
