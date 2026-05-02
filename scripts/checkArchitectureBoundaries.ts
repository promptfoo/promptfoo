import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractModuleSpecifiers,
  getLayerForFile,
  getSourceFiles,
  normalizePath,
  readLayerConfig,
  resolveRelativeModule,
} from './architectureUtils';

interface BoundaryViolation {
  importer: string;
  importerLayer: string;
  specifier: string;
}

interface LeafLayerViolation extends BoundaryViolation {
  imported: string;
  importedLayer: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const publicFacade = normalizePath(config.publicFacade);
const facadeViolations: BoundaryViolation[] = [];
const leafLayerViolations: LeafLayerViolation[] = [];
const leafLayers = new Set(config.leafLayers ?? []);

for (const importer of getSourceFiles(repoRoot)) {
  if (normalizePath(importer) === publicFacade) {
    continue;
  }

  const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');
  const importerLayer = getLayerForFile(importer, config);
  for (const specifier of extractModuleSpecifiers(sourceText, importer)) {
    const resolvedImport = resolveRelativeModule(repoRoot, importer, specifier);
    if (resolvedImport === publicFacade) {
      facadeViolations.push({
        importer,
        importerLayer,
        specifier,
      });
    }

    if (!resolvedImport || !leafLayers.has(importerLayer)) {
      continue;
    }

    const importedLayer = getLayerForFile(resolvedImport, config);
    if (importedLayer !== importerLayer) {
      leafLayerViolations.push({
        importer,
        importerLayer,
        imported: resolvedImport,
        importedLayer,
        specifier,
      });
    }
  }
}

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

if (leafLayerViolations.length > 0) {
  console.error('Leaf-layer boundary violations found:');
  for (const violation of leafLayerViolations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports ${violation.imported} (${violation.importedLayer}) via "${violation.specifier}"`,
    );
  }
  console.error('\nLeaf layers must not import other product layers.');
}

if (facadeViolations.length > 0 || leafLayerViolations.length > 0) {
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed.');
}
