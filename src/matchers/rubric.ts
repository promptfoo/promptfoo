import fs from 'fs/promises';
import path from 'path';

import async from 'async';
import yaml from 'js-yaml';
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
import { graderFail, MULTIMODAL_GRADING_INSTRUCTION, normalizeMatcherTokenUsage } from './shared';

import type {
  ApiProvider,
  Assertion,
  CallApiContextParams,
  GradingBlobResolver,
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
// Headroom added per image for the `data:image/...;base64,` prefix when deriving
// the raw-character cap from a byte limit.
const DATA_URI_METADATA_MAX_CHARS = 256;
const BLOB_HASH_REGEX = /^[a-f0-9]{64}$/i;
const BLOB_URI_REGEX = /promptfoo:\/\/blob\/([a-f0-9]{64})/i;
const RESPONSES_PROVIDER_CLASS_NAMES = new Set([
  'AzureResponsesProvider',
  'BedrockOpenAiResponsesProvider',
  'GroqResponsesProvider',
  'OpenAiResponsesProvider',
  'OpenClawResponsesProvider',
  'XAIResponsesProvider',
]);

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
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      inlineData: { mimeType: string; data: string };
    };

type MultimodalPromptFormat = 'anthropic' | 'google' | 'openai' | 'responses';

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

function isValidBase64Payload(data: string): boolean {
  // Accept both the standard (`+`/`/`) and URL-safe (`-`/`_`) base64 alphabets.
  // Providers that forward upstream bytes (HTTP/custom/Python) commonly emit
  // base64url, and `ImageOutput.data` is documented as "data URI or base64".
  if (!data || data.length % 4 === 1 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) {
    return false;
  }

  const firstPaddingIndex = data.indexOf('=');
  if (firstPaddingIndex === -1) {
    return true;
  }

  const padding = data.slice(firstPaddingIndex);
  return padding.length <= 2 && /^=+$/.test(padding);
}

/**
 * Canonicalize a (possibly URL-safe, possibly unpadded) base64 string to the
 * standard alphabet with padding, so downstream data URI / Anthropic / Google
 * payloads are always well-formed regardless of the encoding the provider used.
 */
function toStandardBase64(base64: string): string {
  const standardized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = standardized.length % 4;
  return remainder === 0 ? standardized : standardized + '='.repeat(4 - remainder);
}

function normalizeBase64ImageData(
  data: string,
  mimeType?: string,
): { dataUri: string; base64Data: string; mimeType: string; decodedBytes: number } {
  const trimmed = data.trim();
  if (!trimmed) {
    throw new Error('Image output data must contain non-empty base64 image data.');
  }

  let normalizedMimeType = mimeType || 'image/png';
  let payload = trimmed;
  if (trimmed.startsWith('data:')) {
    // Split on the first comma only; the base64 alphabet never contains a comma,
    // so anything after it is part of the payload (`split(',', 2)` would drop it).
    const commaIndex = trimmed.indexOf(',');
    const metadata = commaIndex === -1 ? '' : trimmed.slice(0, commaIndex);
    const rawPayload = commaIndex === -1 ? '' : trimmed.slice(commaIndex + 1);
    if (!rawPayload || !metadata.toLowerCase().includes(';base64')) {
      throw new Error(
        'Only base64-encoded data URI image outputs are supported for multimodal grading.',
      );
    }
    if (!metadata.toLowerCase().startsWith('data:image/')) {
      throw new Error('Only image data URI outputs are supported for multimodal grading.');
    }

    normalizedMimeType = metadata.slice('data:'.length).split(';', 1)[0].trim();
    payload = rawPayload;
  }

  // Strip whitespace (some providers line-wrap base64) and accept both the
  // standard and URL-safe alphabets. URL-safe input is canonicalized to standard
  // base64 (with padding) so downstream data URI / provider payloads are
  // well-formed; standard base64 is left untouched to preserve existing outputs.
  const rawBase64 = payload.replace(/\s/g, '');
  if (!isValidBase64Payload(rawBase64)) {
    throw new Error(
      'Image output data is not valid base64. Provide a base64 or base64url encoded image, optionally wrapped in a data: URI.',
    );
  }
  const base64Data = /[-_]/.test(rawBase64) ? toStandardBase64(rawBase64) : rawBase64;

  const decodedBytes = getBase64DecodedBytes(base64Data);
  if (decodedBytes <= 0) {
    throw new Error('Image output data must contain non-empty base64 image data.');
  }

  return {
    dataUri: `data:${normalizedMimeType};base64,${base64Data}`,
    base64Data,
    mimeType: normalizedMimeType,
    decodedBytes,
  };
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

function getBase64DecodedBytes(base64Data: string): number {
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

function imageOutputToImageUrl(
  image: ImageOutput,
): { output: ImageOutput; dataUri: string; base64Data: string; mimeType: string } | undefined {
  if (image.blobRef || hasBlobRefImageValue(image.data)) {
    // Blob-backed outputs should have been resolved by resolveBlobBackedImageOutputs
    // before reaching here; if one slips through, fail loudly rather than silently drop it.
    throw new Error(
      'Blob-backed image output could not be resolved for multimodal grading. Ensure the blob store is reachable, or configure the image provider to return base64 or data URI image output.',
    );
  }

  if (image.data) {
    const data = image.data.trim();
    if (/^https?:\/\//i.test(data)) {
      throw new Error(
        'Remote image URLs are not supported for multimodal grading. Provide local image output as a data URI or raw base64 string instead.',
      );
    }

    const normalized = normalizeBase64ImageData(image.data, image.mimeType);
    return {
      output: {
        data: normalized.dataUri,
        mimeType: normalized.mimeType,
      },
      dataUri: normalized.dataUri,
      base64Data: normalized.base64Data,
      mimeType: normalized.mimeType,
    };
  }

  return undefined;
}

function getBlobHashForImage(image: ImageOutput): string | undefined {
  if (typeof image.blobRef?.hash === 'string' && BLOB_HASH_REGEX.test(image.blobRef.hash)) {
    return image.blobRef.hash;
  }
  if (typeof image.data === 'string') {
    return BLOB_URI_REGEX.exec(image.data)?.[1];
  }
  return undefined;
}

type GradingImageLimits = {
  maxImages: number;
  maxImageBytes: number;
  maxTotalImageBytes: number;
  maxRawChars: number;
  maxTotalRawChars: number;
};

function getGradingImageLimits(): GradingImageLimits {
  const maxImages = getEnvInt('PROMPTFOO_GRADING_MAX_IMAGES', DEFAULT_GRADING_MAX_IMAGES);
  const maxImageBytes = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_BYTES',
    DEFAULT_GRADING_IMAGE_MAX_BYTES,
  );
  const maxTotalImageBytes = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_TOTAL_BYTES',
    DEFAULT_GRADING_IMAGE_MAX_TOTAL_BYTES,
  );
  // Derive the raw-char caps from the *resolved* byte limits (not the compile-time
  // defaults) so raising PROMPTFOO_GRADING_IMAGE_MAX_BYTES alone is sufficient and
  // isn't silently clamped by a separate raw-char default.
  const maxRawChars = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_RAW_CHARS',
    Math.ceil(maxImageBytes / 3) * 4 + DATA_URI_METADATA_MAX_CHARS,
  );
  const maxTotalRawChars = getEnvInt(
    'PROMPTFOO_GRADING_IMAGE_MAX_TOTAL_RAW_CHARS',
    Math.ceil(maxTotalImageBytes / 3) * 4 + maxImages * DATA_URI_METADATA_MAX_CHARS,
  );
  return { maxImages, maxImageBytes, maxTotalImageBytes, maxRawChars, maxTotalRawChars };
}

// Reads are already count-capped to maxImages (default 4); this bounds memory if the cap is raised.
const BLOB_READ_CONCURRENCY = 4;

/**
 * Resolve blob-backed image outputs to inline base64 data URIs so they can be
 * attached to the grading prompt. The evaluator externalizes any image output
 * larger than `BLOB_MIN_SIZE` (1KiB) to `images[].blobRef` before assertions run,
 * so without this step the headline "grade an image output" workflow would error.
 *
 * Resource guards run in stages so no work is wasted on rejected payloads: the
 * image-count cap and the declared `blobRef.sizeBytes` cap reject before any read;
 * each blob's actual read size is checked before encoding; and the cumulative actual
 * byte total is verified BEFORE any base64 expansion. Reads are bounded-concurrency.
 * The blob bytes are fetched via a resolver injected by the evaluator (threaded through
 * the grading call contract) so this core matcher never imports the blob store. Inline
 * images are returned untouched; the resolved data URI is transient and not persisted.
 */
export async function resolveBlobBackedImageOutputs(
  images?: ImageOutput[],
  resolveImageBlob?: GradingBlobResolver,
): Promise<ImageOutput[] | undefined> {
  if (!images?.length) {
    return images;
  }

  const { maxImages, maxImageBytes, maxTotalImageBytes } = getGradingImageLimits();

  // (a) Count cap BEFORE any blob read.
  if (images.length > maxImages) {
    throw new Error(
      `Too many images for multimodal grading: received ${images.length}, maximum is ${maxImages}.`,
    );
  }

  // Compute each image's blob hash once (it scans image.data via regex) and reuse below.
  const hashedImages = images.map((image) => ({ image, hash: getBlobHashForImage(image) }));

  // (b) Reject by DECLARED blobRef.sizeBytes BEFORE reading (per-image + cumulative).
  let declaredBlobBytes = 0;
  for (const { image, hash } of hashedImages) {
    if (!hash) {
      continue;
    }
    const sizeBytes = typeof image.blobRef?.sizeBytes === 'number' ? image.blobRef.sizeBytes : 0;
    if (sizeBytes > maxImageBytes) {
      throw new Error(
        `Image output exceeds multimodal grading size limit: ${sizeBytes} bytes, maximum is ${maxImageBytes}.`,
      );
    }
    declaredBlobBytes += sizeBytes;
    if (declaredBlobBytes > maxTotalImageBytes) {
      throw new Error(
        `Image outputs exceed multimodal grading total size limit: ${declaredBlobBytes} bytes, maximum is ${maxTotalImageBytes}.`,
      );
    }
  }

  // (c) Read + per-image actual-size check (bounded concurrency), WITHOUT encoding yet.
  type ResolvedSlot = { image: ImageOutput; blob?: { data: Buffer; mimeType?: string } };
  const slots: ResolvedSlot[] = await async.mapLimit(
    hashedImages,
    BLOB_READ_CONCURRENCY,
    async ({ image, hash }: { image: ImageOutput; hash?: string }): Promise<ResolvedSlot> => {
      if (!hash) {
        return { image };
      }
      if (!resolveImageBlob) {
        throw new Error(
          'Blob-backed image output could not be resolved for multimodal grading: no blob resolver provided. ' +
            'This is wired automatically by the evaluator; configure the image provider to return base64 or a data URI if running the matcher standalone.',
        );
      }

      let blob: { data: Buffer; mimeType?: string };
      try {
        blob = await resolveImageBlob(hash);
      } catch (error) {
        throw new Error(
          `Failed to load blob-backed image output for multimodal grading (blob ${hash.slice(0, 12)}…): ${error}`,
        );
      }

      // Declared size may lie; the store may hold up to BLOB_MAX_SIZE while grading caps lower.
      if (blob.data.length > maxImageBytes) {
        throw new Error(
          `Image output exceeds multimodal grading size limit: ${blob.data.length} bytes, maximum is ${maxImageBytes}.`,
        );
      }
      return { image, blob };
    },
  );

  // (d) Cumulative ACTUAL-byte cap BEFORE any base64 expansion.
  let totalActualBytes = 0;
  for (const { blob } of slots) {
    if (!blob) {
      continue;
    }
    totalActualBytes += blob.data.length;
    if (totalActualBytes > maxTotalImageBytes) {
      throw new Error(
        `Image outputs exceed multimodal grading total size limit: ${totalActualBytes} bytes, maximum is ${maxTotalImageBytes}.`,
      );
    }
  }

  // (e) Encode now that per-image and cumulative byte totals are within bounds.
  return slots.map(({ image, blob }) => {
    if (!blob) {
      return image;
    }
    const mimeType = image.mimeType || blob.mimeType || 'image/png';
    return {
      ...image,
      data: `data:${mimeType};base64,${blob.data.toString('base64')}`,
      mimeType,
      blobRef: undefined,
    };
  });
}

/** Normalized image payload ready to be attached to a grading prompt. */
export type GradingImageData = { dataUri: string; base64Data: string; mimeType: string };

export function materializeImageOutputsForGrading(images?: ImageOutput[]): {
  imageOutputs: ImageOutput[];
  imageData: GradingImageData[];
} {
  if (!images?.length) {
    return { imageOutputs: [], imageData: [] };
  }

  const { maxImages, maxImageBytes, maxTotalImageBytes, maxRawChars, maxTotalRawChars } =
    getGradingImageLimits();
  if (images.length > maxImages) {
    throw new Error(
      `Too many images for multimodal grading: received ${images.length}, maximum is ${maxImages}.`,
    );
  }

  // Enforce the raw-character caps on the *original* payloads BEFORE any normalization,
  // so a whitespace-padded or adversarial output can't force a multi-hundred-MB
  // allocation/scan in normalizeBase64ImageData's whitespace strip. A raw base64 payload
  // also contributes its separate mimeType to the on-wire data URI, so count that too;
  // a data: URI already carries its prefix inside image.data, so it isn't double-counted.
  let totalRawChars = 0;
  for (const image of images) {
    let rawChars = image.data?.length ?? 0;
    // Only inspect the payload (and count its separate mimeType) while it's still within
    // the cap. The data: prefix check uses a bounded slice rather than a full `.trim()`,
    // so an oversized whitespace-padded payload is rejected by the length check below
    // without first allocating a trimmed copy of the adversarial string.
    if (image.data && rawChars <= maxRawChars && !/^\s*data:/i.test(image.data.slice(0, 64))) {
      rawChars += image.mimeType?.length ?? 0;
    }
    if (rawChars > maxRawChars) {
      throw new Error(
        `Image output raw data exceeds multimodal grading size limit: ${rawChars} characters, maximum is ${maxRawChars}.`,
      );
    }
    totalRawChars += rawChars;
    if (totalRawChars > maxTotalRawChars) {
      throw new Error(
        `Image outputs raw data exceeds multimodal grading total size limit: ${totalRawChars} characters, maximum is ${maxTotalRawChars}.`,
      );
    }
  }

  const materializedImages = images.map(imageOutputToImageUrl).filter(
    (
      image,
    ): image is { output: ImageOutput; dataUri: string; base64Data: string; mimeType: string } =>
      Boolean(image),
  );

  let totalImageBytes = 0;
  for (const image of materializedImages) {
    const decodedBytes = getBase64DecodedBytes(image.base64Data);
    if (decodedBytes > maxImageBytes) {
      throw new Error(
        `Image output exceeds multimodal grading size limit: ${decodedBytes} bytes, maximum is ${maxImageBytes}.`,
      );
    }
    totalImageBytes += decodedBytes;
    if (totalImageBytes > maxTotalImageBytes) {
      throw new Error(
        `Image outputs exceed multimodal grading total size limit: ${totalImageBytes} bytes, maximum is ${maxTotalImageBytes}.`,
      );
    }
  }

  return {
    imageOutputs: materializedImages.map((image) => image.output),
    imageData: materializedImages.map((image) => ({
      dataUri: image.dataUri,
      base64Data: image.base64Data,
      mimeType: image.mimeType,
    })),
  };
}

function appendImagesToContent(
  content: unknown,
  imageParts: MultimodalPromptPart[],
  format: MultimodalPromptFormat,
): MultimodalPromptPart[] {
  if (Array.isArray(content)) {
    const normalizedContent =
      format === 'responses'
        ? content.map(toResponsesContentPart)
        : format === 'google'
          ? content.map(toGoogleContentPart)
          : content;
    return [...normalizedContent, ...imageParts] as MultimodalPromptPart[];
  }

  if (typeof content === 'string') {
    return [buildTextPart(content, format), ...imageParts];
  }

  if (content === undefined || content === null) {
    return imageParts;
  }

  return [buildTextPart(stringifyContentPart(content), format), ...imageParts];
}

function getMultimodalPromptFormat(provider: ApiProvider): MultimodalPromptFormat {
  try {
    const providerId = provider.id();
    if (isResponsesCompatibleProvider(provider, providerId)) {
      return 'responses';
    }
    if (isAnthropicCompatibleProviderId(providerId)) {
      return 'anthropic';
    }
    if (isGoogleCompatibleProviderId(providerId)) {
      return 'google';
    }
  } catch {
    // Fall back to the broadly supported OpenAI-compatible shape.
  }

  return 'openai';
}

function isResponsesCompatibleProvider(provider: ApiProvider, providerId: string): boolean {
  const className = provider.constructor?.name;
  return (
    /(^|:)responses(?::|$)/i.test(providerId) ||
    (className !== undefined && RESPONSES_PROVIDER_CLASS_NAMES.has(className))
  );
}

function isAnthropicCompatibleProviderId(providerId: string): boolean {
  return (
    /(^|:)anthropic(?::|$)/i.test(providerId) ||
    /^bedrock:(?:converse:|kb:)?(?:[^:]*\.)?anthropic\.claude/i.test(providerId) ||
    /^vertex:claude/i.test(providerId)
  );
}

function isGoogleCompatibleProviderId(providerId: string): boolean {
  return /^google(?::|$)/i.test(providerId) || /^vertex:(?:chat:)?gemini/i.test(providerId);
}

function buildTextPart(text: string, format: MultimodalPromptFormat): MultimodalPromptPart {
  if (format === 'responses') {
    return { type: 'input_text', text };
  }

  return { type: 'text', text };
}

function buildImageParts(
  images: { dataUri: string; base64Data: string; mimeType: string }[],
  format: MultimodalPromptFormat,
): MultimodalPromptPart[] {
  return images.map<MultimodalPromptPart>((image) => {
    if (format === 'responses') {
      return {
        type: 'input_image',
        image_url: image.dataUri,
      };
    }

    if (format === 'anthropic') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: image.base64Data,
        },
      };
    }

    if (format === 'google') {
      return {
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64Data,
        },
      };
    }

    return {
      type: 'image_url',
      image_url: { url: image.dataUri },
    };
  });
}

function toResponsesContentPart(part: unknown): MultimodalPromptPart {
  if (typeof part === 'string') {
    return { type: 'input_text', text: part };
  }

  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return { type: 'input_text', text: stringifyContentPart(part) };
  }

  const contentPart = part as Record<string, unknown>;
  if (contentPart.type === 'input_text' && typeof contentPart.text === 'string') {
    return { type: 'input_text', text: contentPart.text };
  }
  if (contentPart.type === 'text' && typeof contentPart.text === 'string') {
    return { type: 'input_text', text: contentPart.text };
  }
  if (contentPart.type === 'input_image' && typeof contentPart.image_url === 'string') {
    return { type: 'input_image', image_url: contentPart.image_url };
  }
  if (
    contentPart.type === 'image_url' &&
    contentPart.image_url &&
    typeof contentPart.image_url === 'object' &&
    typeof (contentPart.image_url as { url?: unknown }).url === 'string'
  ) {
    return {
      type: 'input_image',
      image_url: (contentPart.image_url as { url: string }).url,
    };
  }
  if (
    contentPart.type === 'image' &&
    contentPart.source &&
    typeof contentPart.source === 'object'
  ) {
    const source = contentPart.source as { type?: unknown; media_type?: unknown; data?: unknown };
    if (
      source.type === 'base64' &&
      typeof source.media_type === 'string' &&
      typeof source.data === 'string'
    ) {
      return {
        type: 'input_image',
        image_url: `data:${source.media_type};base64,${source.data}`,
      };
    }
  }

  return { type: 'input_text', text: stringifyContentPart(part) };
}

function toGoogleContentPart(part: unknown): MultimodalPromptPart {
  if (typeof part === 'string') {
    return { type: 'text', text: part };
  }

  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return { type: 'text', text: stringifyContentPart(part) };
  }

  const contentPart = part as Record<string, unknown>;
  if (contentPart.type === 'text' && typeof contentPart.text === 'string') {
    return { type: 'text', text: contentPart.text };
  }
  if (contentPart.type === 'input_text' && typeof contentPart.text === 'string') {
    return { type: 'text', text: contentPart.text };
  }
  if (
    contentPart.type === 'image_url' &&
    contentPart.image_url &&
    typeof contentPart.image_url === 'object' &&
    typeof (contentPart.image_url as { url?: unknown }).url === 'string'
  ) {
    return (
      dataUriToGoogleContentPart((contentPart.image_url as { url: string }).url) || {
        type: 'text',
        text: stringifyContentPart(part),
      }
    );
  }
  if (contentPart.type === 'input_image' && typeof contentPart.image_url === 'string') {
    return (
      dataUriToGoogleContentPart(contentPart.image_url) || {
        type: 'text',
        text: stringifyContentPart(part),
      }
    );
  }
  if (
    contentPart.type === 'image' &&
    contentPart.source &&
    typeof contentPart.source === 'object'
  ) {
    const source = contentPart.source as { type?: unknown; media_type?: unknown; data?: unknown };
    if (
      source.type === 'base64' &&
      typeof source.media_type === 'string' &&
      typeof source.data === 'string'
    ) {
      return {
        inlineData: {
          mimeType: source.media_type,
          data: source.data,
        },
      };
    }
  }
  if (contentPart.inlineData && typeof contentPart.inlineData === 'object') {
    const inlineData = contentPart.inlineData as { mimeType?: unknown; data?: unknown };
    if (typeof inlineData.mimeType === 'string' && typeof inlineData.data === 'string') {
      return {
        inlineData: {
          mimeType: inlineData.mimeType,
          data: inlineData.data,
        },
      };
    }
  }
  if (contentPart.inline_data && typeof contentPart.inline_data === 'object') {
    const inlineData = contentPart.inline_data as { mime_type?: unknown; data?: unknown };
    if (typeof inlineData.mime_type === 'string' && typeof inlineData.data === 'string') {
      return {
        inlineData: {
          mimeType: inlineData.mime_type,
          data: inlineData.data,
        },
      };
    }
  }

  return { type: 'text', text: stringifyContentPart(part) };
}

function dataUriToGoogleContentPart(dataUri: string): MultimodalPromptPart | undefined {
  if (!dataUri.trim().startsWith('data:')) {
    return undefined;
  }

  const normalized = normalizeBase64ImageData(dataUri);
  return {
    inlineData: {
      mimeType: normalized.mimeType,
      data: normalized.base64Data,
    },
  };
}

function stringifyContentPart(part: unknown): string {
  return JSON.stringify(part) ?? String(part);
}

function appendImagesToChatPrompt(
  renderedPrompt: string,
  images: { dataUri: string; base64Data: string; mimeType: string }[],
  format: MultimodalPromptFormat,
): string {
  const imageParts: MultimodalPromptPart[] = [
    buildTextPart(MULTIMODAL_GRADING_INSTRUCTION, format),
    ...buildImageParts(images, format),
  ];

  let parsed: ChatMessageLike[] | undefined;
  const trimmedPrompt = renderedPrompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      parsed = yaml.load(renderedPrompt) as ChatMessageLike[] | undefined;
    } catch (err) {
      throw new Error(
        `Chat Completion prompt is not a valid YAML string: ${err}\n\n${renderedPrompt}`,
      );
    }
  } else {
    try {
      parsed = JSON.parse(renderedPrompt);
    } catch {
      // Non-JSON prompts are still valid text prompts. Wrap them below.
    }
  }
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
        content: appendImagesToContent(userMessage.content, imageParts, format),
      };
    } else {
      messages.push({ role: 'user', content: imageParts });
    }

    return JSON.stringify(messages);
  }

  return JSON.stringify([
    {
      role: 'user',
      content: [buildTextPart(renderedPrompt, format), ...imageParts],
    },
  ]);
}

function buildGradingProviderPrompt(
  renderedPrompt: string,
  imageData?: GradingImageData[],
  provider?: ApiProvider,
): { prompt: string; imageCount: number } {
  if (!imageData?.length) {
    return { prompt: renderedPrompt, imageCount: 0 };
  }

  const promptFormat = provider ? getMultimodalPromptFormat(provider) : 'openai';
  return {
    prompt: appendImagesToChatPrompt(renderedPrompt, imageData, promptFormat),
    imageCount: imageData.length,
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
  imageData,
}: {
  assertion?: Assertion;
  checkName: string;
  defaultPrompt: string;
  grading: GradingConfig;
  label: string;
  providerCallContext?: CallApiContextParams;
  throwOnError?: boolean;
  vars: Record<string, VarValue>;
  imageData?: GradingImageData[];
}): Promise<GradingResult> {
  const rubricPrompt = await loadRubricPrompt(grading.rubricPrompt, defaultPrompt);
  const renderedPrompt = await renderLlmRubricPrompt(rubricPrompt, vars);

  const defaultProviders = await getDefaultProviders();
  const defaultProvider =
    defaultProviders.llmRubricProvider || defaultProviders.gradingJsonProvider;
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    checkName,
  );
  const { prompt: providerPrompt, imageCount } = buildGradingProviderPrompt(
    renderedPrompt,
    imageData,
    finalProvider,
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
