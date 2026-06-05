import fs from 'fs/promises';
import path from 'path';

import { loadFromJavaScriptFile } from '../assertions/utils';
import cliState from '../cliState';
import { getEnvBool, getEnvInt } from '../envars';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
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
const DEFAULT_GRADING_MAX_IMAGES = 4;
const DEFAULT_GRADING_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_GRADING_IMAGE_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MULTIMODAL_GRADING_INSTRUCTION =
  'The evaluated output includes the attached image(s). Treat the attached image(s) as part of <Output>. Grade visual content as well as any text according to the rubric.';
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{64})/i;

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

function hasBlobRefImageValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return BLOB_URI_REGEX.test(value);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { hash?: unknown; uri?: unknown };
  if (typeof candidate.hash === 'string' && BLOB_HASH_REGEX.test(candidate.hash)) {
    return true;
  }
  if (typeof candidate.uri === 'string') {
    return hasBlobRefImageValue(candidate.uri);
  }

  return false;
}

function getBase64ImageData(data: string): string {
  const trimmed = data.trim();
  if (!trimmed.startsWith('data:')) {
    return trimmed;
  }

  const [metadata, payload] = trimmed.split(',', 2);
  if (!payload || !metadata.toLowerCase().includes(';base64')) {
    throw new Error(
      'Only base64-encoded data URI image outputs are supported for multimodal grading.',
    );
  }
  if (!metadata.toLowerCase().startsWith('data:image/')) {
    throw new Error('Only image data URI outputs are supported for multimodal grading.');
  }

  return payload;
}

function getBase64DecodedBytes(base64Data: string): number {
  const normalized = base64Data.replace(/\s/g, '');
  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function imageOutputToImageUrl(
  image: ImageOutput,
): { output: ImageOutput; url: string; decodedBytes: number } | undefined {
  if (image.blobRef || hasBlobRefImageValue(image.data)) {
    throw new Error(
      'Blob-backed image outputs are not supported for multimodal grading yet. Configure the image provider to return base64 or data URI image output.',
    );
  }

  if (image.data) {
    const data = image.data.trim();
    if (/^https?:\/\//i.test(data)) {
      throw new Error(
        'Remote image URLs are not supported for multimodal grading. Provide local image output as a data URI or raw base64 string instead.',
      );
    }

    const url = normalizeBase64ImageData(image.data, image.mimeType);
    return {
      output: {
        data: url,
        ...(image.mimeType ? { mimeType: image.mimeType } : {}),
      },
      url,
      decodedBytes: getBase64DecodedBytes(getBase64ImageData(image.data)),
    };
  }

  return undefined;
}

export function materializeImageOutputsForGrading(images?: ImageOutput[]): {
  imageOutputs: ImageOutput[];
  imageUrls: string[];
} {
  if (!images?.length) {
    return { imageOutputs: [], imageUrls: [] };
  }

  const maxImages = getEnvInt('PROMPTFOO_GRADING_MAX_IMAGES', DEFAULT_GRADING_MAX_IMAGES);
  if (images.length > maxImages) {
    throw new Error(
      `Too many images for multimodal grading: received ${images.length}, maximum is ${maxImages}.`,
    );
  }

  const maxImageBytes = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_BYTES',
    DEFAULT_GRADING_IMAGE_MAX_BYTES,
  );
  const maxTotalImageBytes = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_TOTAL_BYTES',
    DEFAULT_GRADING_IMAGE_MAX_TOTAL_BYTES,
  );
  const materializedImages = images
    .map(imageOutputToImageUrl)
    .filter((image): image is { output: ImageOutput; url: string; decodedBytes: number } =>
      Boolean(image),
    );

  let totalImageBytes = 0;
  for (const image of materializedImages) {
    if (image.decodedBytes > maxImageBytes) {
      throw new Error(
        `Image output exceeds multimodal grading size limit: ${image.decodedBytes} bytes, maximum is ${maxImageBytes}.`,
      );
    }
    totalImageBytes += image.decodedBytes;
    if (totalImageBytes > maxTotalImageBytes) {
      throw new Error(
        `Image outputs exceed multimodal grading total size limit: ${totalImageBytes} bytes, maximum is ${maxTotalImageBytes}.`,
      );
    }
  }

  return {
    imageOutputs: materializedImages.map((image) => image.output),
    imageUrls: materializedImages.map((image) => image.url),
  };
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

  const { imageUrls } = materializeImageOutputsForGrading(images);

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
