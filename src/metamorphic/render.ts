import {
  type DetailOrder,
  observationPriority,
  selectDetails,
  verdictPriority,
} from './detailSelection';
import { markdownCell, TextBuilder, xml } from './presentation';
import { serializeReport } from './serialize';

import type {
  CheckResult,
  FamilyRun,
  MetamorphicReport,
  ObservationEvidence,
  Verdict,
} from './types';

export type ReportFormat = 'json' | 'markdown' | 'junit';
interface RenderOptions {
  maxDetails?: number;
  maxBytes?: number;
  detailOrder?: DetailOrder;
}
interface Presentation {
  checks: CheckResult[];
  familyRuns: FamilyRun[];
  omittedFamilyRuns: number;
  evidence: ObservationEvidence[];
  omittedChecks: number;
  omittedEvidence: number;
}
function options(input: RenderOptions): Required<RenderOptions> {
  const resolved = {
    maxDetails: input.maxDetails ?? 1000,
    maxBytes: input.maxBytes ?? 64 * 1024 * 1024,
    detailOrder: input.detailOrder ?? 'problems-first',
  };
  if (
    !Number.isSafeInteger(resolved.maxDetails) ||
    resolved.maxDetails < 0 ||
    !Number.isSafeInteger(resolved.maxBytes) ||
    resolved.maxBytes < 1
  ) {
    throw new Error('Report detail and byte limits must be valid integers');
  }
  return resolved;
}
function presentation(
  report: MetamorphicReport,
  maxDetails: number,
  order: DetailOrder,
): Presentation {
  const checks = selectDetails(report.checks, maxDetails, order, (item) =>
    verdictPriority(item.verdict),
  );
  const familyRuns = selectDetails(report.familyRuns, maxDetails, order, (item) =>
    verdictPriority(item.verdict),
  );
  const evidence = selectDetails(report.evidence, maxDetails, order, observationPriority);
  return {
    checks: checks.items,
    evidence: evidence.items,
    familyRuns: familyRuns.items,
    omittedChecks: checks.omitted,
    omittedEvidence: evidence.omitted,
    omittedFamilyRuns: familyRuns.omitted,
  };
}
function renderMarkdown(
  report: MetamorphicReport,
  selected: Presentation,
  maxBytes: number,
): string {
  const out = new TextBuilder(maxBytes);
  const cell = markdownCell;
  out.line(`# Metamorphic evaluation: ${cell(report.planName)}`);
  out.line();
  out.line(`**Verdict: ${report.verdict}**`);
  out.line();
  out.line(
    `Source assertion policy: ${report.sourceAssertions}. Native summary version: ${report.nativeSummaryVersion}.`,
  );
  if (report.datasetRevision) {
    out.line(`Dataset revision: ${cell(report.datasetRevision)}.`);
  }
  out.line(
    `Expected checks: ${report.totals.expected}; pass: ${report.totals.pass}; fail: ${report.totals.fail}; inconclusive: ${report.totals.inconclusive}.`,
  );
  out.line(
    `Expected observations: ${report.observations.expected}; present: ${report.observations.present}; missing: ${report.observations.missing}.`,
  );
  out.line(
    `Source assertions failed: ${report.observations.assertionFailed}; execution failed: ${report.observations.executionFailed}; status unknown: ${report.observations.unknown}.`,
  );
  out.line(
    `Input rows: ${report.input.rows}; selected: ${report.input.selectedRows}; outside panel: ${report.input.ignoredRows}; missing identity: ${report.input.unidentifiedRows}.`,
  );
  out.line(
    `Cache provenance: ${report.observations.cached} cached, ${report.observations.fresh} fresh, ${report.observations.cacheUnknown} unknown.`,
  );
  out.line();
  out.line('## Native identity provenance');
  out.line();
  out.line(
    `Among ${report.identityCoverage.presentObservations} present observations: ${report.identityCoverage.repeatIndexProvided} provide repeat indices, ${report.identityCoverage.repeatGroupProvided} provide expanded-test group IDs, and ${report.identityCoverage.promptIdProvided} provide prompt IDs.`,
  );
  out.line(
    'Omitted native identity fields do not establish identity consistency. Group IDs are checked where present, and are never included in this report.',
  );
  out.line();
  out.line('## Declared panels');
  out.line();
  out.line(
    '| Context | Family | Verdict | Present / expected observations | Pass | Fail | Inconclusive |',
  );
  out.line('| --- | --- | --- | --- | --- | --- | --- |');
  for (const panel of report.panels) {
    out.line(
      `| ${cell(panel.contextId)} | ${cell(panel.familyId)} | ${panel.verdict} | ${panel.observations.present} / ${panel.observations.expected} | ${panel.checks.pass} | ${panel.checks.fail} | ${panel.checks.inconclusive} |`,
    );
  }
  out.line();
  out.line('## Relation summaries');
  out.line();
  out.line(
    'Relation verdicts describe relations only; the overall verdict also applies the source assertion policy.',
  );
  out.line();
  out.line('| Context | Family | Relation | Verdict | Pass | Fail | Inconclusive |');
  out.line('| --- | --- | --- | --- | --- | --- | --- |');
  for (const relation of report.relations) {
    out.line(
      `| ${cell(relation.contextId)} | ${cell(relation.familyId)} | ${cell(relation.relationId)} | ${relation.verdict} | ${relation.checks.pass} | ${relation.checks.fail} | ${relation.checks.inconclusive} |`,
    );
  }
  out.line();
  out.line('## Joint family outcomes by repetition');
  out.line();
  out.line(
    `Expected family runs: ${report.runTotals.expected}; pass: ${report.runTotals.pass}; fail: ${report.runTotals.fail}; inconclusive: ${report.runTotals.inconclusive}.`,
  );
  out.line(
    'A family run passes only when all its declared relations and the source assertion policy pass in the same repetition. These are descriptive counts, not independent statistical samples.',
  );
  out.line();
  out.line(
    '| Context | Family | Repeat | Verdict | Present / expected observations | Pass | Fail | Inconclusive |',
  );
  out.line('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const run of selected.familyRuns) {
    out.line(
      `| ${cell(run.contextId)} | ${cell(run.familyId)} | ${run.repetition} | ${run.verdict} | ${run.observations.present} / ${run.observations.expected} | ${run.checks.pass} | ${run.checks.fail} | ${run.checks.inconclusive} |`,
    );
  }
  out.line();
  out.line(
    `Omitted family run details: ${selected.omittedFamilyRuns}. Joint outcome counts use all runs.`,
  );
  out.line();
  out.line('## Check details');
  out.line();
  out.line(
    '| Context | Family | Relation | Repeat | Direction | Verdict | Reason | Left selection | Right selection | Cardinality (left / right) |',
  );
  out.line('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const check of selected.checks) {
    const size = check.cardinality ? `${check.cardinality.left} / ${check.cardinality.right}` : '—';
    out.line(
      `| ${cell(check.contextId)} | ${cell(check.familyId)} | ${cell(check.relationId)} | ${check.repetition} | ${cell(check.left)} → ${cell(check.right)} | ${check.verdict} | ${check.reason} | ${check.selections.left.reason ?? 'available'} | ${check.selections.right.reason ?? 'available'} | ${size} |`,
    );
  }
  out.line();
  out.line('## Source observation details');
  out.line();
  out.line('| Context | Family | Variant | Repeat | Source status | Cache | Output availability |');
  out.line('| --- | --- | --- | --- | --- | --- | --- |');
  for (const observation of selected.evidence) {
    out.line(
      `| ${cell(observation.contextId)} | ${cell(observation.familyId)} | ${cell(observation.variantId)} | ${observation.repetition} | ${observation.sourceStatus} | ${observation.cache} | ${observation.outputAvailable ? 'available' : (observation.outputUnavailableReason ?? 'unavailable')} |`,
    );
  }
  out.line();
  out.line(
    `Omitted details: ${selected.omittedChecks} checks and ${selected.omittedEvidence} observations. All summaries and the verdict use the complete panel.`,
  );
  out.line(
    'Selected values are never embedded in Markdown or JUnit; use JSON with explicit value inclusion when needed.',
  );
  out.line();
  out.line('## Interpretation');
  out.line();
  for (const limitation of report.limitations) {
    out.line(`- ${cell(limitation)}`);
  }
  return out.finish();
}
interface JunitCase {
  name: string;
  className: string;
  verdict: Verdict;
  reason: string;
  incompletePanel?: boolean;
}
function sourceVerdict(
  observation: ObservationEvidence,
  policy: MetamorphicReport['sourceAssertions'],
): Verdict {
  if (observation.sourceStatus === 'passed') {
    return 'pass';
  }
  if (observation.sourceStatus === 'assertion-failed') {
    return policy === 'require-pass' ? 'fail' : 'pass';
  }
  return 'inconclusive';
}
function renderJunit(report: MetamorphicReport, selected: Presentation, maxBytes: number): string {
  // The first case is always present and preserves a failing/inconclusive full
  // panel decision when detail truncation would otherwise show only passes.
  const cases: JunitCase[] = [
    {
      name: 'complete declared panel',
      className: 'metamorphic.summary',
      verdict: report.verdict,
      incompletePanel: report.verdict === 'inconclusive',
      reason: `Full panel: ${report.totals.fail} failed, ${report.totals.inconclusive} inconclusive relations; ${report.observations.assertionFailed} source assertion failures (${report.sourceAssertions})`,
    },
  ];
  for (const check of selected.checks) {
    cases.push({
      name: JSON.stringify([check.contextId, check.familyId, check.relationId, check.repetition]),
      className: 'metamorphic.relation',
      verdict: check.verdict,
      reason: check.reason,
    });
  }
  for (const observation of selected.evidence) {
    cases.push({
      name: JSON.stringify([
        observation.contextId,
        observation.familyId,
        observation.variantId,
        observation.repetition,
      ]),
      className: 'metamorphic.source',
      verdict: sourceVerdict(observation, report.sourceAssertions),
      reason: observation.sourceStatus,
    });
  }
  const failed = cases.filter((item) => item.verdict === 'fail' || item.incompletePanel).length;
  const skipped = cases.filter(
    (item) => item.verdict === 'inconclusive' && !item.incompletePanel,
  ).length;
  const out = new TextBuilder(maxBytes);
  out.line('<?xml version="1.0" encoding="UTF-8"?>');
  out.line(
    `<testsuites tests="${cases.length}" failures="${failed}" skipped="${skipped}" errors="0">`,
  );
  out.line(
    `  <testsuite name="${xml(report.planName)}" tests="${cases.length}" failures="${failed}" skipped="${skipped}" errors="0">`,
  );
  out.line('    <properties>');
  for (const [key, value] of Object.entries({
    'metamorphic.verdict': report.verdict,
    'metamorphic.expectedChecks': report.totals.expected,
    'metamorphic.expectedFamilyRuns': report.runTotals.expected,
    'metamorphic.failedFamilyRuns': report.runTotals.fail,
    'metamorphic.inconclusiveFamilyRuns': report.runTotals.inconclusive,
    'metamorphic.expectedObservations': report.observations.expected,
    'metamorphic.repeatGroupsProvided': report.identityCoverage.repeatGroupProvided,
    'metamorphic.repeatIndicesProvided': report.identityCoverage.repeatIndexProvided,
    'metamorphic.promptIdentitiesProvided': report.identityCoverage.promptIdProvided,
    'metamorphic.omittedChecks': selected.omittedChecks,
    'metamorphic.omittedObservations': selected.omittedEvidence,
    'metamorphic.sourceAssertions': report.sourceAssertions,
  })) {
    out.line(`      <property name="${xml(key)}" value="${xml(value)}"/>`);
  }
  out.line('    </properties>');
  for (const item of cases) {
    out.line(`    <testcase name="${xml(item.name)}" classname="${xml(item.className)}">`);
    if (item.verdict === 'fail' || item.incompletePanel) {
      out.line(`      <failure message="${xml(item.reason)}"/>`);
    } else if (item.verdict === 'inconclusive') {
      out.line(`      <skipped message="${xml(item.reason)}"/>`);
    }
    out.line('    </testcase>');
  }
  out.line('  </testsuite>');
  out.line('</testsuites>');
  return out.finish();
}

export function renderReport(
  report: MetamorphicReport,
  format: ReportFormat,
  input: RenderOptions = {},
): string {
  const limits = options(input);
  const selected = presentation(report, limits.maxDetails, limits.detailOrder);
  if (format === 'markdown') {
    return renderMarkdown(report, selected, limits.maxBytes);
  }
  if (format === 'junit') {
    return renderJunit(report, selected, limits.maxBytes);
  }
  if (format !== 'json') {
    throw new Error('Unsupported metamorphic report format');
  }
  const artifact = {
    ...report,
    checks: selected.checks,
    familyRuns: selected.familyRuns,
    evidence: selected.evidence,
    presentation: {
      detailOrder: limits.detailOrder,
      omittedFamilyRuns: selected.omittedFamilyRuns,
      omittedChecks: selected.omittedChecks,
      omittedEvidence: selected.omittedEvidence,
    },
  };
  return serializeReport(artifact, limits.maxBytes);
}
