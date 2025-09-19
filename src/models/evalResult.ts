import { randomUUID } from 'crypto';

import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { getEnvBool } from '../envars';
import { hashPrompt } from '../prompts/utils';
import { type EvaluateResult } from '../types/index';
import { isApiProvider, isProviderOptions } from '../types/providers';
import { safeJsonStringify } from '../util/json';
import { getCurrentTimestamp } from '../util/time';
import cliState from '../cliState';
import logger from '../logger';

import type {
  ApiProvider,
  AtomicTestCase,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
  ResultFailureReason,
} from '../types/index';

// Removes circular references from the provider object and ensures consistent format
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
): ProviderOptions {
  try {
    if (isApiProvider(provider)) {
      return {
        id: provider.id(),
        label: provider.label,
        ...(provider.config && {
          config: JSON.parse(safeJsonStringify(provider.config) as string),
        }),
      };
    }
    if (isProviderOptions(provider)) {
      return {
        id: provider.id,
        label: provider.label,
        ...(provider.config && {
          config: JSON.parse(safeJsonStringify(provider.config) as string),
        }),
      };
    }
    if (typeof provider === 'object' && provider) {
      const providerObj = provider as { id: string | (() => string); label?: string; config?: any };
      return {
        id: typeof providerObj.id === 'function' ? providerObj.id() : providerObj.id,
        label: providerObj.label,
        ...(providerObj.config && {
          config: JSON.parse(safeJsonStringify(providerObj.config) as string),
        }),
      };
    }
  } catch {}
  return JSON.parse(safeJsonStringify(provider) as string);
}

// Provider config denylist (normalized keys for exact matching)
const PROVIDER_SENSITIVE_FIELDS = new Set([
  'apikey', 'api_key', 'api-key',
  'token', 'accesstoken', 'access_token', 'access-token',
  'password', 'secret', 'clientsecret', 'client_secret', 'client-secret',
  'accesskey', 'access_key', 'access-key',
  'signingkey', 'signing_key', 'signing-key',
  'privatekey', 'private_key', 'private-key',
  'bearer', 'authorization', 'bearertoken', 'bearer_token', 'bearer-token'
]);

// Common header names that contain sensitive data (normalized)
const SENSITIVE_HEADERS = new Set([
  'authorization', 'x-api-key', 'x-auth-token', 'x-access-token',
  'cookie', 'set-cookie', 'x-auth', 'x-token'
].map(k => k.toLowerCase().replace(/[-_]/g, '')));

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

function isProviderSensitiveField(key: string): boolean {
  const normalized = normalizeKey(key);
  return PROVIDER_SENSITIVE_FIELDS.has(normalized);
}

function isSensitiveHeaderField(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_HEADERS.has(normalized);
}

function sanitizeConfigDeep(obj: any, visited = new WeakSet()): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Prevent circular references
  if (visited.has(obj)) {
    // For circular references, return just the essential provider fields
    // We can extract these from the current object since it's likely a provider
    const simplified: any = {};
    if (typeof obj === 'object' && obj !== null) {
      const objWithProps = obj as any;
      if (objWithProps.id) simplified.id = objWithProps.id;
      if (objWithProps.label) simplified.label = objWithProps.label;
    }
    return simplified;
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeConfigDeep(item, visited));
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if this key should be redacted
    if (isProviderSensitiveField(key)) {
      continue; // Skip this key entirely
    }

    // Special handling for headers object
    if (key.toLowerCase() === 'headers' && typeof value === 'object' && value !== null) {
      const sanitizedHeaders: any = {};
      for (const [headerKey, headerValue] of Object.entries(value)) {
        if (!isSensitiveHeaderField(headerKey)) {
          sanitizedHeaders[headerKey] = headerValue;
        }
      }
      sanitized[key] = sanitizedHeaders;
    } else {
      // Recursively sanitize nested objects
      const sanitizedValue = sanitizeConfigDeep(value, visited);

      // Only add the key if the sanitized value is not empty
      if (sanitizedValue !== undefined && sanitizedValue !== null) {
        // Skip empty objects unless they have meaningful content
        if (typeof sanitizedValue === 'object' && !Array.isArray(sanitizedValue)) {
          if (Object.keys(sanitizedValue).length > 0) {
            sanitized[key] = sanitizedValue;
          }
        } else {
          sanitized[key] = sanitizedValue;
        }
      }
    }
  }

  return sanitized;
}

function buildRedactionSet(testCase: AtomicTestCase): Set<string> {
  const redactSet = new Set<string>();

  // 1. Global config redact list (includes CLI args)
  const globalRedactions = cliState.config?.redact || [];
  globalRedactions.forEach((key: string) => redactSet.add(key));

  // 2. Per-test redact
  const perTestRedactions = testCase.redact || [];
  perTestRedactions.forEach(key => redactSet.add(key));

  // 3. File-level redact from metadata (support both _redact and _redactColumns for backwards compatibility)
  const fileRedactions = testCase.metadata?._redact || testCase.metadata?._redactColumns || [];
  fileRedactions.forEach((key: string) => redactSet.add(key));


  return redactSet;
}

function redactObject(obj: Record<string, any>, redactSet: Set<string>): Record<string, any> {
  if (!obj) {
    return obj;
  }

  const redacted = { ...obj };
  redactSet.forEach(key => delete redacted[key]);
  return redacted;
}

function sanitizeProviderConfig(provider: any): any {
  // Handle circular reference objects
  if (provider?.__isCircularRef) {
    const { __isCircularRef, ...cleanProvider } = provider;
    return cleanProvider;
  }

  if (!provider?.config) {
    return provider;
  }

  const sanitizedConfig = sanitizeConfigDeep(provider.config);

  // If sanitization resulted in an empty object, omit the config field
  if (sanitizedConfig && typeof sanitizedConfig === 'object' && Object.keys(sanitizedConfig).length === 0) {
    const { config, ...providerWithoutConfig } = provider;
    return providerWithoutConfig;
  }

  return {
    ...provider,
    config: sanitizedConfig
  };
}

function sanitizeForDb(testCase: AtomicTestCase, provider: any, resultMetadata?: any): {
  sanitizedTestCase: AtomicTestCase;
  sanitizedProvider: any;
  sanitizedMetadata: any;
  redactSet: Set<string>;
} {
  const redactSet = buildRedactionSet(testCase);

  // Sanitize test case vars
  const sanitizedVars = redactObject(testCase.vars || {}, redactSet);

  // Sanitize test case metadata (same rules as vars)
  const sanitizedTestCaseMetadata = redactObject(testCase.metadata || {}, redactSet);

  // Strip internal metadata keys
  const cleanedTestCaseMetadata = { ...sanitizedTestCaseMetadata };
  delete (cleanedTestCaseMetadata as any)._redact;
  delete (cleanedTestCaseMetadata as any)._redactColumns;

  const sanitizedTestCase = {
    ...testCase,
    vars: sanitizedVars,
    metadata: cleanedTestCaseMetadata
  };

  // Sanitize provider config
  const sanitizedProvider = sanitizeProviderConfig(provider);

  // Sanitize result metadata (from provider responses, etc.)
  const sanitizedMetadata = redactObject(resultMetadata || {}, redactSet);

  // Debug logging (key names only, never values)
  if (redactSet.size > 0) {
    logger.debug(`Redacted ${redactSet.size} variables: ${Array.from(redactSet).join(', ')}`);
  }

  return { sanitizedTestCase, sanitizedProvider, sanitizedMetadata, redactSet };
}

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
    } = result;

    // Sanitize testCase and provider for database storage
    const { sanitizedTestCase, sanitizedProvider, sanitizedMetadata } = sanitizeForDb(testCase, provider, metadata);

    const args = {
      id: randomUUID(),
      evalId,
      testCase: {
        ...sanitizedTestCase,
        ...(sanitizedTestCase.provider && {
          provider: sanitizeProviderConfig(sanitizedTestCase.provider),
        }),
      },
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt,
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: result.response || null,
      gradingResult: gradingResult || null,
      namedScores,
      provider: sanitizedProvider,
      latencyMs,
      cost,
      metadata: sanitizedMetadata,
      failureReason,
    };
    if (persist) {
      const db = getDb();

      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const returnResults: EvalResult[] = [];
    for (const result of results) {
      // Use createFromEvaluateResult to ensure consistent sanitization for imported data
      const evalResult = await EvalResult.createFromEvaluateResult(evalId, result, { persist: true });
      returnResults.push(evalResult);
    }
    return returnResults;
  }

  static async findById(id: string) {
    const db = getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const db = getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          opts?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, opts.testIdx),
        ),
      );
    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  static async findManyByEvalIdAndTestIndices(evalId: string, testIndices: number[]) {
    if (!testIndices.length) {
      return [];
    }

    const db = getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          testIndices.length === 1
            ? eq(evalResultsTable.testIdx, testIndices[0])
            : inArray(evalResultsTable.testIdx, testIndices),
        ),
      );

    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  /**
   * Returns a set of completed (testIdx,promptIdx) pairs for a given eval.
   * Key format: `${testIdx}:${promptIdx}`
   */
  static async getCompletedIndexPairs(evalId: string): Promise<Set<string>> {
    const db = getDb();
    const rows = await db
      .select({ testIdx: evalResultsTable.testIdx, promptIdx: evalResultsTable.promptIdx })
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, evalId));
    const ret = new Set<string>();
    for (const r of rows) {
      ret.add(`${r.testIdx}:${r.promptIdx}`);
    }
    return ret;
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    const db = getDb();
    const batchSize = opts?.batchSize || 100;
    let offset = 0;

    while (true) {
      const results = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            gte(evalResultsTable.testIdx, offset),
            lt(evalResultsTable.testIdx, offset + batchSize),
          ),
        )
        .all();

      if (results.length === 0) {
        break;
      }

      yield results.map((result) => new EvalResult({ ...result, persisted: true }));
      offset += batchSize;
    }
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  success: boolean;
  score: number;
  response: ProviderResponse | undefined;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
  metadata: Record<string, any>;
  failureReason: ResultFailureReason;
  persisted: boolean;
  pluginId?: string;

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    success: boolean;
    score: number;
    response: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
    metadata?: Record<string, any> | null;
    failureReason: ResultFailureReason;
    persisted?: boolean;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testIdx = opts.testIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.score = opts.score;
    this.success = opts.success;
    this.response = opts.response || undefined;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    this.metadata = opts.metadata || {};
    this.failureReason = opts.failureReason;
    this.persisted = opts.persisted || false;
    this.pluginId = opts.testCase.metadata?.pluginId;
  }

  async save() {
    const db = getDb();
    //check if this exists in the db
    if (this.persisted) {
      await db
        .update(evalResultsTable)
        .set({ ...this, updatedAt: getCurrentTimestamp() })
        .where(eq(evalResultsTable.id, this.id));
    } else {
      const result = await db.insert(evalResultsTable).values(this).returning();
      this.id = result[0].id;
      this.persisted = true;
    }
  }

  toEvaluateResult(): EvaluateResult {
    const shouldStripPromptText = getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false);
    const shouldStripResponseOutput = getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false);
    const shouldStripTestVars = getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false);
    const shouldStripGradingResult = getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false);
    const shouldStripMetadata = getEnvBool('PROMPTFOO_STRIP_METADATA', false);

    const response =
      shouldStripResponseOutput && this.response
        ? {
            ...this.response,
            output: '[output stripped]',
          }
        : this.response;

    const prompt = shouldStripPromptText
      ? {
          ...this.prompt,
          raw: '[prompt stripped]',
        }
      : this.prompt;

    const testCase = shouldStripTestVars
      ? {
          ...this.testCase,
          vars: undefined,
        }
      : this.testCase;

    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}
