import * as fs from 'fs';
import path from 'path';

import { loadFromJavaScriptFile } from '../assertions/utils';
import cliState from '../cliState';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
import { getNunjucksEngineForFilePath, maybeLoadFromExternalFile } from '../util/file';
import { isJavascriptFile } from '../util/fileExtensions';
import { parseFileUrl } from '../util/functions/loadFunction';
import invariant from '../util/invariant';
import { extractJsonObjects, safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { fail, normalizeMatcherTokenUsage } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderResponse,
  VarValue,
} from '../types/index';

const nunjucks = getNunjucksEngine(undefined, false, true);

export class LlmRubricProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRubricProviderError';
  }
}

export async function loadRubricPrompt(
  rubricPrompt: string | object | undefined,
  defaultPrompt: string,
): Promise<string> {
  if (!rubricPrompt) {
    return defaultPrompt;
  }

  if (typeof rubricPrompt === 'object' && Object.keys(rubricPrompt).length === 0) {
    return defaultPrompt;
  }

  if (typeof rubricPrompt === 'string' && rubricPrompt.startsWith('file://')) {
    const basePath = cliState.basePath || '';

    // Render Nunjucks templates in the file path (e.g., file://{{ env.RUBRIC_PATH }}/rubric.json)
    const renderedFilePath = getNunjucksEngineForFilePath().renderString(rubricPrompt, {});

    // Parse the file URL to extract file path and function name
    // This handles colon splitting correctly, including Windows drive letters and :functionName suffix
    const { filePath, functionName } = parseFileUrl(renderedFilePath);
    const resolvedPath = path.resolve(basePath, filePath);

    if (isJavascriptFile(filePath)) {
      rubricPrompt = await loadFromJavaScriptFile(resolvedPath, functionName, []);
    } else {
      // For non-JS files (including .json, .yaml, .txt), load as raw text
      // to allow Nunjucks templating before JSON/YAML parsing.
      // This fixes the issue where .json files with Nunjucks templates
      // would fail to parse before rendering.
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }
      rubricPrompt = fs.readFileSync(resolvedPath, 'utf8');
    }
  } else {
    // Load from external file if needed (for non file:// references)
    rubricPrompt = maybeLoadFromExternalFile(rubricPrompt);
  }

  if (typeof rubricPrompt === 'object') {
    rubricPrompt = JSON.stringify(rubricPrompt);
  }

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  return rubricPrompt;
}

function processContextForTemplating(
  context: Record<string, VarValue>,
  enableObjectAccess: boolean,
): Record<string, VarValue> {
  if (enableObjectAccess) {
    return context;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          return [
            key,
            value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : item)),
          ];
        }
        return [key, JSON.stringify(value)];
      }
      return [key, value];
    }),
  );
}

export async function renderLlmRubricPrompt(
  rubricPrompt: string,
  context: Record<string, VarValue>,
) {
  const enableObjectAccess = getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY', false);
  const processedContext = processContextForTemplating(context, enableObjectAccess);

  try {
    // Render every string scalar within the JSON
    // Does not render object keys (only values)
    const parsed = JSON.parse(rubricPrompt, (_k, v) =>
      typeof v === 'string' ? nunjucks.renderString(v, processedContext) : v,
    );
    return JSON.stringify(parsed);
  } catch (err) {
    // Not valid JSON - fall through to legacy Nunjucks rendering below.
    logger.debug(
      `[Rubric] Rubric prompt is not valid JSON, using Nunjucks rendering: ${(err as Error).message}`,
    );
  }

  // Legacy rendering for non-JSON prompts
  return nunjucks.renderString(rubricPrompt, processedContext);
}

function parseJsonGradingResponse(
  label: string,
  resp: ProviderResponse,
): { parsed?: Partial<GradingResult>; failure?: Omit<GradingResult, 'assertion'> } {
  let jsonObjects: unknown[] = [];
  if (typeof resp.output === 'string') {
    try {
      jsonObjects = extractJsonObjects(resp.output);
      if (jsonObjects.length === 0) {
        return {
          failure: fail(`Could not extract JSON from ${label} response`, resp.tokenUsage),
        };
      }
    } catch (err) {
      return {
        failure: fail(
          `${label} produced malformed response: ${err}\n\n${resp.output}`,
          resp.tokenUsage,
        ),
      };
    }
  } else if (
    typeof resp.output === 'object' &&
    resp.output !== null &&
    !Array.isArray(resp.output)
  ) {
    jsonObjects = [resp.output];
  } else {
    return {
      failure: fail(
        `${label} produced malformed response - output must be string or object. Output: ${JSON.stringify(resp.output)}`,
        resp.tokenUsage,
      ),
    };
  }

  const parsed = jsonObjects[0];
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      failure: fail(
        `${label} produced malformed response. We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
        resp.tokenUsage,
      ),
    };
  }

  return { parsed: parsed as Partial<GradingResult> };
}

export async function runJsonGradingPrompt({
  assertion,
  checkName,
  defaultPrompt,
  grading,
  label,
  providerCallContext,
  throwOnError,
  vars,
}: {
  assertion?: Assertion;
  checkName: string;
  defaultPrompt: string;
  grading: GradingConfig;
  label: string;
  providerCallContext?: CallApiContextParams;
  throwOnError?: boolean;
  vars: Record<string, VarValue>;
}): Promise<GradingResult> {
  const rubricPrompt = await loadRubricPrompt(grading.rubricPrompt, defaultPrompt);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, vars);

  const defaultProviders = await getDefaultProviders();
  const defaultProvider =
    defaultProviders.llmRubricProvider || defaultProviders.gradingJsonProvider;
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    checkName,
  );
  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    label,
    vars,
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    if (throwOnError) {
      throw new Error(resp.error || 'No output');
    }
    return fail(resp.error || 'No output', resp.tokenUsage);
  }
  const { parsed, failure } = parseJsonGradingResponse(label, resp);
  if (!parsed) {
    return failure as Omit<GradingResult, 'assertion'>;
  }

  let pass = parsed.pass ?? true;
  if (typeof pass !== 'boolean') {
    pass = /^(true|yes|pass|y)$/i.test(String(pass));
  }

  let score = parsed.score;
  if (typeof score !== 'number') {
    score = Number.isFinite(Number(score)) ? Number(score) : Number(pass);
  }

  const threshold =
    typeof assertion?.threshold === 'string' ? Number(assertion.threshold) : assertion?.threshold;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    pass = pass && score >= threshold;
  }

  const reason =
    parsed.reason || (pass ? 'Grading passed' : `Score ${score} below threshold ${threshold}`);

  let responseMetadata: Record<string, unknown> = {};
  if (resp.metadata && typeof resp.metadata === 'object' && !Array.isArray(resp.metadata)) {
    const serializedMetadata = safeJsonStringify(resp.metadata);
    responseMetadata = serializedMetadata
      ? (JSON.parse(serializedMetadata) as Record<string, unknown>)
      : {};
  }

  return {
    assertion,
    pass,
    score,
    reason,
    tokensUsed: normalizeMatcherTokenUsage({
      ...resp.tokenUsage,
      completionDetails: resp.tokenUsage?.completionDetails || parsed.tokensUsed?.completionDetails,
    }),
    metadata: {
      ...responseMetadata,
      renderedGradingPrompt: prompt,
    },
  };
}
