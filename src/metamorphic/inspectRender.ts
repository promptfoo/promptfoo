import { markdownCell, TextBuilder } from './presentation';
import { serializeReport } from './serialize';

import type { InspectionCode, NativeInspection } from './inspectionTypes';

const guidance: Record<InspectionCode, string> = {
  'invalid-row': 'Each native result must be an object.',
  'invalid-context':
    'A context needs a nonnegative promptIdx, provider ID and optional string label.',
  'missing-identity': 'Add familyId and variantId under testCase.metadata.metamorphic.',
  'invalid-identity': 'Use nonempty family/variant strings of at most 128 characters.',
  'invalid-repeat-index':
    'Use a native nonnegative integer repeatIndex; do not reconstruct it from row order.',
  'invalid-repeat-group': 'A provided native repeatGroupId must be a nonempty string.',
  'duplicate-slot':
    'Expanded tests sharing one logical identity need distinct family or variant IDs.',
  'conflicting-repeat-group': 'One logical variant contains multiple expanded native tests.',
  'conflicting-group-identity': 'One expanded native test is assigned multiple logical identities.',
  'conflicting-prompt-identity':
    'One selected context contains inconsistent native prompt identities.',
  'invalid-response': 'A provided native response must be an object.',
};

/** Compact integer runs without inventing absent repetitions or expected counts. */
function indexRuns(values: number[]): string {
  if (values.length === 0) {
    return 'none';
  }
  const ranges: string[] = [];
  let start = values[0];
  let end = start;
  for (const value of values.slice(1)) {
    if (value === end + 1) {
      end = value;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    start = value;
    end = value;
  }
  ranges.push(start === end ? String(start) : `${start}–${end}`);
  return ranges.join(', ');
}

export function renderInspection(
  inventory: NativeInspection,
  format: 'json' | 'markdown',
  maxBytes: number,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Inventory output byte limit must be a positive integer');
  }
  if (format === 'json') {
    return serializeReport(inventory, maxBytes);
  }
  const out = new TextBuilder(maxBytes);
  const cell = markdownCell;
  out.line('# Native metamorphic inventory');
  out.line();
  out.line(
    `Observed rows: ${inventory.rows}; contexts: ${inventory.contexts.length}; native summary version: ${inventory.nativeSummaryVersion}.`,
  );
  out.line(
    'This inventory does not establish expected coverage or a passing eval. A separately authored plan is required.',
  );
  out.line();
  out.line('## Contexts');
  out.line();
  out.line(
    '| Inventory index | Prompt index | Label present | Rows | Tagged | Missing identity | Invalid | Passed source | Failed assertion | Execution failed | Unknown status |',
  );
  out.line('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const context of inventory.contexts) {
    out.line(
      `| ${context.index} | ${context.promptIdx} | ${context.providerLabelPresent} | ${context.rows} | ${context.taggedRows} | ${context.unidentifiedRows} | ${context.invalidRows} | ${context.status.passed} | ${context.status.assertionFailed} | ${context.status.executionFailed} | ${context.status.unknown} |`,
    );
  }
  if (inventory.includesContextSelectors) {
    out.line();
    out.line('## Exact selectors (explicitly disclosed)');
    out.line();
    out.line(
      'Provider IDs and labels may contain private endpoint information. An absent label differs from an empty string.',
    );
    out.line();
    out.line('| Inventory index | Provider ID | Provider label (JSON) |');
    out.line('| --- | --- | --- |');
    for (const context of inventory.contexts) {
      if (context.selector) {
        const label =
          context.selector.providerLabel === undefined
            ? '(absent)'
            : JSON.stringify(context.selector.providerLabel);
        out.line(`| ${context.index} | ${cell(context.selector.providerId)} | ${cell(label)} |`);
      }
    }
  }
  out.line();
  out.line('## Observed variants');
  out.line();
  out.line(
    '| Context index | Family | Variant | Rows | Explicit repeat indices | Unindexed rows | Duplicate slots | Native group count | Group identity omitted | Output present | Output stripped | Output absent |',
  );
  out.line('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const context of inventory.contexts) {
    for (const variant of context.variants) {
      out.line(
        `| ${context.index} | ${cell(variant.familyId)} | ${cell(variant.variantId)} | ${variant.rows} | ${indexRuns(variant.explicitRepeatIndices)} | ${variant.rowsWithoutRepeatIndex} | ${variant.repeatedSlots} | ${variant.repeatGroupCount} | ${variant.rowsWithoutRepeatGroup} | ${variant.outputPresent} | ${variant.outputStripped} | ${variant.outputAbsent} |`,
      );
    }
  }
  out.line();
  out.line('## Identity diagnostics');
  out.line();
  if (inventory.diagnostics.length === 0) {
    out.line(
      'No identity diagnostics were found in the observed rows. This does not establish completeness.',
    );
  } else {
    out.line('| Code | Occurrences | Input row offsets (sample) | Omitted offsets | Guidance |');
    out.line('| --- | --- | --- | --- | --- |');
    for (const diagnostic of inventory.diagnostics) {
      out.line(
        `| ${diagnostic.code} | ${diagnostic.count} | ${diagnostic.rowIndices.join(', ')} | ${diagnostic.omittedRowIndices} | ${cell(guidance[diagnostic.code])} |`,
      );
    }
  }
  out.line();
  out.line('## Interpretation');
  out.line();
  for (const limitation of inventory.limitations) {
    out.line(`- ${cell(limitation)}`);
  }
  return out.finish();
}
