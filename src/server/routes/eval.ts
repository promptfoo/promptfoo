import { isDeepStrictEqual } from 'node:util';

import { Router } from 'express';
import { z } from 'zod';
import { HUMAN_ASSERTION_TYPE } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import Eval, { EvalQueries } from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { evaluateWithSource } from '../../node';
import { getNamedOpenAiTextId, getSafeProviderId } from '../../providers/index';
import { EvalSchemas } from '../../types/api/eval';
import {
  getCloudDatabaseId,
  getProviderFromCloud,
  isCloudProvider,
  withCloudProviderResolver,
} from '../../util/cloud';
import { deleteEval, deleteEvals, updateResult, writeResultsToDatabase } from '../../util/database';
import {
  ComparisonEvalNotFoundError,
  evalTableToJson,
  generateEvalCsv,
  getEvalTableOutputPromptLocationsBySize,
  getEvalTablePromptStrippedPayload,
  getReplayColumn,
  mergeComparisonTables,
} from '../../util/eval/evalTableUtils';
import invariant from '../../util/invariant';
import {
  isProviderConfigFileReference,
  normalizeProviderRef,
  type ProviderRefDescriptor,
  readRawProviderConfigFile,
} from '../../util/providerRef';
import {
  redactAzureBlobSasTokens,
  restoreAzureBlobSasTokens,
  sanitizeObject,
} from '../../util/sanitizer';
import { shouldShareResults } from '../../util/sharing';
import { getTemplateEnvValue } from '../../util/templates';
import { evalJobService } from '../services/evalJobService';
import { setDownloadHeaders } from '../utils/downloadHelpers';
import { replyValidationError, sendError } from '../utils/errors';
import type { Request, Response } from 'express';

import type {
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTable,
  EvaluateTestSuite,
  GradingResult,
  PromptMetrics,
  ProviderOptions,
  ResultsFile,
  Vars,
} from '../../types/index';

export const evalRouter = Router();

function sendEvalTableResponse(res: Response, evalId: string, responsePayload: EvalTableDTO): void {
  let parsedPayload: EvalTableDTO;
  try {
    parsedPayload = EvalSchemas.Table.Response.parse(responsePayload) as unknown as EvalTableDTO;
  } catch (error) {
    sendError(res, 500, 'Failed to render eval table', error);
    return;
  }

  try {
    res.json(parsedPayload);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    logger.warn('[GET /:id/table] Response too large, stripping per-cell prompts by size', {
      evalId,
    });

    const promptLocations = getEvalTableOutputPromptLocationsBySize(parsedPayload);
    if (promptLocations.length === 0) {
      logger.error('[GET /:id/table] Response too large and has no prompts to strip', {
        evalId,
      });
      res.status(413).json({ error: 'Eval too large to display. Try reducing the page size.' });
      return;
    }

    const tryStringifyWithStrippedPrompts = (promptCountToStrip: number): string | null => {
      const responseWithoutPrompts = getEvalTablePromptStrippedPayload(
        parsedPayload,
        promptLocations,
        promptCountToStrip,
      );
      try {
        const responseBody = JSON.stringify(responseWithoutPrompts);
        invariant(typeof responseBody === 'string', 'Eval table response must serialize to JSON');
        return responseBody;
      } catch (retryError) {
        if (!(retryError instanceof RangeError)) {
          throw retryError;
        }
        return null;
      }
    };

    let lowerBound = 0;
    let upperBound = 1;
    let responseBody: string | null = null;

    while (upperBound < promptLocations.length) {
      responseBody = tryStringifyWithStrippedPrompts(upperBound);
      if (responseBody) {
        break;
      }
      lowerBound = upperBound;
      upperBound *= 2;
    }

    if (!responseBody) {
      upperBound = promptLocations.length;
      responseBody = tryStringifyWithStrippedPrompts(upperBound);
    }

    if (responseBody) {
      while (upperBound - lowerBound > 1) {
        const midPoint = lowerBound + Math.floor((upperBound - lowerBound) / 2);
        const midpointResponseBody = tryStringifyWithStrippedPrompts(midPoint);
        if (midpointResponseBody) {
          upperBound = midPoint;
          responseBody = midpointResponseBody;
        } else {
          lowerBound = midPoint;
        }
      }

      res.type('json').send(responseBody);
      return;
    }

    logger.error('[GET /:id/table] Response still too large after stripping prompts', {
      evalId,
    });
    res.status(413).json({ error: 'Eval too large to display. Try reducing the page size.' });
  }
}

evalRouter.post('/job', async (req: Request, res: Response): Promise<void> => {
  const result = EvalSchemas.CreateJob.Request.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: z.prettifyError(result.error) });
    return;
  }

  // Use validated data but merge providers from req.body to preserve nested config fields.
  // Provider configs can have arbitrary keys (e.g., custom headers, API options) that
  // nested provider schemas may strip. This keeps Zod transforms/coercions while
  // preserving provider flexibility.
  const {
    evaluateOptions,
    sourceEvalId,
    providers: _validatedProviders,
    basePath: _basePath,
    ...restData
  } = result.data;
  let testSuite = {
    ...restData,
    // Preserve raw providers from req.body to keep nested config fields
    providers: (req.body as { providers?: unknown }).providers,
  };

  if (sourceEvalId) {
    try {
      const sourceEval = await Eval.findById(sourceEvalId);
      if (sourceEval) {
        testSuite = {
          ...restoreAzureBlobSasTokens(testSuite, sourceEval.config),
          ...(sourceEval.config.basePath !== undefined && { basePath: sourceEval.config.basePath }),
        };
      }
    } catch (error) {
      sendError(res, 500, 'Failed to prepare eval job', error);
      return;
    }
  }

  const id = crypto.randomUUID();
  evalJobService.create(id);

  evaluateWithSource(
    {
      ...(testSuite as EvaluateTestSuite),
      writeLatestResults: true,
      sharing: testSuite.sharing ?? shouldShareResults({}),
    },
    {
      ...evaluateOptions,
      eventSource: 'web',
      providerProgressCallback: (progress, completed) => {
        evalJobService.setProviderProgress(id, progress, completed);
      },
      progressCallback: (progress: number, total: number) => {
        invariant(evalJobService.setProgress(id, progress, total), 'Job not found');
        console.log(`[${id}] ${progress}/${total}`);
      },
    },
  )
    .then(async (evalResult) => {
      const result = await evalResult.toEvaluateSummary();
      invariant(evalJobService.complete(id, result, evalResult.id), 'Job not found');
      console.log(`[${id}] Complete`);
    })
    .catch((error) => {
      logger.error('Failed to eval tests', {
        error,
        body: sanitizeObject(testSuite, { context: 'request body' }),
      });

      invariant(evalJobService.fail(id, [String(error)]), 'Job not found');
    });

  res.json(EvalSchemas.CreateJob.Response.parse({ id }));
});

evalRouter.get('/job/:id', (req: Request, res: Response): void => {
  const paramsResult = EvalSchemas.GetJob.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  try {
    const job = evalJobService.get(id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(EvalSchemas.GetJob.Response.parse(job));
  } catch (error) {
    const category =
      error instanceof z.ZodError
        ? 'invalid-result'
        : error instanceof SyntaxError
          ? 'invalid-json'
          : 'unavailable';
    // Logs are shared with active jobs; omit snapshot contents and filesystem details.
    sendError(res, 500, 'Failed to load eval job', { category });
  }
});

evalRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Update.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const bodyResult = EvalSchemas.Update.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { table, config } = bodyResult.data;

  try {
    // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with EvaluateTable
    await updateResult(id, config, table as unknown as EvaluateTable | undefined);
    res.json(EvalSchemas.Update.Response.parse({ message: 'Eval updated successfully' }));
  } catch (error) {
    logger.error('[PATCH /api/eval/:id] Failed to update eval', { id, error });
    res.status(500).json({ error: 'Failed to update eval table' });
  }
});

evalRouter.patch('/:id/author', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.UpdateAuthor.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const bodyResult = EvalSchemas.UpdateAuthor.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { author } = bodyResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    eval_.author = author;
    await eval_.save();

    // NOTE: Side effect. If user email is not set, set it to the author's email
    if (!getUserEmail()) {
      setUserEmail(author);
    }

    res.json(
      EvalSchemas.UpdateAuthor.Response.parse({
        message: 'Author updated successfully',
      }),
    );
  } catch (error) {
    logger.error(`Failed to update eval author: ${error}`);
    res.status(500).json({ error: 'Failed to update eval author' });
  }
});

const UNLIMITED_RESULTS = Number.MAX_SAFE_INTEGER;

evalRouter.get('/:id/table', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Table.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const queryResult = EvalSchemas.Table.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;

  const {
    format,
    limit: baseLimit,
    offset: baseOffset,
    filterMode,
    search: searchText,
    filter: filters,
    comparisonEvalIds,
  } = queryResult.data;

  // Apply UNLIMITED_RESULTS when format is specified
  const limit = format ? UNLIMITED_RESULTS : baseLimit;
  const offset = format ? 0 : baseOffset;

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
  }

  // Unified CSV export path - handles both simple and comparison exports
  // This is the same code path used by CLI exports, ensuring consistent output
  if (format === 'csv') {
    try {
      const csvData = await generateEvalCsv(eval_, {
        filterMode,
        searchQuery: searchText,
        filters,
        comparisonEvalIds,
        findEvalById: Eval.findById.bind(Eval),
      });
      setDownloadHeaders(res, `${id}.csv`, 'text/csv');
      res.send(csvData);
      return;
    } catch (error) {
      if (error instanceof ComparisonEvalNotFoundError) {
        res.status(404).json({ error: 'Comparison eval not found' });
        return;
      }
      throw error;
    }
  }

  const table = await eval_.getTablePage({
    offset,
    limit,
    filterMode,
    searchQuery: searchText,
    filters,
  });

  const indices = table.body.map((row) => row.testIdx);

  let returnTable = { head: table.head, body: table.body };

  if (comparisonEvalIds.length > 0) {
    // Fetch comparison evals and their tables, keeping track of eval IDs
    const comparisonData = await Promise.all(
      comparisonEvalIds.map(async (comparisonEvalId) => {
        const comparisonEval_ = await Eval.findById(comparisonEvalId);
        if (!comparisonEval_) {
          return null;
        }
        const comparisonTable = await comparisonEval_.getTablePage({
          offset: 0,
          limit: indices.length,
          filterMode: 'all',
          testIndices: indices,
          searchQuery: searchText,
          filters,
        });
        return { evalId: comparisonEval_.id, table: comparisonTable };
      }),
    );

    // Check if any comparison evals were not found
    if (comparisonData.some((data) => data === null)) {
      res.status(404).json({ error: 'Comparison eval not found' });
      return;
    }

    // Use shared merge function (fixes bug where table.id was incorrectly referenced)
    returnTable = mergeComparisonTables(
      id,
      table,
      comparisonData.filter(
        (data): data is { evalId: string; table: typeof table } => data !== null,
      ),
    );
  }

  // Handle JSON export format (CSV is handled above via unified generateEvalCsv)
  if (format === 'json') {
    const jsonData = evalTableToJson(returnTable);

    setDownloadHeaders(res, `${id}.json`, 'application/json');
    res.json(jsonData);
    return;
  }

  // Calculate filtered metrics when filters are active
  let filteredMetrics: PromptMetrics[] | null = null;
  const hasActiveFilters = filterMode !== 'all' || searchText !== '' || filters.length > 0;

  if (hasActiveFilters) {
    try {
      filteredMetrics = await eval_.getFilteredMetrics({
        filterMode,
        searchQuery: searchText,
        filters,
      });
      logger.debug('[GET /:id/table] Calculated filtered metrics', {
        evalId: id,
        filterMode,
        numPrompts: filteredMetrics.length,
      });

      // Validate that filteredMetrics array length matches prompts array length
      // Note: Use table.head.prompts (base eval) not returnTable.head.prompts (includes comparison evals)
      const expectedLength = table.head.prompts.length;
      if (filteredMetrics.length !== expectedLength) {
        logger.error(
          '[GET /:id/table] Filtered metrics array length mismatch - setting to null to prevent frontend errors',
          {
            evalId: id,
            expectedLength,
            actualLength: filteredMetrics.length,
            filterMode,
            searchText,
            filtersCount: filters.length,
          },
        );
        filteredMetrics = null;
      }
    } catch (error) {
      logger.error('[GET /:id/table] Failed to calculate filtered metrics', { error, evalId: id });
      // Don't fail the request, just return null for filteredMetrics
    }
  }

  const responsePayload = {
    table: returnTable,
    totalCount: table.totalCount,
    filteredCount: table.filteredCount,
    filteredMetrics,
    config: redactAzureBlobSasTokens(eval_.config),
    author: eval_.author || null,
    version: eval_.version(),
    id,
    stats: eval_.getStats(),
  } as EvalTableDTO;

  sendEvalTableResponse(res, id, responsePayload);
});

evalRouter.get('/:id/metadata-keys', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.MetadataKeys.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const queryResult = EvalSchemas.MetadataKeys.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { comparisonEvalIds = [] } = queryResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    // Validate that comparison evals exist
    if (comparisonEvalIds.length > 0) {
      const comparisonEvals = await Promise.all(
        comparisonEvalIds.map((compId) => Eval.findById(compId)),
      );
      const missingEvals = comparisonEvalIds.filter((_, index) => !comparisonEvals[index]);
      if (missingEvals.length > 0) {
        res.status(400).json({
          error: `Comparison evals not found: ${missingEvals.join(', ')}`,
        });
        return;
      }
    }

    const keys = await EvalQueries.getMetadataKeysFromEval(id, comparisonEvalIds);

    const response = EvalSchemas.MetadataKeys.Response.parse({ keys });
    res.json(response);
  } catch (error) {
    logger.error(
      `Error fetching metadata keys for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to fetch metadata keys' });
  }
});

evalRouter.get('/:id/metadata-values', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.MetadataValues.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const queryResult = EvalSchemas.MetadataValues.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { key } = queryResult.data;

  try {
    const eval_ = await Eval.findById(id);
    if (!eval_) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    const values = await EvalQueries.getMetadataValuesFromEval(id, key);
    const response = EvalSchemas.MetadataValues.Response.parse({ values });
    res.json(response);
  } catch (error) {
    logger.error(
      `Error fetching metadata values for eval ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to fetch metadata values' });
  }
});

evalRouter.post('/:id/results', async (req: Request, res: Response) => {
  const paramsResult = EvalSchemas.AddResults.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const bodyResult = EvalSchemas.AddResults.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with EvalResult[]
  const results = bodyResult.data as unknown as EvalResult[];

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    res.status(404).json({ error: 'Eval not found' });
    return;
  }
  try {
    await eval_.setResults(results);
  } catch (error) {
    logger.error(`Failed to add results to eval: ${error}`);
    res.status(500).json({ error: 'Failed to add results to eval' });
    return;
  }
  res.status(204).send();
});

const TEMPLATE_MARKER = /\{[{%#]/;

// The native file loader renders nested paths. Inspect them as data and allow
// only literal JSON/YAML settings outside fields used to select a provider.
function replayFileData(
  value: unknown,
  setting?: (path: string) => unknown,
  seen = new Set<object>(),
): unknown {
  if (typeof value === 'string' && value.startsWith('file://')) {
    if (!setting || !isProviderConfigFileReference(value) || TEMPLATE_MARKER.test(value)) {
      throw new Error('Cannot inspect a nested provider file safely');
    }
    return setting(value);
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Aliased provider files are not supported during replay');
    }
    seen.add(value);
    const visit = (child: unknown) => replayFileData(child, setting, seen);
    return Array.isArray(value)
      ? value.map(visit)
      : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  }
  return value;
}

function readReplayProviders(path: string, basePath?: string) {
  if (TEMPLATE_MARKER.test(path)) {
    throw new Error('Cannot identify the replay provider safely');
  }
  const data = readRawProviderConfigFile(path, basePath);
  return (Array.isArray(data) ? data : [data]).map((entry) => {
    const ref = normalizeProviderRef(entry);
    if (ref.kind !== 'options') {
      throw new Error('Provider file entries must have an ID');
    }
    const { config, ...metadata } = ref.loadOptions;
    replayFileData(metadata);
    replayFileData(config?.url);
    const localSettings = typeof config === 'object' && !isCloudProvider(ref.loadProviderPath);
    replayFileData(config, localSettings ? (path) => path : undefined);
    return ref;
  });
}

function isCodexSecurityPath(path: string) {
  return path === 'openai:codex-security' || path.startsWith('openai:codex-security:');
}

function getReplayProviderError(reference: ProviderRefDescriptor): string | undefined {
  const providerPath = 'loadProviderPath' in reference ? reference.loadProviderPath : undefined;
  if (providerPath && isCodexSecurityPath(providerPath)) {
    return 'Codex Security does not support prompt-only replay. Rerun using the eval configuration to preserve operation and report settings.';
  }
  if (
    reference.kind === 'unknown' ||
    (providerPath &&
      (isProviderConfigFileReference(providerPath) ||
        isCloudProvider(providerPath) ||
        TEMPLATE_MARKER.test(providerPath)))
  ) {
    return 'Cannot identify the replay provider safely. Rerun using the eval configuration.';
  }
  return undefined;
}

function replayEnvValue(template: string, env: ProviderOptions['env'], allowAmbient = false) {
  const match = /^\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/.exec(template);
  if (match?.[0] !== template || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    throw new Error('Cannot identify the replay provider safely');
  }
  const key = match[1];
  const value =
    env && Object.hasOwn(env, key) ? env[key] : allowAmbient && getTemplateEnvValue(key);
  if (typeof value !== 'string' || !value || TEMPLATE_MARKER.test(value)) {
    throw new Error('Cannot identify the replay provider safely');
  }
  return value;
}

// An environment-selected provider can only replay a local echo without operational options.
function replayEcho(
  path: string,
  env: ProviderOptions['env'],
  corroborated: boolean,
  options?: ProviderOptions,
) {
  const alias = options?.id === path ? undefined : options?.id;
  const dynamic = [alias, options?.label].some(
    (v) => v !== undefined && (typeof v !== 'string' || TEMPLATE_MARKER.test(v)),
  );
  const extra = Object.keys(options ?? {}).some(
    (k) =>
      !['id', 'label', 'env', 'prompts'].includes(k) &&
      !(k === 'config' && isDeepStrictEqual(options?.config, {})),
  );
  // An ID override can survive a change of provider. Only a saved environment
  // binding can identify that target, even if the override itself is "echo".
  const allowAmbient = corroborated && alias === undefined;
  if (dynamic || extra || replayEnvValue(path, env, allowAmbient) !== 'echo') {
    throw new Error('Cannot identify the replay provider safely');
  }
  return { id: alias ?? 'echo', ...(options?.label && { label: options.label }) };
}

function replayUrlTransport(path: string) {
  if (/^https?(?::|$)/.test(path)) {
    return 'http';
  }
  if (path === 'websocket' || /^wss?(?::|$)/.test(path)) {
    return 'websocket';
  }
  return undefined;
}

// Replace saved prompt filters while retaining routing and provider-specific options.
function prepareReplayCandidate<T>(
  provider: T,
  column: string | undefined,
  suiteEnv: ProviderOptions['env'],
  singleSource: boolean,
  corroboratedEcho = false,
) {
  const ref = normalizeProviderRef(provider);
  if (ref.kind !== 'options' && ref.kind !== 'map' && ref.kind !== 'named') {
    return provider;
  }
  let options = 'loadOptions' in ref ? ref.loadOptions : undefined;
  let path = ref.loadProviderPath;
  const env = { ...suiteEnv, ...options?.env };
  // Cloud labels depend on the remote environment, even when supplied locally.
  const deferLabel = isCloudProvider(path) && TEMPLATE_MARKER.test(options?.label ?? '');
  if (!deferLabel && options?.label && TEMPLATE_MARKER.test(options.label)) {
    // Ambient labels can swap between sources. Only use one to confirm a sole provider.
    const label = replayEnvValue(options.label, env, singleSource && !!column);
    options = { ...options, label };
  }
  if (!deferLabel && column && options?.label && options.label !== column) {
    return;
  }
  if (options?.id && options.id !== path && TEMPLATE_MARKER.test(options.id)) {
    throw new Error('Cannot identify the replay provider safely');
  }
  if (TEMPLATE_MARKER.test(path)) {
    options = replayEcho(path, env, corroboratedEcho, options);
    path = 'echo';
  } else if (ref.kind === 'named' && !isCloudProvider(path)) {
    // A bare string has no saved prompt filters. Wrapping it would override the native ID.
    return provider;
  } else if (
    options?.config?.url &&
    replayUrlTransport(path) &&
    TEMPLATE_MARKER.test(options.config.url)
  ) {
    // Inspect and execute the same destination, without rendering arbitrary template code.
    const url = replayEnvValue(options.config.url, env);
    options = { ...options, config: { ...options.config, url } };
  }
  return ref.kind === 'map'
    ? { [path]: { ...options, prompts: ['Replay'] } }
    : { ...options, id: path, prompts: ['Replay'] };
}

function replayProviderId(target: ProviderRefDescriptor) {
  if ('loadProviderPath' in target) {
    // URL providers ignore ID overrides. WebSocket columns also redact URL credentials.
    const path = target.loadProviderPath;
    const transport = replayUrlTransport(path);
    if (transport) {
      const url = ('loadOptions' in target && target.loadOptions.config?.url) || path;
      if (TEMPLATE_MARKER.test(url)) {
        throw new Error('Cannot identify the replay provider safely');
      }
      return transport === 'websocket' ? getSafeProviderId(url) : url;
    }
    const openAiId = getNamedOpenAiTextId(path);
    if (path === 'echo' || isCodexSecurityPath(path) || openAiId) {
      return target.kind === 'named' ? (openAiId ?? path) : target.id;
    }
  }
  // Other factories can choose their own ID, even when given an override.
  return undefined;
}

async function matchReplayTarget(
  ref: ProviderRefDescriptor,
  column: string | undefined,
  uniqueColumn: boolean,
  nativeGroup: string | undefined,
  suiteEnv: ProviderOptions['env'],
) {
  let cloud;
  let target = ref;
  if ('loadProviderPath' in ref && isCloudProvider(ref.loadProviderPath)) {
    try {
      const id = getCloudDatabaseId(ref.loadProviderPath);
      const options: ProviderOptions = 'loadOptions' in ref ? ref.loadOptions : {};
      cloud = { id, options, provider: await getProviderFromCloud(id, options) };
    } catch (error) {
      // A known collision or an unindexed request must never fall back to a different target.
      if (
        uniqueColumn &&
        nativeGroup &&
        nativeGroup !== column &&
        !ref.label &&
        ref.id !== column
      ) {
        return;
      }
      throw error;
    }
    if (TEMPLATE_MARKER.test(cloud.provider.id) || isCloudProvider(cloud.provider.id)) {
      throw new Error('Cannot identify the replay provider safely');
    }
    // Match the native loader's template scope: suite, Cloud, then entry.
    // Keep remote values in the pinned snapshot, outside the replay suite.
    const effective = prepareReplayCandidate(
      {
        ...cloud.provider,
        label: cloud.options.label ?? cloud.provider.label,
        config: { ...cloud.provider.config, ...cloud.options.config },
        env: { ...cloud.provider.env, ...cloud.options.env },
      },
      column,
      suiteEnv,
      false,
    );
    if (!effective) {
      return;
    }
    target = normalizeProviderRef(effective);
  }
  // Inspect the effective URL even when a label masks an unresolved cloud destination.
  const id = replayProviderId(target);
  const identity = target.label || id;
  if (TEMPLATE_MARKER.test(identity ?? target.id)) {
    throw new Error('Cannot identify the replay provider safely');
  }
  if (column && !identity) {
    // An unknown native ID can collide with any other source. Require a
    // distinct saved group per provider and corroborate the selected ID.
    if (!nativeGroup || (nativeGroup === column && target.id !== column)) {
      throw new Error('Ambiguous replay request');
    }
  }
  if (column && column !== (identity || nativeGroup)) {
    return;
  }
  return { target, cloud };
}

function replaySources(eval_: Eval, allowsProvider: (id: string, label?: string) => boolean) {
  const providers = eval_.config.providers ?? [];
  const sources = Array.isArray(providers) ? providers : [providers];
  let mutableIdentity = false;
  const resolved = sources
    .flatMap((source) => {
      const ref = normalizeProviderRef(source);
      if (ref.kind !== 'file') {
        mutableIdentity ||=
          'loadProviderPath' in ref &&
          isCloudProvider(ref.loadProviderPath) &&
          (!ref.label || TEMPLATE_MARKER.test(ref.label));
        return [{ provider: source, fromFile: false, ref }];
      }
      try {
        const entries = readReplayProviders(ref.loadProviderPath, eval_.config.basePath);
        mutableIdentity = true;
        return entries.map((entry) => ({
          provider: entry.loadOptions,
          fromFile: true,
          ref: entry,
        }));
      } catch {
        // A missing file could own the column even if a remaining label matches.
        throw new Error('Cannot inspect the replay provider file safely');
      }
    })
    .filter(({ ref }) => allowsProvider(ref.id, ref.label));
  const singleSource = sources.length === 1 && resolved.length === 1;
  return { singleSource, mutableIdentity, resolved };
}

async function selectReplayProvider(eval_: Eval, promptIndex?: number, recordedId?: string | null) {
  const { name, groups, unique, allowsProvider, allowsPrompts } = getReplayColumn(
    eval_,
    promptIndex,
  );
  const { singleSource, mutableIdentity, resolved } = replaySources(eval_, allowsProvider);
  if (promptIndex === undefined && !singleSource) {
    throw new Error('Ambiguous replay request');
  }
  const complete = groups.length === resolved.length && new Set(groups).size === groups.length;
  // Cloud and file labels can change since the evaluation. Never use their
  // current values alone to distinguish targets or fall back to another one.
  if (mutableIdentity && !complete) {
    throw new Error('Ambiguous replay request');
  }
  let selected;
  for (const [index, { provider, fromFile, ref }] of resolved.entries()) {
    const nativeGroup = complete ? groups[index] : undefined;
    const corroboratedEcho =
      recordedId === 'echo' || (!ref.label && (name ?? nativeGroup) === 'echo');
    const candidate = prepareReplayCandidate(
      provider,
      name,
      eval_.config.env,
      singleSource,
      corroboratedEcho,
    );
    if (candidate === undefined) {
      continue;
    }
    const match = await matchReplayTarget(
      normalizeProviderRef(candidate),
      name,
      unique,
      nativeGroup,
      eval_.config.env,
    );
    if (match) {
      if (selected || (name && mutableIdentity && groups[index] !== name)) {
        throw new Error('Ambiguous replay request');
      }
      selected = { candidate, fromFile, ref, ...match };
    }
  }
  if (!selected) {
    throw new Error('No matching replay provider');
  }
  const id = replayProviderId(selected.target) ?? selected.target.id;
  const selectors =
    ('loadOptions' in selected.ref ? selected.ref.loadOptions.prompts : undefined) ??
    selected.cloud?.provider.prompts;
  const { label } = selected.target;
  if (!allowsProvider(id, label) || !allowsPrompts(id, label, selectors)) {
    throw new Error('Provider excluded from the original evaluation');
  }
  return { ...selected, id };
}

function verifySavedReplayTarget(
  saved: Awaited<ReturnType<typeof EvalQueries.getReplayTarget>>,
  selection: Awaited<ReturnType<typeof selectReplayProvider>>,
) {
  // Cloud and file definitions can keep their labels after changing providers.
  // Without a recorded runtime ID their original target cannot be established.
  if (!saved) {
    if (selection.fromFile || selection.cloud) {
      throw new Error('No recorded provider for mutable replay target');
    }
    return;
  }
  if (saved.scanner || saved.id !== selection.id) {
    throw new Error('Cannot verify the original replay provider');
  }
  if (saved.linkedTargetId) {
    const linked = isCloudProvider(saved.linkedTargetId)
      ? getCloudDatabaseId(saved.linkedTargetId)
      : saved.linkedTargetId;
    const localLink =
      'loadOptions' in selection.target && selection.target.loadOptions.config?.linkedTargetId;
    if (selection.cloud ? linked !== selection.cloud.id : saved.linkedTargetId !== localLink) {
      throw new Error('Cloud target changed since evaluation');
    }
  }
}

evalRouter.post('/replay', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = EvalSchemas.Replay.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { evaluationId, promptIndex, prompt, variables } = bodyResult.data;

  try {
    // Load the evaluation to get the provider configuration
    const eval_ = await Eval.findById(evaluationId);
    if (!eval_) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    if (!eval_.config.providers) {
      res.status(400).json({ error: 'No providers found in evaluation' });
      return;
    }

    let selected;
    try {
      const saved = await EvalQueries.getReplayTarget(eval_.id, promptIndex);
      selected = await selectReplayProvider(eval_, promptIndex, saved?.id);
      const replayError = getReplayProviderError(selected.target);
      if (replayError) {
        res.status(400).json({ error: replayError });
        return;
      }
      verifySavedReplayTarget(saved, selected);
    } catch (error) {
      sendError(
        res,
        400,
        'Cannot resolve the replay provider. Rerun using the eval configuration.',
        error,
      );
      return;
    }

    const { cloud, target } = selected;
    let candidate = selected.candidate;
    if (selected.fromFile && !cloud && target.kind === 'options' && target.loadOptions.config) {
      // Only the approved provider may read its settings. Never render paths
      // or follow another level of indirection, including in a bound URL.
      try {
        replayFileData(target.loadOptions.config.url);
        const config = replayFileData(target.loadOptions.config, (path) =>
          replayFileData(readRawProviderConfigFile(path, eval_.config.basePath)),
        );
        candidate = { ...target.loadOptions, config };
      } catch {
        res
          .status(400)
          .json({ error: 'Cannot read provider settings. Rerun using the eval configuration.' });
        return;
      }
    }
    const evaluateReplay = () =>
      evaluateWithSource(
        {
          prompts: [{ raw: prompt, label: 'Replay' }],
          providers: [candidate],
          basePath: eval_.config.basePath,
          env: eval_.config.env,
          tests: [{ vars: (variables ?? {}) as Vars }],
        },
        {
          maxConcurrency: 1,
          showProgressBar: false,
          eventSource: 'web',
          cache: false, // Always disable cache for replays to get fresh results
        },
      );
    // Keep native cloud/local merge semantics without rereading a different target.
    const result = await (cloud
      ? withCloudProviderResolver((id, options) => {
          invariant(
            id === cloud.id && JSON.stringify(options ?? {}) === JSON.stringify(cloud.options),
            'Replay requested a provider outside the inspected selection',
          );
          return cloud.provider;
        }, evaluateReplay)
      : evaluateReplay());

    const summary = await result.toEvaluateSummary();

    // Better output extraction - handle different response structures
    const firstResult = summary.results[0];
    let output: unknown = firstResult?.response?.output;

    // If still no output, try the raw response
    if (output === undefined && firstResult?.response?.raw) {
      output = firstResult.response.raw;
    }

    // Serialize non-string outputs for UI compatibility
    // Frontend expects string output; structured outputs (JSON/tools) would render as [object Object]
    let serializedOutput: string;
    if (output === null || output === undefined) {
      serializedOutput = '';
    } else if (typeof output === 'string') {
      serializedOutput = output;
    } else {
      serializedOutput = JSON.stringify(output, null, 2);
    }

    // Return both output and any error information for debugging
    res.json(
      EvalSchemas.Replay.Response.parse({
        output: serializedOutput,
        error: firstResult?.response?.error,
        response: firstResult?.response, // Include full response for debugging
      }),
    );
  } catch (error) {
    logger.error(`Failed to replay evaluation: ${error}`);
    res.status(500).json({ error: 'Failed to replay evaluation' });
  }
});

evalRouter.post(
  '/:evalId/results/:id/rating',
  async (req: Request, res: Response): Promise<void> => {
    const paramsResult = EvalSchemas.SubmitRating.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }

    const bodyResult = EvalSchemas.SubmitRating.Request.safeParse(req.body);
    if (!bodyResult.success) {
      replyValidationError(res, bodyResult.error);
      return;
    }

    try {
      const { evalId, id } = paramsResult.data;
      // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with GradingResult
      const gradingResult = bodyResult.data as unknown as GradingResult;
      const result = await EvalResult.findById(id);
      if (!result || result.evalId !== evalId) {
        res.status(404).json({ error: 'Result not found' });
        return;
      }

      const eval_ = await Eval.findById(evalId);
      if (!eval_) {
        res.status(404).json({ error: 'Eval not found' });
        return;
      }

      // Capture the current state before we change it
      const hasExistingManualOverride = Boolean(
        result.gradingResult?.componentResults?.some(
          (r) => r.assertion?.type === HUMAN_ASSERTION_TYPE,
        ),
      );
      const successChanged = result.success !== gradingResult.pass;
      const scoreChange = gradingResult.score - result.score;

      // Update the result
      result.gradingResult = gradingResult;
      result.success = gradingResult.pass;
      result.score = gradingResult.score;

      // Update the prompt metrics
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt, 'Prompt not found');
      if (!prompt.metrics) {
        logger.error(
          `[${id}] This is not normal. Prompt metrics not found for prompt ${result.promptIdx}`,
        );

        res.status(400).json({ error: 'Prompt metrics not found' });
        return;
      }

      if (successChanged) {
        if (result.success) {
          // Result changed from fail to pass
          prompt.metrics.testPassCount += 1;
          prompt.metrics.testFailCount -= 1;
          prompt.metrics.assertPassCount += 1;
          prompt.metrics.score += scoreChange;
          if (hasExistingManualOverride) {
            // If there was an existing manual override, we need to decrement the assertFailCount because it changed from fail to pass
            prompt.metrics.assertFailCount -= 1;
          }
        } else {
          prompt.metrics.testPassCount -= 1;
          prompt.metrics.testFailCount += 1;
          prompt.metrics.assertFailCount += 1;
          prompt.metrics.score += scoreChange;
          if (hasExistingManualOverride) {
            // If there was an existing manual override, we need to decrement the assertPassCount because it changed from pass to fail
            prompt.metrics.assertPassCount -= 1;
          }
        }
      } else if (!hasExistingManualOverride) {
        // Nothing changed, so the user just added an assertion
        if (result.success) {
          prompt.metrics.assertPassCount += 1;
        } else {
          prompt.metrics.assertFailCount += 1;
        }
      }

      await result.save();
      await eval_.save();

      res.json(EvalSchemas.SubmitRating.Response.parse(result));
    } catch (error) {
      sendError(res, 500, 'Failed to submit rating', error);
    }
  },
);

evalRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = EvalSchemas.Save.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const body = bodyResult.data;
  try {
    if (body.data) {
      // v3 format: { data: { results, config } }
      logger.debug('[POST /api/eval] Saving eval results (v3) to database');
      // Double-cast needed: Zod's .passthrough() adds index signature that doesn't overlap with ResultsFile
      const payload = body.data as unknown as ResultsFile;
      const id = await writeResultsToDatabase(payload.results as EvaluateSummaryV2, payload.config);
      res.json(EvalSchemas.Save.Response.parse({ id }));
    } else {
      // v4 format: { config, prompts, results, ... }
      if (!body.results || !body.config) {
        res.status(400).json({
          error: 'Missing required fields: results and config are required for v4 format',
        });
        return;
      }
      const incEval = body as unknown as Eval;
      logger.debug('[POST /api/eval] Saving eval results (v4) to database');
      const eval_ = await Eval.create(incEval.config, incEval.prompts || [], {
        author: incEval.author,
        // Use !== undefined to handle createdAt=0 (Unix epoch)
        createdAt: incEval.createdAt === undefined ? undefined : new Date(incEval.createdAt),
        results: incEval.results,
        vars: incEval.vars,
      });
      if (incEval.prompts) {
        await eval_.addPrompts(incEval.prompts);
      }
      logger.debug(`[POST /api/eval] Eval created with ID: ${eval_.id}`);

      logger.debug(`[POST /api/eval] Saved ${incEval.results.length} results to eval ${eval_.id}`);

      res.json(EvalSchemas.Save.Response.parse({ id: eval_.id }));
    }
  } catch (error) {
    logger.error('Failed to write eval to database', {
      error,
      body: sanitizeObject(body, { context: 'request body' }),
    });
    res.status(500).json({ error: 'Failed to write eval to database' });
  }
});

evalRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Delete.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  try {
    await deleteEval(id);
    res.json(EvalSchemas.Delete.Response.parse({ message: 'Eval deleted successfully' }));
  } catch (error) {
    logger.error('[DELETE /eval/:id] Failed to delete eval', {
      evalId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message === `Eval with ID ${id} not found`) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }

    res.status(500).json({ error: 'Failed to delete eval' });
  }
});

/**
 * Bulk delete evals.
 */
evalRouter.delete('/', async (req: Request, res: Response) => {
  const bodyResult = EvalSchemas.BulkDelete.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { ids } = bodyResult.data;

  try {
    await deleteEvals(ids);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete evals' });
  }
});

/**
 * Copy an eval with all its results and relationships.
 */
evalRouter.post('/:id/copy', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = EvalSchemas.Copy.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const bodyResult = EvalSchemas.Copy.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { id } = paramsResult.data;
  const { description } = bodyResult.data;

  try {
    const sourceEval = await Eval.findById(id);
    if (!sourceEval) {
      res.status(404).json({ error: 'Eval not found' });
      return;
    }

    // Get distinct test count for response and pass to copy to avoid duplicate query
    const distinctTestCount = await sourceEval.getResultsCount();

    // Create copy
    const newEval = await sourceEval.copy(description, distinctTestCount);

    logger.info('Eval copied via API', {
      sourceEvalId: id,
      targetEvalId: newEval.id,
      distinctTestCount,
    });

    const response = EvalSchemas.Copy.Response.parse({
      id: newEval.id,
      distinctTestCount,
    });

    res.status(201).json(response);
  } catch (error) {
    logger.error('Failed to copy eval', {
      error,
      evalId: id,
    });
    res.status(500).json({ error: 'Failed to copy evaluation' });
  }
});
