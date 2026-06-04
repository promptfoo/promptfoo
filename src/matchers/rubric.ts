import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import fs from 'fs/promises';
import path from 'path';

import { loadFromJavaScriptFile } from '../assertions/utils';
import { getBlobByHash } from '../blobs';
import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import cliState from '../cliState';
import { getEnvBool, getEnvInt } from '../envars';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
import { fetchWithTimeout } from '../util/fetch/index';
import { getNunjucksEngineForFilePath, maybeLoadFromExternalFile } from '../util/file';
import { isJavascriptFile } from '../util/fileExtensions';
import { parseFileUrl } from '../util/functions/loadFunction';
import invariant from '../util/invariant';
import { extractJsonObjects, safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { graderFail, normalizeMatcherTokenUsage } from './shared';

import type {
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ImageOutput,
  ProviderResponse,
  VarValue,
} from '../types/index';

const nunjucks = getNunjucksEngine(undefined, false, true);
const DEFAULT_GRADING_IMAGE_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_GRADING_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_GRADING_IMAGE_REDIRECTS = 5;
const MULTIMODAL_GRADING_INSTRUCTION =
  'The evaluated output includes the attached image(s). Treat the attached image(s) as part of <Output>. Grade visual content as well as any text according to the rubric.';

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
      try {
        rubricPrompt = await fs.readFile(resolvedPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File does not exist: ${resolvedPath}`);
        }
        throw error;
      }
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

type MultimodalPromptPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessageLike = {
  role?: unknown;
  content?: unknown;
  [key: string]: unknown;
};

function isChatMessageArray(value: unknown): value is ChatMessageLike[] {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        message !== null &&
        typeof message === 'object' &&
        typeof (message as ChatMessageLike).role === 'string',
    )
  );
}

function normalizeBase64ImageData(data: string, mimeType?: string): string {
  const trimmed = data.trim();
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  return `data:${mimeType || 'image/png'};base64,${trimmed}`;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }
  return false;
}

async function isPrivateImageUrl(url: URL): Promise<boolean> {
  if (getEnvBool('PROMPTFOO_ALLOW_GRADING_IMAGE_PRIVATE_URLS', false)) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }

  if (isPrivateAddress(hostname)) {
    return true;
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some(({ address }) => isPrivateAddress(address));
  } catch (error) {
    logger.warn('[Rubric] Failed to resolve image URL before grading', {
      error,
      url: url.toString(),
    });
    return true;
  }
}

function getResponseContentLength(response: Response): number | undefined {
  const contentLength = response.headers.get('content-length');
  if (!contentLength) {
    return undefined;
  }

  const parsed = Number(contentLength);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function hydrateImageUrl(url: string, mimeType?: string): Promise<string | undefined> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return undefined;
  }

  const maxBytes = getEnvInt('PROMPTFOO_GRADING_IMAGE_MAX_BYTES', DEFAULT_GRADING_IMAGE_MAX_BYTES);
  const timeoutMs = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_FETCH_TIMEOUT_MS',
    DEFAULT_GRADING_IMAGE_FETCH_TIMEOUT_MS,
  );

  try {
    let currentUrl = parsedUrl;
    let response: Response | undefined;

    for (let redirects = 0; redirects <= MAX_GRADING_IMAGE_REDIRECTS; redirects++) {
      if (await isPrivateImageUrl(currentUrl)) {
        logger.warn('[Rubric] Skipping private image URL hydration for grading', {
          url: currentUrl.toString(),
        });
        return undefined;
      }

      response = await fetchWithTimeout(currentUrl.toString(), { redirect: 'manual' }, timeoutMs);
      if (response.status < 300 || response.status >= 400) {
        break;
      }

      const location = response.headers.get('location');
      if (!location) {
        break;
      }

      if (redirects === MAX_GRADING_IMAGE_REDIRECTS) {
        logger.warn('[Rubric] Too many redirects while hydrating image URL for grading', {
          url: parsedUrl.toString(),
        });
        return undefined;
      }

      currentUrl = new URL(location, currentUrl);
      if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
        return undefined;
      }
    }

    if (!response) {
      return undefined;
    }

    if (!response.ok) {
      logger.warn('[Rubric] Failed to hydrate image URL for grading', {
        status: response.status,
        statusText: response.statusText,
        url: currentUrl.toString(),
      });
      return undefined;
    }

    const contentLength = getResponseContentLength(response);
    if (contentLength !== undefined && contentLength > maxBytes) {
      logger.warn('[Rubric] Skipping oversized image URL for grading', {
        contentLength,
        maxBytes,
        url: currentUrl.toString(),
      });
      return undefined;
    }

    const responseMimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (responseMimeType && !responseMimeType.startsWith('image/')) {
      logger.warn('[Rubric] Skipping non-image URL for grading', {
        contentType: responseMimeType,
        url: currentUrl.toString(),
      });
      return undefined;
    }

    const resolvedMimeType = mimeType || responseMimeType || 'image/png';
    if (!resolvedMimeType.startsWith('image/')) {
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      logger.warn('[Rubric] Skipping oversized image URL for grading', {
        contentLength: buffer.byteLength,
        maxBytes,
        url: currentUrl.toString(),
      });
      return undefined;
    }

    return `data:${resolvedMimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.warn('[Rubric] Failed to hydrate image URL for grading', {
      error,
      url: parsedUrl.toString(),
    });
    return undefined;
  }
}

async function imageOutputToImageUrl(image: ImageOutput): Promise<string | undefined> {
  const dataBlobHash = image.data ? extractBlobHashesFromValue(image.data)[0] : undefined;
  if (image.data?.trim().startsWith('http')) {
    return (await hydrateImageUrl(image.data.trim(), image.mimeType)) || image.data.trim();
  }

  if (image.data && !dataBlobHash) {
    return normalizeBase64ImageData(image.data, image.mimeType);
  }

  const blobHash = image.blobRef?.hash || dataBlobHash;
  if (!blobHash) {
    return undefined;
  }

  try {
    const blob = await getBlobByHash(blobHash);
    const mimeType =
      image.mimeType || image.blobRef?.mimeType || blob.metadata.mimeType || 'image/png';
    return `data:${mimeType};base64,${blob.data.toString('base64')}`;
  } catch (error) {
    logger.warn('[Rubric] Failed to load image blob for grading', {
      error,
      hash: blobHash,
    });
    return undefined;
  }
}

function appendImagesToContent(
  content: unknown,
  imageParts: MultimodalPromptPart[],
): MultimodalPromptPart[] {
  if (Array.isArray(content)) {
    return [...content, ...imageParts] as MultimodalPromptPart[];
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }, ...imageParts];
  }

  if (content === undefined || content === null) {
    return imageParts;
  }

  return [{ type: 'text', text: JSON.stringify(content) }, ...imageParts];
}

function appendImagesToChatPrompt(renderedPrompt: string, imageUrls: string[]): string {
  const imageParts: MultimodalPromptPart[] = [
    {
      type: 'text',
      text: MULTIMODAL_GRADING_INSTRUCTION,
    },
    ...imageUrls.map<MultimodalPromptPart>((url) => ({
      type: 'image_url',
      image_url: { url },
    })),
  ];

  try {
    const parsed = JSON.parse(renderedPrompt);
    if (isChatMessageArray(parsed)) {
      const messages = parsed.map((message) => ({ ...message }));
      let userMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userMessageIndex = i;
          break;
        }
      }

      if (userMessageIndex >= 0) {
        const userMessage = messages[userMessageIndex];
        messages[userMessageIndex] = {
          ...userMessage,
          content: appendImagesToContent(userMessage.content, imageParts),
        };
      } else {
        messages.push({ role: 'user', content: imageParts });
      }

      return JSON.stringify(messages);
    }
  } catch {
    // Non-JSON prompts are still valid text prompts. Wrap them below.
  }

  return JSON.stringify([
    {
      role: 'user',
      content: [{ type: 'text', text: renderedPrompt }, ...imageParts],
    },
  ]);
}

async function buildGradingProviderPrompt(
  renderedPrompt: string,
  images?: ImageOutput[],
): Promise<{ prompt: string; imageCount: number }> {
  if (!images?.length) {
    return { prompt: renderedPrompt, imageCount: 0 };
  }

  const imageUrls = (await Promise.all(images.map(imageOutputToImageUrl))).filter(
    (url): url is string => Boolean(url),
  );

  if (imageUrls.length === 0) {
    return { prompt: renderedPrompt, imageCount: 0 };
  }

  return {
    prompt: appendImagesToChatPrompt(renderedPrompt, imageUrls),
    imageCount: imageUrls.length,
  };
}

function parseJsonGradingResponse(
  label: string,
  resp: ProviderResponse,
): { parsed?: Partial<GradingResult>; failure?: Omit<GradingResult, 'assertion'> } {
  const failWithTokens = (reason: string) => graderFail(reason, resp.tokenUsage);

  let jsonObjects: unknown[] = [];
  if (typeof resp.output === 'string') {
    try {
      jsonObjects = extractJsonObjects(resp.output);
      if (jsonObjects.length === 0) {
        return { failure: failWithTokens(`Could not extract JSON from ${label} response`) };
      }
    } catch (err) {
      return {
        failure: failWithTokens(`${label} produced malformed response: ${err}\n\n${resp.output}`),
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
      failure: failWithTokens(
        `${label} produced malformed response - output must be string or object. Output: ${JSON.stringify(resp.output)}`,
      ),
    };
  }

  const parsed = jsonObjects[0];
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      failure: failWithTokens(
        `${label} produced malformed response. We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
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
  images,
}: {
  assertion?: Assertion;
  checkName: string;
  defaultPrompt: string;
  grading: GradingConfig;
  label: string;
  providerCallContext?: CallApiContextParams;
  throwOnError?: boolean;
  vars: Record<string, VarValue>;
  images?: ImageOutput[];
}): Promise<GradingResult> {
  const rubricPrompt = await loadRubricPrompt(grading.rubricPrompt, defaultPrompt);
  const renderedPrompt = await renderLlmRubricPrompt(rubricPrompt, vars);
  const { prompt: providerPrompt, imageCount } = await buildGradingProviderPrompt(
    renderedPrompt,
    images,
  );

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
    providerPrompt,
    label,
    vars,
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    if (throwOnError) {
      throw new Error(resp.error || 'No output');
    }
    return graderFail(resp.error || 'No output', resp.tokenUsage);
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
      renderedGradingPrompt: renderedPrompt,
      ...(imageCount > 0 ? { renderedGradingPromptImages: imageCount } : {}),
    },
  };
}
