import { parsePlan } from './plan';
import { markdownCell, TextBuilder } from './presentation';
import { serializeReport } from './serialize';

import type { AnalysisLimits, Relation, Selector } from './types';

interface SelectorDescription {
  source: Selector['source'];
  decode: Selector['decode'];
  pointer: string;
  normalizationOrder: Selector['normalize'];
}
interface RelationDescription {
  familyId: string;
  relationId: string;
  leftVariant: string;
  rightVariant: string;
  kind: Relation['kind'];
  requirement: string;
  leftSelection: SelectorDescription;
  rightSelection: SelectorDescription;
  checksAcrossContextsAndRepeats: number;
}
interface PlanSummary {
  version: 1;
  name: string;
  datasetRevision?: string;
  sourceAssertions: 'require-pass' | 'observe-output';
  repetitions: number;
  contextIds: string[];
  familyCount: number;
  expectedObservations: number;
  expectedChecks: number;
  expectedPanels: number;
  families: {
    id: string;
    variants: string[];
    relations: number;
    observationsPerContext: number;
    checksPerContext: number;
  }[];
  relations: RelationDescription[];
  interpretation: string[];
}
function requirement(relation: Relation): string {
  switch (relation.kind) {
    case 'equal':
      return 'Right and left are equal finite JSON values (object key order ignored).';
    case 'not-equal':
      return 'Right and left differ as finite JSON values (types preserved).';
    case 'nondecreasing':
      return 'Right is a number greater than or equal to left.';
    case 'nonincreasing':
      return 'Right is a number less than or equal to left.';
    case 'affine':
      return `Expected = left * ${relation.scale} + ${relation.offset}; abs(right - expected) <= ${relation.absoluteTolerance} + ${relation.relativeTolerance} * max(abs(expected), abs(right)). Every intermediate must be finite.`;
    case 'set-equal':
      return 'Left and right arrays contain the same unique JSON elements.';
    case 'subset':
      return 'Every unique element of the left array occurs in the right array.';
    case 'superset':
      return 'Every unique element of the right array occurs in the left array.';
    case 'disjoint':
      return 'Left and right arrays have no common JSON element.';
    case 'prefix':
      return 'The left array is an ordered prefix of the right array.';
    case 'subsequence':
      return 'The left array is an ordered subsequence of the right array.';
  }
}
function describeSelector(selector: Selector): SelectorDescription {
  return {
    source: selector.source,
    decode: selector.decode,
    pointer: selector.pointer,
    normalizationOrder: [...selector.normalize],
  };
}

/** Review the declared workload before any target calls or input files exist. */
export function summarizePlan(input: unknown, limits?: Partial<AnalysisLimits>): PlanSummary {
  const plan = parsePlan(input, limits);
  const multiplier = plan.contexts.length * plan.repetitions;
  const families = plan.families.map((family) => ({
    id: family.id,
    variants: [...family.variants],
    relations: family.relations.length,
    observationsPerContext: family.variants.length * plan.repetitions,
    checksPerContext: family.relations.length * plan.repetitions,
  }));
  const relations = plan.families.flatMap((family) =>
    family.relations.map((relation) => ({
      familyId: family.id,
      relationId: relation.id,
      leftVariant: relation.left,
      rightVariant: relation.right,
      kind: relation.kind,
      requirement: requirement(relation),
      leftSelection: describeSelector(relation.leftSelector),
      rightSelection: describeSelector(relation.rightSelector),
      checksAcrossContextsAndRepeats: multiplier,
    })),
  );
  return {
    version: 1,
    name: plan.name,
    ...(plan.datasetRevision ? { datasetRevision: plan.datasetRevision } : {}),
    sourceAssertions: plan.sourceAssertions,
    repetitions: plan.repetitions,
    contextIds: plan.contexts.map((context) => context.id),
    familyCount: families.length,
    expectedObservations:
      families.reduce((sum, family) => sum + family.observationsPerContext, 0) *
      plan.contexts.length,
    expectedChecks:
      families.reduce((sum, family) => sum + family.checksPerContext, 0) * plan.contexts.length,
    expectedPanels: families.length * plan.contexts.length,
    families,
    relations,
    interpretation: [
      'This validates the declared plan; it does not evaluate any observations or certify the input transformation.',
      'Every context has the same declared families, variants, and repetitions. Missing observations remain required.',
      'Decode precedes JSON pointer traversal; string normalization is applied afterward in the declared order.',
      'The overall verdict is fail before inconclusive before pass; source assertion policy applies separately.',
      'Exact provider selectors are intentionally omitted from this summary. Logical labels and selector pointers remain visible.',
    ],
  };
}
function selectionText(selector: SelectorDescription): string {
  const decode = selector.decode === 'json' ? ' → decode JSON' : '';
  const pointer = selector.pointer === '' ? '(root)' : selector.pointer;
  const normalization =
    selector.normalizationOrder.length > 0 ? ` → ${selector.normalizationOrder.join(' → ')}` : '';
  return `${selector.source}${decode} → ${pointer}${normalization}`;
}
export function renderPlanSummary(
  summary: PlanSummary,
  format: 'json' | 'markdown',
  maxBytes: number,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Plan summary output byte limit must be a positive integer');
  }
  if (format === 'json') {
    return serializeReport(summary, maxBytes);
  }
  const out = new TextBuilder(maxBytes);
  const cell = markdownCell;
  out.line(`# Metamorphic plan: ${cell(summary.name)}`);
  out.line();
  out.line(
    `Valid version 1 plan: ${summary.contextIds.length} contexts, ${summary.familyCount} families, ${summary.repetitions} repetitions.`,
  );
  out.line(
    `Expected observations: ${summary.expectedObservations}; expected relation checks: ${summary.expectedChecks}; context/family panels: ${summary.expectedPanels}.`,
  );
  out.line(`Source assertion policy: ${summary.sourceAssertions}.`);
  out.line();
  out.line('## Families');
  out.line();
  out.line('| Family | Variants | Relations | Observations per context | Checks per context |');
  out.line('| --- | --- | --- | --- | --- |');
  for (const family of summary.families) {
    out.line(
      `| ${cell(family.id)} | ${cell(family.variants.join(', '))} | ${family.relations} | ${family.observationsPerContext} | ${family.checksPerContext} |`,
    );
  }
  out.line();
  out.line('## Relation contracts');
  out.line();
  for (const relation of summary.relations) {
    out.line(`### ${cell(relation.familyId)} / ${cell(relation.relationId)}`);
    out.line();
    out.line(
      `Direction: ${cell(relation.leftVariant)} → ${cell(relation.rightVariant)}. Checks across contexts and repetitions: ${relation.checksAcrossContextsAndRepeats}.`,
    );
    out.line();
    out.line(`- Left selection: ${cell(selectionText(relation.leftSelection))}`);
    out.line(`- Right selection: ${cell(selectionText(relation.rightSelection))}`);
    out.line(`- Requirement: ${cell(relation.requirement)}`);
    out.line();
  }
  out.line('## Interpretation');
  out.line();
  for (const statement of summary.interpretation) {
    out.line(`- ${cell(statement)}`);
  }
  return out.finish();
}
