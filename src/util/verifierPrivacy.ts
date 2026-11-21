import { isResultFailureReason } from '../types/results';
import { hasPrivateMedia } from './redactionMedia';

import type {
  Assertion,
  AssertionOrSet,
  AtomicTestCase,
  EvaluateResult,
  GradingResult,
  Prompt,
  ProviderResponse,
} from '../types';

export const TRACE_REDACTION_ASSERTIONS = new Set([
  'promptfoo:redteam:coding-agent:trace-redaction',
  'promptfoo:redteam:harness:artifact-redaction',
]);
export const REDACTED_PROMPT = '[Prompt omitted for trace/artifact redaction.]';
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 32;
const MAX_INPUTS = 100_000;
type Dict = Record<string, unknown>;

function record(value: unknown): value is Dict {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireBudget(size: number, limit = MAX_INPUTS) {
  if (size > limit) {
    throw new Error('Verifier input is too large to inspect safely.');
  }
}

function codingAgentId(id: unknown) {
  return (
    typeof id === 'string' && /^(?:not-)?(?:promptfoo:redteam:)?(?:coding-agent|harness):/.test(id)
  );
}

function privateId(id: unknown) {
  return (
    typeof id === 'string' &&
    TRACE_REDACTION_ASSERTIONS.has(
      id.replace(/^(?:not-)?(?:promptfoo:redteam:)?/, 'promptfoo:redteam:'),
    )
  );
}

/** Visit leaves in assertion order, including repeated references in distinct sets. */
export function getAssertionLeaves(assertions?: AssertionOrSet[]): Assertion[] {
  const leaves: Assertion[] = [];
  const ancestors = new Set<AssertionOrSet[]>();
  let count = 0;
  const visit = (items?: AssertionOrSet[]) => {
    if (!Array.isArray(items) || ancestors.has(items)) {
      return;
    }
    requireBudget(ancestors.size, MAX_DEPTH);
    count += items.length;
    requireBudget(count);
    ancestors.add(items);
    for (const item of items) {
      if (item?.type === 'assert-set') {
        visit(item.assert);
      } else if (typeof item?.type === 'string') {
        leaves.push(item);
      }
    }
    ancestors.delete(items);
  };
  visit(assertions);
  return leaves;
}

export function requiresTraceRedaction(assertions?: AssertionOrSet[]): boolean {
  return getAssertionLeaves(assertions).some((item) => privateId(item.type));
}

// Limit classification to suite structure. Arbitrary provider payloads and user variables
// cannot activate privacy mode by containing an assertion or a plugin name.
function matchesConfig(input: unknown, matchesId: (id: unknown) => boolean): boolean {
  const pending: unknown[] = [input];
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      requireBudget(value.length);
      for (const item of value) {
        if (matchesId(item)) {
          return true;
        }
        pending.push(item);
      }
    } else if (record(value)) {
      const metadata = record(value.metadata) ? value.metadata : undefined;
      if (
        metadata?.privatePrompts === true ||
        [value.type, value.id, value.pluginId, metadata?.pluginId].some(matchesId)
      ) {
        return true;
      }
      for (const key of [
        'assert',
        'assertion',
        'redteam',
        'plugins',
        'tests',
        'defaultTest',
        'scenarios',
        'test',
        'testCase',
        'outputs',
        'gradingResult',
        'componentResults',
      ]) {
        if (value[key]) {
          pending.push(value[key]);
        }
      }
      if (Array.isArray(value.config)) {
        pending.push(value.config);
      }
    }
  }
  return false;
}

export function configHasCodingAgentVerifier(config: unknown): boolean {
  return matchesConfig(config, codingAgentId);
}

export function configRequiresTraceRedaction(config: unknown): boolean {
  return matchesConfig(config, privateId);
}

const PRIVATE_VERIFIER_FIELD =
  /(?:^(?:mcp)?privateenv$|canar(?:y|ies)|receipts?$|ledgers?$|traplogs?$|^connector(?:dataoverreach|read|parameterexfil|sink)reports?$|^(?:terminalcontroltexts?|fakeassistantlines?)$|^(?:forbidden|sensitive|secret(?:env|file)?|syntheticsecret)(?:values?|s)?$|^(?:sourceonly|connectorprotected|protectedconnector|protected(?:file)?|(?:hidden|stego)secret|(?:process|procfs)credential)values?$|^(?:(?:broad|forbidden)privilege|leastprivilege(?:drift)?|privilege(?:drift|escalation|rerun))(?:markers?|requests?)$|^(?:secret|terminaloutput|lifecycle(?:script)?|postinstall|agentsmd|repoinstruction)?markers?$|(?:artifact|report|trace|log|payload|metadata|raw|export|receipt|agentsmd|config|profile|wrapper|memory|state|instructions|rules?|skill|attestation|handoff)texts?$|^expected(?:file|original)?content$|^steg(?:o|anographic)secrets?$)/i;
const PRIVATE_INSTRUCTION =
  /(?:poison|poisonedskill|codex|mcp(?:prompt|resource|toolresult)|injectedterminal|repo(?:sitory)?)instructions?$/i;

export function isPrivateVerifierField(key: string, preservePaths = true, strict = false): boolean {
  let field = key.replace(/[-_]/g, '');
  if (/paths?$/i.test(field)) {
    if (!preservePaths || !strict || /^sensitivePaths$/i.test(field)) {
      return !preservePaths;
    }
    field = field.replace(/paths?$/i, '');
  }
  return (
    !/(?:hash|sha256|bytes?|length)$/i.test(field) &&
    (PRIVATE_VERIFIER_FIELD.test(field) || PRIVATE_INSTRUCTION.test(field))
  );
}

function* ownEntries(value: object): Generator<[string, unknown]> {
  if (Array.isArray(value)) {
    requireBudget(value.length);
  }
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      yield [key, (value as Dict)[key]];
    }
  }
}

function ownsInputs(value: unknown): boolean {
  return (
    record(value) &&
    ((record(value.metadata) && value.metadata.privatePrompts === true) ||
      [
        value.id,
        value.type,
        value.pluginId,
        record(value.metadata) && value.metadata.pluginId,
      ].some(codingAgentId) ||
      configHasCodingAgentVerifier(value.assert ?? value.testCase ?? value.defaultTest))
  );
}

function ownsField(key: string): boolean {
  return /^(?:providers?|targets?|prompts?|defaultTest)$/.test(key);
}

function addAliases(secrets: Set<string>, literal: string) {
  if (!literal || literal === REDACTED || secrets.has(literal)) {
    return;
  }
  secrets.add(literal);
  if (literal !== literal.trim()) {
    addAliases(secrets, literal.trim());
  }
  if (literal.length < 4) {
    return;
  }
  secrets.add(JSON.stringify(literal).slice(1, -1));
  try {
    secrets.add(encodeURIComponent(literal));
  } catch {
    throw new Error('Invalid verifier input encoding.');
  }
  const bytes = new TextEncoder().encode(literal);
  let binary = '';
  let hex = '';
  for (let pos = 0; pos < bytes.length; pos += 8192) {
    const chunk = bytes.subarray(pos, pos + 8192);
    binary += String.fromCharCode(...chunk);
    hex += Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  secrets.add(hex);
  secrets.add(hex.toUpperCase());
  const base64 = btoa(binary).replace(/=+$/, '');
  secrets.add(base64);
  secrets.add(base64.replace(/\+/g, '-').replace(/\//g, '_'));
}

// Collect before projecting so object order and aliases outside the test cannot bypass
// redaction. A shared object may appear in both an ordinary field and a private receipt.
function collectAliases(
  input: unknown,
  source: unknown,
  preservePaths: boolean,
  strict: boolean,
): string[] {
  const secrets = new Set<string>();
  const pending = [input, source].map((value) => ({ value, owned: false, privateField: false }));
  const visited = [new Set<object>(), new Set<object>(), new Set<object>()];
  let count = 0;
  let chars = 0;
  while (pending.length) {
    const item = pending.pop()!;
    const { value, privateField } = item;
    if (privateField && (typeof value === 'string' || typeof value === 'number')) {
      const literal = String(value);
      if (typeof value === 'number' && literal.length < 4) {
        continue;
      }
      if (!secrets.has(literal)) {
        chars += literal.length;
        requireBudget(chars, 4 * 1024 * 1024);
        addAliases(secrets, literal);
        requireBudget(secrets.size, 4096);
      }
      continue;
    }
    if (!value || typeof value !== 'object') {
      continue;
    }
    const owned = item.owned || ownsInputs(value);
    const seen = visited[privateField ? 2 : Number(owned)];
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    for (const [key, child] of ownEntries(value)) {
      requireBudget(++count);
      pending.push({
        value: child,
        owned: owned || ownsField(key),
        privateField:
          privateField ||
          (owned && (key === 'env' || isPrivateVerifierField(key, preservePaths, strict))),
      });
    }
  }
  return [...secrets];
}

type ProjectionOptions = { preservePaths?: boolean; source?: unknown; strict?: boolean };

/** Project public inputs using private literals from the full local configuration. */
export function sanitizeCodingAgentVerifierInputs<T>(input: T, options: ProjectionOptions = {}): T {
  return projectInputs(input, options, false);
}

function projectInputs<T>(
  input: T,
  { preservePaths = true, source, strict = false }: ProjectionOptions,
  publicRow: boolean,
): T {
  if (!configHasCodingAgentVerifier(input) && !configHasCodingAgentVerifier(source)) {
    return input;
  }
  const aliases = collectAliases(input, source, preservePaths, strict);
  const containsPrivate = (text: string) =>
    text !== REDACTED &&
    aliases.some(
      (secret) => text === secret || ((strict || secret.length >= 4) && text.includes(secret)),
    );
  let count = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, owned: boolean, depth: number): [unknown, boolean] => {
    requireBudget(++count);
    if (typeof value === 'string' || (!publicRow && typeof value === 'number')) {
      return (!preservePaths && typeof value === 'string' && value.startsWith('file://')) ||
        containsPrivate(String(value))
        ? [REDACTED, true]
        : [value, false];
    }
    if (!value || typeof value !== 'object') {
      return [value, false];
    }
    if (depth >= MAX_DEPTH || ancestors.has(value)) {
      return [{ privateVerifierInputsRedacted: true }, true];
    }
    ancestors.add(value);
    owned ||= ownsInputs(value);
    const result: Dict | unknown[] = Array.isArray(value) ? [] : {};
    let changed = false;
    for (const [key, child] of ownEntries(value)) {
      // Rows already have fixed keys and validated counters. In configs, keep
      // privacy controls even if a canary happens to equal a schema key.
      const marker =
        !strict &&
        ((['type', 'id', 'pluginId'].includes(key) &&
          (privateId(child) || child === 'assert-set')) ||
          (key === 'privatePrompts' && child === true));
      if (
        key === 'toJSON' ||
        (!publicRow &&
          !marker &&
          !Array.isArray(value) &&
          containsPrivate(key) &&
          (strict || !configRequiresTraceRedaction({ [key]: child })))
      ) {
        changed = true;
        continue;
      }
      const privateField =
        owned && (isPrivateVerifierField(key, preservePaths, strict) || key === 'env');
      const [copy, redacted] =
        privateField && child !== undefined
          ? [key === 'env' ? {} : REDACTED, true]
          : marker
            ? [child, false]
            : visit(child, owned || ownsField(key), depth + 1);
      Object.defineProperty(result, key, {
        value: copy,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      changed ||= Boolean(redacted);
    }
    ancestors.delete(value);
    if (owned && changed && !Array.isArray(result)) {
      result.privateVerifierInputsRedacted = true;
    }
    return [result, changed];
  };
  return visit(input, false, 0)[0] as T;
}

function promptHash(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^(?:[0-9a-f]{64}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value)
    ? value
    : undefined;
}

export function sanitizeRedactionPrompt<T extends Prompt>(prompt: T): T {
  return {
    raw: REDACTED_PROMPT,
    label: REDACTED_PROMPT,
    ...(prompt.template !== undefined && { template: REDACTED_PROMPT }),
    ...(prompt.display !== undefined && { display: REDACTED_PROMPT }),
    ...(promptHash(prompt.id) && { id: prompt.id }),
    ...('provider' in prompt && { provider: REDACTED }),
  } as T;
}

const PRIVATE_FAILURE_KINDS = new Set([
  'redacted-artifact-sensitive-value',
  'missing-redaction-evidence',
  'oversized-redacted-artifact',
  'unreadable-verifier-artifact',
  'verifier-sidecar-failed',
  'verifier-artifact-modified',
  'missing-coding-agent-action-evidence',
]);

function gradeMetadata(
  meta: NonNullable<GradingResult['metadata']>,
): NonNullable<GradingResult['metadata']> {
  const safe: NonNullable<GradingResult['metadata']> = {};
  if (meta.graderError || meta.gradingError) {
    safe.graderError = true;
  }
  for (const key of ['cachedResponse', 'gradingIncomplete', 'deterministicFailure']) {
    if (typeof meta[key] === 'boolean') {
      safe[key] = meta[key];
    }
  }
  if (
    meta.codingAgentExploitStatus === 'evidence_missing' ||
    meta.codingAgentExploitStatus === 'executed'
  ) {
    safe.codingAgentExploitStatus = meta.codingAgentExploitStatus;
  }
  for (const key of ['deterministicFailureKind', 'verifierKind']) {
    if (PRIVATE_FAILURE_KINDS.has(meta[key])) {
      safe[key] = meta[key];
    }
  }
  const evidence = meta.verifierEvidence;
  if (record(evidence)) {
    const projected: Dict = {};
    if (
      typeof evidence.failureKind === 'string' &&
      PRIVATE_FAILURE_KINDS.has(evidence.failureKind)
    ) {
      projected.failureKind = evidence.failureKind;
    }
    for (const key of [
      'artifactByteLength',
      'redactedArtifactByteLength',
      'redactionReceiptByteLength',
    ]) {
      const length = evidence[key];
      if (
        typeof length === 'number' &&
        Number.isSafeInteger(length) &&
        length >= 0 &&
        length <= 32 * 1024 * 1024
      ) {
        projected[key] = length;
      }
    }
    for (const key of ['redactedArtifactSha256', 'redactionReceiptSha256']) {
      if (typeof evidence[key] === 'string' && /^[a-f0-9]{64}$/.test(evidence[key])) {
        projected[key] = evidence[key];
      }
    }
    safe.verifierEvidence = projected;
  }
  return safe;
}

function validScore(value?: number): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 0;
}

function safeIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Grader prompts, errors, assertions and suggestions can all contain the private response. */
export function sanitizeRedactionGrade(result: GradingResult): GradingResult {
  let count = 0;
  const visit = (grade: GradingResult, depth: number): GradingResult => {
    requireBudget(depth, MAX_DEPTH);
    requireBudget(++count);
    requireBudget(grade.componentResults?.length ?? 0);
    return {
      pass: grade.pass === true,
      score: validScore(grade.score),
      reason: 'Grading details omitted for trace/artifact redaction.',
      ...(grade.assertion &&
        privateId(grade.assertion.type) && { assertion: { type: grade.assertion.type } }),
      ...(grade.metadata && { metadata: gradeMetadata(grade.metadata) }),
      ...(Array.isArray(grade.componentResults) && {
        componentResults: grade.componentResults.map((child) => visit(child, depth + 1)),
      }),
    };
  };
  return visit(result, 0);
}

function safeId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9.:/_-]{1,256}$/i.test(value) ? value : undefined;
}

// Older records keep linkage in a reserved namespace. Free-form row metadata can
// come from a provider or result hook, so other fields must originate in the test.
function publicTestMetadata(test: AtomicTestCase) {
  const metadata: Dict = { privatePrompts: true };
  for (const key of ['pluginId', 'strategyId', 'testCaseId']) {
    const id = safeId(test.metadata?.[key]);
    if (id) {
      metadata[key] = id;
    }
  }
  if (test.metadata?.__promptfoo?.remote === true) {
    metadata.__promptfoo = { remote: true };
  }
  return metadata;
}

function publicMetadata(result: Partial<EvaluateResult>, testMetadata: Dict) {
  const metadata: Dict = { ...testMetadata };
  const source = result.metadata?.__promptfoo;
  if (record(source)) {
    const linkage: Dict = {};
    if (record(source.traceLinkage)) {
      linkage.traceLinkage = {
        evaluationId: safeId(source.traceLinkage.evaluationId),
        traceId: safeId(source.traceLinkage.traceId),
      };
    }
    if (record(source.repeatLinkage)) {
      linkage.repeatLinkage = {
        repeatGroupId: safeId(source.repeatLinkage.repeatGroupId),
        repeatIndex: safeIndex(source.repeatLinkage.repeatIndex),
      };
    }
    metadata.__promptfoo = {
      ...(record(metadata.__promptfoo) && metadata.__promptfoo),
      ...linkage,
    };
  }
  return metadata;
}

const ERROR_OMITTED = 'Error details omitted for trace/artifact redaction.';
function publicResponse(response: ProviderResponse, media: boolean): ProviderResponse {
  return {
    output: media
      ? '[Media response omitted: binary, image, audio, or video redaction could not be verified.]'
      : '[Response omitted for trace/artifact redaction.]',
    ...(response.error && { error: ERROR_OMITTED }),
    ...(response.conversationEnded === true && { conversationEnded: true }),
    ...(typeof response.cached === 'boolean' && { cached: response.cached }),
    metadata: media ? { redactionMediaOmitted: true } : { redactionContentOmitted: true },
  };
}

/** Project after grading, before hooks, storage and exports. Never inspect opaque response
 * bodies in the general sanitizer. The local verifier inspects them before this boundary. */
export function projectRedactionResult<T extends object>(
  input: T,
  hasMedia: (response: ProviderResponse) => boolean,
  localInputs?: (test: AtomicTestCase) => unknown,
): T {
  const result = input as Partial<EvaluateResult>;
  const test: AtomicTestCase = result.testCase ?? {};
  if (!configHasCodingAgentVerifier(result)) {
    return input;
  }
  const { response } = result;
  if (!configRequiresTraceRedaction(result)) {
    const { response: _response, ...fields } = result;
    return { ...sanitizeCodingAgentVerifierInputs(fields), ...(response && { response }) } as T;
  }
  const source = {
    type: 'coding-agent:trace-redaction',
    assert: test.assert,
    vars: test.vars,
    metadata: test.metadata,
    captured: localInputs?.(test),
  };
  const testMetadata = publicTestMetadata(test);
  const row = {
    testCase: {
      privateVerifierInputsRedacted: true,
      ...('id' in test && { id: safeId(test.id) }),
      metadata: testMetadata,
      assert: getAssertionLeaves(test.assert).map(({ type }) => ({ type })),
      ...(test.options?.disableDefaultAsserts && { options: { disableDefaultAsserts: true } }),
    },
    vars: {},
    prompt: result.prompt && sanitizeRedactionPrompt(result.prompt),
    provider: result.provider && { id: safeId(result.provider.id) ?? REDACTED },
    metadata: publicMetadata(result, testMetadata),
    gradingResult: result.gradingResult && sanitizeRedactionGrade(result.gradingResult),
    id: safeId(result.id),
    evaluationId: safeId(result.evaluationId),
    traceId: safeId(result.traceId),
    repeatGroupId: safeId(result.repeatGroupId),
    repeatIndex: safeIndex(result.repeatIndex),
    promptIdx: safeIndex(result.promptIdx),
    testIdx: safeIndex(result.testIdx),
    promptId: promptHash(result.promptId) ?? '',
    failureReason: isResultFailureReason(result.failureReason ?? -1)
      ? result.failureReason
      : undefined,
    success: result.success === true,
    score: validScore(result.score),
    namedScores: {},
    latencyMs: 0,
  };
  return {
    ...projectInputs(row, { source, preservePaths: false }, true),
    error: result.error ? ERROR_OMITTED : result.error,
    ...(response && { response: publicResponse(response, hasMedia(response)) }),
  } as T;
}

export function sanitizeRedactionResult<T extends object>(input: T): T {
  return projectRedactionResult(input, hasPrivateMedia);
}
