import { boundedIdentityString } from './identity';
import { resolveLimits, WorkBudget } from './limits';
import { nativeCacheStatus, nativeSourceStatus } from './native';
import { isRecord, own } from './values';

import type {
  ContextInventory,
  InspectionCode,
  InspectionDiagnostic,
  InspectionRowState,
  InspectionStatusCounts,
  NativeInspection,
  VariantInventory,
} from './inspectionTypes';
import type { AnalysisLimits } from './types';

interface VariantState {
  inventory: VariantInventory;
  repeats: Set<number>;
  slots: Set<number>;
  groups: Set<string>;
}
interface ContextState {
  inventory: ContextInventory;
  variants: Map<string, VariantState>;
  promptIds: Set<string>;
  groupIdentities: Map<string, string>;
}
const DIAGNOSTIC_SAMPLE_LIMIT = 20;

function counters(): InspectionStatusCounts {
  return {
    passed: 0,
    assertionFailed: 0,
    executionFailed: 0,
    unknown: 0,
    cached: 0,
    fresh: 0,
    cacheUnknown: 0,
  };
}
function addStatus(counts: InspectionStatusCounts, state: InspectionRowState): void {
  switch (state.sourceStatus) {
    case 'passed':
      counts.passed += 1;
      break;
    case 'assertion-failed':
      counts.assertionFailed += 1;
      break;
    case 'execution-failed':
      counts.executionFailed += 1;
      break;
    case 'unknown':
      counts.unknown += 1;
      break;
  }
  switch (state.cache) {
    case 'cached':
      counts.cached += 1;
      break;
    case 'fresh':
      counts.fresh += 1;
      break;
    case 'unknown':
      counts.cacheUnknown += 1;
      break;
  }
}
function rowState(row: unknown): InspectionRowState {
  const response = own(row, 'response');
  const output = own(response, 'output');
  return {
    sourceStatus: nativeSourceStatus(row, response),
    cache: nativeCacheStatus(response),
    output:
      output === undefined ? 'absent' : output === '[output stripped]' ? 'stripped' : 'present',
  };
}
class Diagnostics {
  private readonly values = new Map<InspectionCode, InspectionDiagnostic>();
  add(code: InspectionCode, rowIndex: number): void {
    let diagnostic = this.values.get(code);
    if (!diagnostic) {
      diagnostic = { code, count: 0, rowIndices: [], omittedRowIndices: 0 };
      this.values.set(code, diagnostic);
    }
    diagnostic.count += 1;
    if (diagnostic.rowIndices.length < DIAGNOSTIC_SAMPLE_LIMIT) {
      diagnostic.rowIndices.push(rowIndex);
    } else {
      diagnostic.omittedRowIndices += 1;
    }
  }
  list(): InspectionDiagnostic[] {
    return [...this.values.values()].sort((left, right) => left.code.localeCompare(right.code));
  }
}
function newVariant(familyId: string, variantId: string): VariantState {
  return {
    inventory: {
      familyId,
      variantId,
      rows: 0,
      explicitRepeatIndices: [],
      rowsWithoutRepeatIndex: 0,
      repeatedSlots: 0,
      repeatGroupCount: 0,
      rowsWithoutRepeatGroup: 0,
      status: counters(),
      outputPresent: 0,
      outputStripped: 0,
      outputAbsent: 0,
    },
    repeats: new Set(),
    slots: new Set(),
    groups: new Set(),
  };
}
function inspectRepeat(
  row: unknown,
  rowIndex: number,
  variant: VariantState,
  context: ContextState,
  logical: string,
  diagnostics: Diagnostics,
  work: WorkBudget,
): void {
  const repeat = own(row, 'repeatIndex');
  let effectiveRepeat: number | undefined;
  if (repeat === undefined) {
    variant.inventory.rowsWithoutRepeatIndex += 1;
    // This is only the single-repeat analysis interpretation. Inspection never
    // claims that an omitted index establishes a multi-repeat slot.
    effectiveRepeat = 0;
  } else if (Number.isSafeInteger(repeat) && (repeat as number) >= 0) {
    effectiveRepeat = repeat as number;
    variant.repeats.add(effectiveRepeat);
  } else {
    diagnostics.add('invalid-repeat-index', rowIndex);
  }
  if (effectiveRepeat !== undefined) {
    if (variant.slots.has(effectiveRepeat)) {
      diagnostics.add('duplicate-slot', rowIndex);
      variant.inventory.repeatedSlots += 1;
    }
    variant.slots.add(effectiveRepeat);
  }
  const group = own(row, 'repeatGroupId');
  if (group === undefined) {
    variant.inventory.rowsWithoutRepeatGroup += 1;
    return;
  }
  if (!boundedIdentityString(group, 4096, work) || group.length === 0) {
    diagnostics.add('invalid-repeat-group', rowIndex);
    return;
  }
  if (variant.groups.size > 0 && !variant.groups.has(group)) {
    diagnostics.add('conflicting-repeat-group', rowIndex);
  }
  variant.groups.add(group);
  const previous = context.groupIdentities.get(group);
  if (previous !== undefined && previous !== logical) {
    diagnostics.add('conflicting-group-identity', rowIndex);
  } else {
    context.groupIdentities.set(group, logical);
  }
}
function inspectTaggedRow(
  row: unknown,
  rowIndex: number,
  context: ContextState,
  diagnostics: Diagnostics,
  work: WorkBudget,
): void {
  const identity = own(own(own(row, 'testCase'), 'metadata'), 'metamorphic');
  if (identity === undefined) {
    context.inventory.unidentifiedRows += 1;
    diagnostics.add('missing-identity', rowIndex);
    return;
  }
  const family = own(identity, 'familyId');
  const variantId = own(identity, 'variantId');
  if (
    !isRecord(identity) ||
    !boundedIdentityString(family, 128, work) ||
    family.length === 0 ||
    !boundedIdentityString(variantId, 128, work) ||
    variantId.length === 0
  ) {
    context.inventory.invalidRows += 1;
    diagnostics.add('invalid-identity', rowIndex);
    return;
  }
  context.inventory.taggedRows += 1;
  const logical = JSON.stringify([family, variantId]);
  let variant = context.variants.get(logical);
  if (!variant) {
    variant = newVariant(family, variantId);
    context.variants.set(logical, variant);
  }
  variant.inventory.rows += 1;
  const state = rowState(row);
  addStatus(variant.inventory.status, state);
  switch (state.output) {
    case 'present':
      variant.inventory.outputPresent += 1;
      break;
    case 'stripped':
      variant.inventory.outputStripped += 1;
      break;
    case 'absent':
      variant.inventory.outputAbsent += 1;
      break;
  }
  inspectRepeat(row, rowIndex, variant, context, logical, diagnostics, work);
}
function inspectPrompt(
  row: unknown,
  rowIndex: number,
  context: ContextState,
  diagnostics: Diagnostics,
  work: WorkBudget,
): void {
  const prompt = own(row, 'promptId');
  if (prompt === undefined) {
    return;
  }
  if (!boundedIdentityString(prompt, 4096, work)) {
    diagnostics.add('conflicting-prompt-identity', rowIndex);
    return;
  }
  if (context.promptIds.size > 0 && !context.promptIds.has(prompt)) {
    diagnostics.add('conflicting-prompt-identity', rowIndex);
  }
  context.promptIds.add(prompt);
}

/**
 * Inspect observed native identities before authoring a plan. This inventory
 * never infers expected coverage, valid transformations, or relation definitions.
 */
export function inspectNative(
  input: unknown,
  options: { includeContextSelectors?: boolean; limits?: Partial<AnalysisLimits> } = {},
): NativeInspection {
  if (
    options.includeContextSelectors !== undefined &&
    typeof options.includeContextSelectors !== 'boolean'
  ) {
    throw new Error('includeContextSelectors must be a boolean');
  }
  const limits = resolveLimits(options.limits);
  const work = new WorkBudget(limits.maxWork);
  const summary = own(input, 'results');
  const version = own(summary, 'version');
  const rows = own(summary, 'results');
  if ((version !== 2 && version !== 3) || !Array.isArray(rows)) {
    throw new Error('Expected native OutputFile.results with version 2 or 3 and flat results');
  }
  if (rows.length > limits.maxRows) {
    throw new Error('Native export exceeds the row limit');
  }
  const diagnostics = new Diagnostics();
  const contexts = new Map<string, ContextState>();
  for (let index = 0; index < rows.length; index++) {
    work.spend();
    const row = own(rows, String(index));
    if (!isRecord(row)) {
      diagnostics.add('invalid-row', index);
      continue;
    }
    const promptIdx = own(row, 'promptIdx');
    const provider = own(row, 'provider');
    const providerId = own(provider, 'id');
    const label = own(provider, 'label');
    if (
      !Number.isSafeInteger(promptIdx) ||
      (promptIdx as number) < 0 ||
      !boundedIdentityString(providerId, 4096, work) ||
      providerId.length === 0 ||
      (label !== undefined && !boundedIdentityString(label, 4096, work))
    ) {
      diagnostics.add('invalid-context', index);
      continue;
    }
    const key = JSON.stringify([promptIdx, providerId, label ?? null]);
    let context = contexts.get(key);
    if (!context) {
      if (contexts.size >= limits.maxObservations) {
        throw new Error('Native inventory exceeds the context limit');
      }
      context = {
        inventory: {
          index: contexts.size,
          promptIdx: promptIdx as number,
          providerLabelPresent: label !== undefined,
          rows: 0,
          taggedRows: 0,
          unidentifiedRows: 0,
          invalidRows: 0,
          status: counters(),
          variants: [],
          ...(options.includeContextSelectors === true
            ? {
                selector: {
                  promptIdx: promptIdx as number,
                  providerId,
                  ...(label === undefined ? {} : { providerLabel: label as string }),
                },
              }
            : {}),
        },
        variants: new Map(),
        promptIds: new Set(),
        groupIdentities: new Map(),
      };
      contexts.set(key, context);
    }
    context.inventory.rows += 1;
    const response = own(row, 'response');
    if (response !== undefined && !isRecord(response)) {
      context.inventory.invalidRows += 1;
      diagnostics.add('invalid-response', index);
      continue;
    }
    addStatus(context.inventory.status, rowState(row));
    inspectPrompt(row, index, context, diagnostics, work);
    inspectTaggedRow(row, index, context, diagnostics, work);
  }
  const inventory = [...contexts.values()].map((context) => {
    context.inventory.variants = [...context.variants.values()].map((variant) => ({
      ...variant.inventory,
      explicitRepeatIndices: [...variant.repeats].sort((left, right) => left - right),
      repeatGroupCount: variant.groups.size,
    }));
    return context.inventory;
  });
  return {
    version: 1,
    nativeSummaryVersion: version,
    includesContextSelectors: options.includeContextSelectors === true,
    rows: rows.length,
    contexts: inventory,
    diagnostics: diagnostics.list(),
    limitations: [
      'This is observed inventory, not expected coverage. Author a plan before deciding completeness.',
      'Context indices are local inventory ordinals; provide your own logical context IDs in the plan.',
      'Missing repeat indices are only interpreted as zero by single-repeat analysis plans.',
      'Native repeat groups are checked where provided; omitted group IDs cannot verify expanded-test identity.',
      'Selectors are omitted unless explicitly requested; when included they may expose private endpoint information.',
      'Family and variant labels remain visible. No outputs, prompts, variables, raw errors or native group IDs are included.',
    ],
  };
}
