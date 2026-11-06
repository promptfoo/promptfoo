/** Finite JSON is the only value domain used by deterministic relations. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type Verdict = 'pass' | 'fail' | 'inconclusive';
export type SourceStatus = 'passed' | 'assertion-failed' | 'execution-failed' | 'unknown';
export type CacheStatus = 'cached' | 'fresh' | 'unknown';
export type Normalizer = 'trim' | 'collapse-whitespace' | 'lowercase' | 'nfkc';
export interface Selector {
  source: 'output' | 'namedScores';
  pointer: string;
  decode: 'none' | 'json';
  normalize: Normalizer[];
}
export interface Context {
  id: string;
  promptIdx: number;
  providerId: string;
  providerLabel?: string;
}
interface RelationBase {
  id: string;
  left: string;
  right: string;
  leftSelector: Selector;
  rightSelector: Selector;
}
export type Relation = RelationBase &
  (
    | { kind: 'equal' | 'not-equal' }
    | {
        kind: 'affine';
        scale: number;
        offset: number;
        absoluteTolerance: number;
        relativeTolerance: number;
      }
    | { kind: 'nondecreasing' | 'nonincreasing' }
    | { kind: 'set-equal' | 'subset' | 'superset' | 'disjoint' }
    | { kind: 'prefix' | 'subsequence' }
  );
export interface Family {
  id: string;
  variants: string[];
  relations: Relation[];
}
export interface MetamorphicPlan {
  version: 1;
  name: string;
  datasetRevision?: string;
  repetitions: number;
  sourceAssertions: 'require-pass' | 'observe-output';
  contexts: Context[];
  families: Family[];
}
export interface AnalysisLimits {
  maxFileBytes: number;
  maxRows: number;
  maxObservations: number;
  maxChecks: number;
  maxValueBytes: number;
  maxValueNodes: number;
  maxDepth: number;
  maxArrayLength: number;
  maxWork: number;
}
export type UnavailableReason =
  | 'missing-observation'
  | 'execution-failed'
  | 'source-status-unknown'
  | 'output-missing'
  | 'output-stripped'
  | 'named-scores-missing'
  | 'invalid-json-output'
  | 'decode-requires-string'
  | 'pointer-missing'
  | 'normalization-requires-string'
  | 'value-type-mismatch'
  | 'numeric-overflow';
export type Selection =
  | { available: true; value: JsonValue }
  | { available: false; reason: UnavailableReason };
export interface IdentityProvenance {
  repeatIndexProvided: boolean;
  repeatGroupProvided: boolean;
  promptIdProvided: boolean;
}
export interface IdentityCoverage {
  presentObservations: number;
  repeatIndexProvided: number;
  repeatGroupProvided: number;
  promptIdProvided: number;
}
export interface Observation {
  contextId: string;
  familyId: string;
  variantId: string;
  repetition: number;
  identity: IdentityProvenance;
  sourceStatus: SourceStatus;
  cache: CacheStatus;
  output: Selection;
  namedScores: Selection;
}
export interface RelationResult {
  verdict: Verdict;
  reason: UnavailableReason | 'relation-satisfied' | 'relation-violated';
  /** Derived cardinalities are public; original values remain opt-in. */
  cardinality?: { left: number; right: number; leftUnique?: number; rightUnique?: number };
}
export interface SelectionEvidence {
  available: boolean;
  reason?: UnavailableReason;
}
export interface CheckResult extends RelationResult {
  contextId: string;
  familyId: string;
  relationId: string;
  repetition: number;
  kind: Relation['kind'];
  left: string;
  right: string;
  selections: { left: SelectionEvidence; right: SelectionEvidence };
  values?: { left?: JsonValue; right?: JsonValue };
}
export interface ObservationCounts {
  expected: number;
  present: number;
  missing: number;
  passed: number;
  assertionFailed: number;
  executionFailed: number;
  unknown: number;
  cached: number;
  fresh: number;
  cacheUnknown: number;
}
export interface CheckCounts {
  expected: number;
  pass: number;
  fail: number;
  inconclusive: number;
}
export interface PanelSummary {
  contextId: string;
  familyId: string;
  verdict: Verdict;
  checks: CheckCounts;
  observations: ObservationCounts;
}
export interface FamilyRun {
  contextId: string;
  familyId: string;
  repetition: number;
  verdict: Verdict;
  observations: ObservationCounts;
  checks: CheckCounts;
}
export interface RelationSummary {
  contextId: string;
  familyId: string;
  relationId: string;
  verdict: Verdict;
  checks: CheckCounts;
}
export interface ObservationEvidence {
  contextId: string;
  familyId: string;
  variantId: string;
  repetition: number;
  present: boolean;
  identity?: IdentityProvenance;
  sourceStatus: SourceStatus | 'missing';
  cache: CacheStatus;
  outputAvailable: boolean;
  outputUnavailableReason?: UnavailableReason;
  namedScoresAvailable: boolean;
}
export interface MetamorphicReport {
  version: 1;
  planName: string;
  datasetRevision?: string;
  sourceAssertions: MetamorphicPlan['sourceAssertions'];
  verdict: Verdict;
  includesValues: boolean;
  identityCoverage: IdentityCoverage;
  nativeSummaryVersion: number;
  input: { rows: number; selectedRows: number; ignoredRows: number; unidentifiedRows: number };
  observations: ObservationCounts;
  totals: CheckCounts;
  runTotals: CheckCounts;
  familyRuns: FamilyRun[];
  panels: PanelSummary[];
  relations: RelationSummary[];
  checks: CheckResult[];
  evidence: ObservationEvidence[];
  limitations: string[];
}
