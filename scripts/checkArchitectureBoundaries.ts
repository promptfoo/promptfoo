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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readLayerConfig(repoRoot);
const publicFacade = normalizePath(config.publicFacade);
const violations: BoundaryViolation[] = [];

for (const importer of getSourceFiles(repoRoot)) {
  if (normalizePath(importer) === publicFacade) {
    continue;
  }

  const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');
  for (const specifier of extractModuleSpecifiers(sourceText, importer)) {
    const resolvedImport = resolveRelativeModule(repoRoot, importer, specifier);
    if (resolvedImport === publicFacade) {
      violations.push({
        importer,
        importerLayer: getLayerForFile(importer, config),
        specifier,
      });
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations found:');
  for (const violation of violations) {
    console.error(
      `- ${violation.importer} (${violation.importerLayer}) imports public facade via "${violation.specifier}"`,
    );
  }
  console.error(
    '\nInternal modules must import a narrower internal surface instead of src/index.ts.',
  );
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed.');
}
