import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computePackageReadinessReport } from './packageReadiness';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = computePackageReadinessReport(repoRoot);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const totals = report.architecture;
  console.log(
    `Architecture totals: ${totals.sourceFiles} source files; ` +
      `${totals.crossLayerEdges} cross-layer edges / ${totals.crossLayerImports} imports; ` +
      `${totals.backEdges} back-edges / ${totals.backEdgeImports} imports; ` +
      `largest SCC ${totals.largestStronglyConnectedComponent}.`,
  );
  console.log('\nPackage candidate runtime closures:');
  for (const candidate of report.candidates) {
    const externals = candidate.externalDependencies.join(', ') || '-';
    const builtins = candidate.nodeBuiltins.join(', ') || '-';
    console.log(
      `- ${candidate.name}: ${candidate.files.length}/${candidate.maxSourceFiles} files; ` +
        `externals ${externals}; builtins ${builtins}`,
    );
  }
}

if (report.violations.length > 0) {
  console.error('\nPackage-readiness budget violations found:');
  for (const violation of report.violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else if (!process.argv.includes('--json')) {
  console.log('\nPackage-readiness budgets passed.');
}
