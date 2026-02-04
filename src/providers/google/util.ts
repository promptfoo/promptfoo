import crypto from 'crypto';

import Clone from 'rfdc';
import { z } from 'zod';
import logger from '../../logger';
import { extractBase64FromDataUrl, isDataUrl, parseDataUrl } from '../../util/dataUrl';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { getAjv } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { calculateCost, parseChatPrompt } from '../shared';
import { loadCredentials } from './auth';
import { VALID_SCHEMA_TYPES } from './types';
import type { AnySchema } from 'ajv';

import type { VarValue } from '../../types/shared';
import type { Content, FunctionCall, Part, Schema, Tool } from './types';

// Gemini model pricing data
// Prices are per token (divided by 1e6 for per-million-token rates)
export const GEMINI_MODELS = [
  // Gemini 3 Pro Preview
  {
    id: 'gemini-3-pro-preview',
    cost: { input: 2 / 1e6, output: 12 / 1e6 },
  },
  // Gemini 3 Flash Preview
  {
    id: 'gemini-3-flash-preview',
    cost: { input: 0.5 / 1e6, output: 3 / 1e6 },
  },
  // Gemini 2.5 Pro
  ...['gemini-2.5-pro', 'gemini-2.5-pro-latest', 'gemini-2.5-pro-preview-05-06'].map((id) => ({
    id,
    cost: { input: 1.25 / 1e6, output: 10 / 1e6 },
  })),
  // Gemini 2.5 Computer Use Preview - same pricing as 2.5 Pro
  {
    id: 'gemini-2.5-computer-use-preview-10-2025',
    cost: { input: 1.25 / 1e6, output: 10 / 1e6 },
  },
  // Gemini 2.5 Flash
  ...[
    'gemini-2.5-flash',
    'gemini-2.5-flash-latest',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.5-flash-preview-09-2025',
  ].map((id) => ({
    id,
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  })),
  // Gemini 2.5 Flash-Lite
  ...[
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-lite-latest',
    'gemini-2.5-flash-lite-preview-09-2025',
  ].map((id) => ({
    id,
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6 },
  })),
  // Gemini Robotics-ER (same pricing as 2.5 Flash)
  {
    id: 'gemini-robotics-er-1.5-preview',
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  },
  // Gemini 2.0 Flash
  ...['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-001'].map((id) => ({
    id,
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6 },
  })),
  // Gemini 2.0 Flash-Lite
  ...['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001'].map((id) => ({
    id,
    cost: { input: 0.075 / 1e6, output: 0.3 / 1e6 },
  })),
  // Gemini 1.5 Pro (legacy)
  ...['gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-1.5-pro-001', 'gemini-1.5-pro-002'].map(
    (id) => ({
      id,
      cost: { input: 1.25 / 1e6, output: 5 / 1e6 },
    }),
  ),
  // Gemini 1.5 Flash (legacy)
  ...[
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
  ].map((id) => ({
    id,
    cost: { input: 0.075 / 1e6, output: 0.3 / 1e6 },
  })),
  // Gemini 1.5 Flash-8B (legacy)
  ...['gemini-1.5-flash-8b', 'gemini-1.5-flash-8b-latest', 'gemini-1.5-flash-8b-001'].map((id) => ({
    id,
    cost: { input: 0.0375 / 1e6, output: 0.15 / 1e6 },
  })),
  // Gemini Embedding
  {
    id: 'gemini-embedding-001',
    cost: { input: 0.15 / 1e6, output: 0 },
  },
];

// Models with tiered pricing (higher rates for prompts > 200k tokens)
const TIERED_PRICING_MODELS: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 4 / 1e6, output: 18 / 1e6 },
  'gemini-2.5-pro': { input: 2.5 / 1e6, output: 15 / 1e6 },
  'gemini-2.5-pro-latest': { input: 2.5 / 1e6, output: 15 / 1e6 },
  'gemini-2.5-pro-preview-05-06': { input: 2.5 / 1e6, output: 15 / 1e6 },
  'gemini-2.5-computer-use-preview-10-2025': { input: 2.5 / 1e6, output: 15 / 1e6 },
  'gemini-1.5-pro': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gemini-1.5-pro-latest': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gemini-1.5-pro-001': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gemini-1.5-pro-002': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gemini-1.5-flash': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  'gemini-1.5-flash-latest': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  'gemini-1.5-flash-001': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  'gemini-1.5-flash-002': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  'gemini-1.5-flash-8b': { input: 0.075 / 1e6, output: 0.3 / 1e6 },
  'gemini-1.5-flash-8b-latest': { input: 0.075 / 1e6, output: 0.3 / 1e6 },
  'gemini-1.5-flash-8b-001': { input: 0.075 / 1e6, output: 0.3 / 1e6 },
};

/**
 * Calculate the cost of a Gemini API call based on model and token usage.
 * Follows the same pattern as calculateAnthropicCost.
 */
export function calculateGeminiCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  // Handle tiered pricing for models with >200k token prompts
  const tieredPricing = TIERED_PRICING_MODELS[modelName];
  if (
    tieredPricing &&
    Number.isFinite(promptTokens) &&
    Number.isFinite(completionTokens) &&
    typeof promptTokens !== 'undefined' &&
    typeof completionTokens !== 'undefined' &&
    promptTokens > 200_000
  ) {
    const inputCost = config.cost ?? tieredPricing.input;
    const outputCost = config.cost ?? tieredPricing.output;
    return inputCost * promptTokens + outputCost * completionTokens || undefined;
  }

  // Use shared calculateCost for standard pricing
  return calculateCost(modelName, config, promptTokens, completionTokens, GEMINI_MODELS);
}

const ajv = getAjv();
// property_ordering is an optional field sometimes present in gemini tool configs, but ajv doesn't know about it.
// At the moment we will just ignore it, so the is-valid-function-call won't check property field ordering.
ajv.addKeyword('property_ordering');
const clone = Clone();

type Probability = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface SafetyRating {
  category:
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  probability: Probability;
  blocked: boolean;
}

interface Candidate {
  content: Content;
  finishReason?:
    | 'BLOCKLIST'
    | 'FINISH_REASON_UNSPECIFIED'
    | 'MALFORMED_FUNCTION_CALL'
    | 'MAX_TOKENS'
    | 'OTHER'
    | 'PROHIBITED_CONTENT'
    | 'RECITATION'
    | 'SAFETY'
    | 'SPII'
    | 'STOP';
  groundingChunks?: Record<string, any>[];
  groundingMetadata?: Record<string, any>;
  groundingSupports?: Record<string, any>[];
  safetyRatings: SafetyRating[];
  webSearchQueries?: string[];
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
}

export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface GeminiResponseData {
  candidates: Candidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    safetyRatings: Array<{ category: string; probability: string }>;
    blockReason: any;
    /** Message explaining why content was blocked (e.g., by Model Armor) */
    blockReasonMessage?: string;
  };
}

interface GeminiPromptFeedback {
  blockReason?: 'PROHIBITED_CONTENT';
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
}

interface GeminiBlockedResponse {
  promptFeedback: GeminiPromptFeedback;
  usageMetadata: GeminiUsageMetadata;
}

export type GeminiApiResponse = (
  | GeminiResponseData
  | GeminiErrorResponse
  | GeminiBlockedResponse
)[];

export interface Palm2ApiResponse {
  error?: {
    code: string;
    message: string;
  };
  predictions?: [
    {
      candidates: [
        {
          content: string;
        },
      ];
    },
  ];
}

const PartSchema = z.object({
  text: z.string().optional(),
  inline_data: z
    .object({
      mime_type: z.string(),
      data: z.string(),
    })
    .optional(),
});

const ContentSchema = z.object({
  role: z.enum(['user', 'model']).optional(),
  parts: z.array(PartSchema),
});

const GeminiFormatSchema = z.array(ContentSchema);

export type GeminiFormat = z.infer<typeof GeminiFormatSchema>;

export function maybeCoerceToGeminiFormat(
  contents: any,
  options?: { useAssistantRole?: boolean },
): {
  contents: GeminiFormat;
  coerced: boolean;
  systemInstruction: { parts: [Part, ...Part[]] } | undefined;
} {
  let coerced = false;
  const parseResult = GeminiFormatSchema.safeParse(contents);

  if (parseResult.success) {
    // Check for native Gemini system_instruction format
    let systemInst = undefined;
    if (typeof contents === 'object' && 'system_instruction' in contents) {
      systemInst = contents.system_instruction;
      // We need to modify the contents to remove system_instruction
      // since it's already extracted to systemInst
      if (typeof contents === 'object' && 'contents' in contents) {
        contents = contents.contents;
      }
      coerced = true;
    }

    return {
      contents: parseResult.data,
      coerced,
      systemInstruction: systemInst,
    };
  }

  let coercedContents: GeminiFormat;

  // Handle native Gemini format with system_instruction
  if (
    typeof contents === 'object' &&
    contents !== null &&
    !Array.isArray(contents) &&
    'system_instruction' in contents
  ) {
    const systemInst = contents.system_instruction;

    if ('contents' in contents) {
      coercedContents = contents.contents;
    } else {
      // If contents field is not present, use an empty array
      coercedContents = [];
    }

    return {
      contents: coercedContents,
      coerced: true,
      systemInstruction: systemInst,
    };
  }

  if (typeof contents === 'string') {
    coercedContents = [
      {
        parts: [{ text: contents }],
      },
    ];
    coerced = true;
  } else if (
    Array.isArray(contents) &&
    contents.every((item) => typeof item.content === 'string')
  ) {
    // This looks like an OpenAI chat format
    const targetRole = options?.useAssistantRole ? 'assistant' : 'model';
    coercedContents = contents.map((item) => ({
      role: (item.role === 'assistant' ? targetRole : item.role) as 'user' | 'model' | undefined,
      parts: [{ text: item.content }],
    }));
    coerced = true;
  } else if (Array.isArray(contents) && contents.every((item) => item.role && item.content)) {
    // This looks like an OpenAI chat format with content that might be an array or object
    const targetRole = options?.useAssistantRole ? 'assistant' : 'model';
    coercedContents = contents.map((item) => {
      const mappedRole = (item.role === 'assistant' ? targetRole : item.role) as
        | 'user'
        | 'model'
        | undefined;
      if (Array.isArray(item.content)) {
        // Handle array content
        const parts = item.content.map((contentItem: any) => {
          if (typeof contentItem === 'string') {
            return { text: contentItem };
          } else if (contentItem.type === 'text') {
            return { text: contentItem.text };
          } else {
            // Handle other content types if needed
            return contentItem;
          }
        });
        return {
          role: mappedRole,
          parts,
        };
      } else if (typeof item.content === 'object') {
        // Handle object content
        return {
          role: mappedRole,
          parts: [item.content],
        };
      } else {
        // Handle string content
        return {
          role: mappedRole,
          parts: [{ text: item.content }],
        };
      }
    });
    coerced = true;
  } else if (typeof contents === 'object' && contents !== null && 'parts' in contents) {
    // This might be a single content object
    coercedContents = [contents as z.infer<typeof ContentSchema>];
    coerced = true;
  } else {
    logger.warn(`Unknown format for Gemini: ${JSON.stringify(contents)}`);
    // Ensure we always return an array, even for unknown formats
    // This prevents "contents.map is not a function" errors downstream
    // For arrays that don't match known formats, we still return them as-is
    // since they're already arrays and won't cause .map() errors
    const fallbackContents: GeminiFormat = Array.isArray(contents) ? contents : [];
    return { contents: fallbackContents, coerced: false, systemInstruction: undefined };
  }

  let systemPromptParts: { text: string }[] = [];
  coercedContents = coercedContents.filter((message) => {
    if (message.role === ('system' as any) && message.parts.length > 0) {
      systemPromptParts.push(
        ...message.parts.filter(
          (part): part is { text: string } => 'text' in part && typeof part.text === 'string',
        ),
      );
      return false;
    }
    return true;
  });

  // Convert system-only prompts to user messages
  // Gemini does not support execution with systemInstruction only
  if (coercedContents.length === 0 && systemPromptParts.length > 0) {
    coercedContents = [
      {
        role: 'user',
        parts: systemPromptParts,
      },
    ];
    coerced = true;
    systemPromptParts = [];
  }

  return {
    contents: coercedContents,
    coerced,
    systemInstruction:
      systemPromptParts.length > 0 ? { parts: systemPromptParts as [Part, ...Part[]] } : undefined,
  };
}

// Re-export auth functions from auth.ts for backward compatibility
// These were previously implemented here but are now centralized in auth.ts
export {
  clearCachedAuth,
  getGoogleClient,
  hasGoogleDefaultCredentials,
  loadCredentials,
  resolveProjectId,
} from './auth';

// Separate cached auth client for Generative Language API with specific scopes
let cachedGenerativeLanguageAuth: InstanceType<
  typeof import('google-auth-library').GoogleAuth
> | null = null;

/**
 * Gets an OAuth2 access token for Google APIs.
 * Used by providers that need to authenticate via OAuth2 instead of API keys.
 * @param credentials - Optional credentials JSON string or file:// path
 * @param scopes - Optional scopes to use. Defaults to cloud-platform + generative-language scopes
 * @returns The access token string, or undefined if authentication fails
 */
export async function getGoogleAccessToken(credentials?: string): Promise<string | undefined> {
  try {
    // Try with generative-language scopes first (required for Live API)
    if (!cachedGenerativeLanguageAuth) {
      let GoogleAuth;
      try {
        const importedModule = await import('google-auth-library');
        GoogleAuth = importedModule.GoogleAuth;
        cachedGenerativeLanguageAuth = new GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/generative-language.retriever',
            'https://www.googleapis.com/auth/generative-language.tuning',
          ],
        });
      } catch {
        throw new Error(
          'The google-auth-library package is required as a peer dependency. Please install it in your project or globally.',
        );
      }
    }

    const processedCredentials = loadCredentials(credentials);

    let client;
    if (processedCredentials) {
      client = await cachedGenerativeLanguageAuth.fromJSON(JSON.parse(processedCredentials));
    } else {
      client = await cachedGenerativeLanguageAuth.getClient();
    }

    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || undefined;
  } catch (error) {
    logger.debug('[GoogleAuth] Could not get access token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function getCandidate(data: GeminiResponseData) {
  if (!data || !data.candidates || data.candidates.length < 1) {
    // Check if the prompt was blocked
    let errorDetails = 'No candidates returned in API response.';

    if (data?.promptFeedback?.blockReason) {
      errorDetails = `Response blocked: ${data.promptFeedback.blockReason}`;
      if (data.promptFeedback.safetyRatings) {
        const flaggedCategories = data.promptFeedback.safetyRatings
          .filter((rating) => rating.probability !== 'NEGLIGIBLE')
          .map((rating) => `${rating.category}: ${rating.probability}`);
        if (flaggedCategories.length > 0) {
          errorDetails += ` (Safety ratings: ${flaggedCategories.join(', ')})`;
        }
      }
    } else if (data?.promptFeedback?.safetyRatings) {
      const flaggedCategories = data.promptFeedback.safetyRatings
        .filter((rating) => rating.probability !== 'NEGLIGIBLE')
        .map((rating) => `${rating.category}: ${rating.probability}`);
      if (flaggedCategories.length > 0) {
        errorDetails = `Response may have been blocked due to safety filters: ${flaggedCategories.join(', ')}`;
      }
    }

    errorDetails += `\n\nGot response: ${JSON.stringify(data)}`;

    throw new Error(errorDetails);
  }
  if (data.candidates.length > 1) {
    logger.debug(
      `Expected one candidate in AI Studio API response, but got ${data.candidates.length}: ${JSON.stringify(data)}`,
    );
  }
  const candidate = data.candidates[0];
  return candidate;
}

export function formatCandidateContents(candidate: Candidate) {
  // Check if the candidate was blocked or stopped for safety reasons
  if (
    candidate.finishReason &&
    ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
      candidate.finishReason,
    )
  ) {
    let errorMessage = `Response was blocked with finish reason: ${candidate.finishReason}`;

    if (candidate.safetyRatings) {
      const flaggedCategories = candidate.safetyRatings
        .filter((rating) => rating.probability !== 'NEGLIGIBLE' || rating.blocked)
        .map(
          (rating) =>
            `${rating.category}: ${rating.probability}${rating.blocked ? ' (BLOCKED)' : ''}`,
        );
      if (flaggedCategories.length > 0) {
        errorMessage += `\nSafety ratings: ${flaggedCategories.join(', ')}`;
      }
    }

    if (candidate.finishReason === 'RECITATION') {
      errorMessage +=
        "\n\nThis typically occurs when the response is too similar to content from the model's training data.";
    } else if (candidate.finishReason === 'SAFETY') {
      errorMessage +=
        '\n\nThe response was blocked due to safety filters. Consider adjusting safety settings or modifying your prompt.';
    }

    throw new Error(errorMessage);
  }

  if (candidate.content?.parts) {
    let output = '';
    let is_text = true;
    for (const part of candidate.content.parts) {
      if ('text' in part) {
        output += part.text;
      } else {
        is_text = false;
      }
    }
    if (is_text) {
      return output;
    } else {
      return candidate.content.parts;
    }
  } else {
    throw new Error(`No output found in response: ${JSON.stringify(candidate)}`);
  }
}

export function mergeParts(parts1: Part[] | string | undefined, parts2: Part[] | string) {
  if (parts1 === undefined) {
    return parts2;
  }

  if (typeof parts1 === 'string' && typeof parts2 === 'string') {
    return parts1 + parts2;
  }

  const array1: Part[] = typeof parts1 === 'string' ? [{ text: parts1 }] : parts1;

  const array2: Part[] = typeof parts2 === 'string' ? [{ text: parts2 }] : parts2;

  array1.push(...array2);

  return array1;
}

/**
 * Normalizes and sanitizes tools configuration for Gemini API compatibility.
 * - Handles snake_case to camelCase conversion for backwards compatibility
 * - Sanitizes function declaration schemas to remove unsupported JSON Schema properties
 *   (e.g., additionalProperties, $schema, default) that Gemini doesn't support
 */
export function normalizeTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const normalizedTool: Tool = { ...tool };

    // Use index access with type assertion to avoid TypeScript errors
    // Handle google_search -> googleSearch conversion
    if ((tool as any).google_search && !normalizedTool.googleSearch) {
      normalizedTool.googleSearch = (tool as any).google_search;
    }

    // Handle code_execution -> codeExecution conversion
    if ((tool as any).code_execution && !normalizedTool.codeExecution) {
      normalizedTool.codeExecution = (tool as any).code_execution;
    }

    // Handle google_search_retrieval -> googleSearchRetrieval conversion
    if ((tool as any).google_search_retrieval && !normalizedTool.googleSearchRetrieval) {
      normalizedTool.googleSearchRetrieval = (tool as any).google_search_retrieval;
    }

    // Sanitize function declarations to remove unsupported schema properties
    // This fixes issues like GitHub #6902 where additionalProperties causes API errors
    if (normalizedTool.functionDeclarations) {
      normalizedTool.functionDeclarations = normalizedTool.functionDeclarations.map((fd) => ({
        ...fd,
        parameters: fd.parameters ? (sanitizeSchemaForGemini(fd.parameters) as Schema) : undefined,
      }));
    }

    return normalizedTool;
  });
}

export function loadFile(
  config_var: Tool[] | string | undefined,
  context_vars: Record<string, VarValue> | undefined,
) {
  // Ensures that files are loaded correctly. Files may be defined in multiple ways:
  // 1. Directly in the provider:
  //    config_var will be the file path, which will be loaded here in maybeLoadFromExternalFile.
  // 2. In a test variable that is used in the provider via a nunjucks:
  //    context_vars will contain a string of the contents of the file with whitespace.
  //    This will be inserted into the nunjucks in contfig_tools and the output needs to be parsed.
  const fileContents = maybeLoadFromExternalFile(renderVarsInObject(config_var, context_vars));
  if (typeof fileContents === 'string') {
    try {
      const parsedContents = JSON.parse(fileContents);
      return Array.isArray(parsedContents) ? normalizeTools(parsedContents) : parsedContents;
    } catch (err) {
      logger.debug(`ERROR: failed to convert file contents to JSON:\n${JSON.stringify(err)}`);
      return fileContents;
    }
  }

  // If fileContents is already an array of tools, normalize them
  if (Array.isArray(fileContents)) {
    return normalizeTools(fileContents);
  }

  return fileContents;
}

function isValidBase64Image(data: string): boolean {
  // Handle both data URLs and raw base64
  const base64Data = isDataUrl(data) ? extractBase64FromDataUrl(data) : data;

  // Minimum length check: smallest valid GIF is ~35 chars
  // Set threshold to 20 to allow small images (1x1 pixels, icons, test fixtures)
  if (!base64Data || base64Data.length < 20) {
    return false;
  }

  try {
    // Verify it's valid base64
    Buffer.from(base64Data, 'base64');

    // Check for known image format headers (magic numbers)
    return (
      base64Data.startsWith('/9j/') || // JPEG
      base64Data.startsWith('iVBORw0KGgo') || // PNG
      base64Data.startsWith('R0lGODlh') || // GIF89a
      base64Data.startsWith('R0lGODdh') || // GIF87a
      base64Data.startsWith('UklGR') || // WebP (RIFF)
      base64Data.startsWith('Qk0') || // BMP
      base64Data.startsWith('Qk1') || // BMP (alternate)
      base64Data.startsWith('SUkq') || // TIFF (little-endian)
      base64Data.startsWith('TU0A') || // TIFF (big-endian)
      base64Data.startsWith('AAABAA') // ICO
    );
  } catch {
    return false;
  }
}

function getMimeTypeFromBase64(base64DataOrUrl: string): string {
  // Try to extract MIME type from data URL first
  const parsed = parseDataUrl(base64DataOrUrl);
  if (parsed) {
    return parsed.mimeType;
  }

  // Fallback to magic number detection for raw base64
  const base64Data = extractBase64FromDataUrl(base64DataOrUrl);
  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh') || base64Data.startsWith('R0lGODdh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('UklGR')) {
    return 'image/webp';
  } else if (base64Data.startsWith('Qk0') || base64Data.startsWith('Qk1')) {
    return 'image/bmp';
  } else if (base64Data.startsWith('SUkq') || base64Data.startsWith('TU0A')) {
    return 'image/tiff';
  } else if (base64Data.startsWith('AAABAA')) {
    return 'image/x-icon';
  }
  // Default to jpeg for unknown formats
  return 'image/jpeg';
}

function processImagesInContents(
  contents: GeminiFormat,
  contextVars?: Record<string, VarValue>,
): GeminiFormat {
  if (!contextVars) {
    return contents;
  }

  // Guard: ensure contents is an array
  if (!Array.isArray(contents)) {
    logger.warn('[Google] contents is not an array in processImagesInContents', {
      contentsType: typeof contents,
      contentsValue: contents,
    });
    // Return empty array as fallback to prevent .map() error
    return [];
  }

  const base64ToVarName = new Map<string, string>();

  for (const [varName, value] of Object.entries(contextVars)) {
    if (typeof value === 'string' && isValidBase64Image(value)) {
      base64ToVarName.set(value, varName);
    }
  }

  return contents.map((content) => {
    if (content.parts) {
      const newParts: Part[] = [];

      for (const part of content.parts) {
        if (part.text) {
          const lines = part.text.split('\n');
          let foundValidImage = false;
          let currentTextBlock = '';
          const processedParts: Part[] = [];

          // First pass: check if any line is a valid base64 image from context variables
          for (const line of lines) {
            const trimmedLine = line.trim();

            // Check if this line is a base64 image that was loaded from a variable
            if (base64ToVarName.has(trimmedLine) && isValidBase64Image(trimmedLine)) {
              foundValidImage = true;

              // Add any accumulated text as a text part
              if (currentTextBlock.length > 0) {
                processedParts.push({
                  text: currentTextBlock,
                });
                currentTextBlock = '';
              }

              // Add the image part
              const mimeType = getMimeTypeFromBase64(trimmedLine);
              // Extract raw base64 data (Google expects raw base64, not data URLs)
              const base64Data = isDataUrl(trimmedLine)
                ? extractBase64FromDataUrl(trimmedLine)
                : trimmedLine;
              processedParts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            } else {
              // Accumulate text, preserving original formatting including newlines
              if (currentTextBlock.length > 0) {
                currentTextBlock += '\n';
              }
              currentTextBlock += line;
            }
          }

          // Add any remaining text block
          if (currentTextBlock.length > 0) {
            processedParts.push({
              text: currentTextBlock,
            });
          }

          // If we found valid images, use the processed parts; otherwise, keep the original part
          if (foundValidImage) {
            newParts.push(...processedParts);
          } else {
            newParts.push(part);
          }
        } else {
          // Keep non-text parts as is
          newParts.push(part);
        }
      }

      return {
        ...content,
        parts: newParts,
      };
    }
    return content;
  });
}

/**
 * Parses and processes config-level systemInstruction.
 * Handles file loading, string-to-Content conversion, and Nunjucks template rendering.
 *
 * @param configSystemInstruction - The systemInstruction from config (can be string, Content, or undefined)
 * @param contextVars - Variables for Nunjucks template rendering
 * @returns Processed Content object or undefined
 */
function parseConfigSystemInstruction(
  configSystemInstruction: Content | string | undefined,
  contextVars?: Record<string, VarValue>,
): Content | undefined {
  if (!configSystemInstruction) {
    return undefined;
  }

  // Make a copy to avoid mutating the original
  let configInstruction = clone(configSystemInstruction);

  // Load systemInstruction from file if it's a file path
  if (typeof configSystemInstruction === 'string') {
    configInstruction = loadFile(configSystemInstruction, contextVars);
  }

  // Convert string to Content structure
  if (typeof configInstruction === 'string') {
    configInstruction = { parts: [{ text: configInstruction }] };
  }

  // Render Nunjucks templates in all text parts
  if (contextVars && configInstruction) {
    const nunjucks = getNunjucksEngine();
    for (const part of configInstruction.parts) {
      if (part.text) {
        try {
          part.text = nunjucks.renderString(part.text, contextVars);
        } catch (err) {
          throw new Error(`Unable to render nunjucks in systemInstruction: ${err}`);
        }
      }
    }
  }

  return configInstruction;
}

export function geminiFormatAndSystemInstructions(
  prompt: string,
  contextVars?: Record<string, VarValue>,
  configSystemInstruction?: Content | string,
  options?: { useAssistantRole?: boolean },
): {
  contents: GeminiFormat;
  systemInstruction: Content | { parts: [Part, ...Part[]] } | undefined;
} {
  let contents: GeminiFormat = parseChatPrompt(prompt, [
    {
      parts: [
        {
          text: prompt,
        },
      ],
      role: 'user',
    },
  ]);
  const {
    contents: updatedContents,
    coerced,
    systemInstruction: parsedSystemInstruction,
  } = maybeCoerceToGeminiFormat(contents, options);
  if (coerced) {
    logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
    contents = updatedContents;
  }

  let systemInstruction: Content | undefined = parsedSystemInstruction;

  const parsedConfigInstruction = parseConfigSystemInstruction(
    configSystemInstruction,
    contextVars,
  );
  if (parsedConfigInstruction) {
    systemInstruction = systemInstruction
      ? { parts: [...parsedConfigInstruction.parts, ...systemInstruction.parts] }
      : parsedConfigInstruction;
  }

  // Process images in contents
  contents = processImagesInContents(contents, contextVars);

  return { contents, systemInstruction };
}

/**
 * Recursively traverses a JSON schema object and converts
 * uppercase type keywords (string values) to lowercase.
 * Handles nested objects and arrays within the schema.
 * Creates a deep copy to avoid modifying the original schema.
 *
 * @param {object | any} schemaNode - The current node (object or value) being processed.
 * @returns {object | any} - The processed node with type keywords lowercased.
 */
function normalizeSchemaTypes(schemaNode: any): any {
  // Handle non-objects (including null) and arrays directly by iterating/returning
  if (typeof schemaNode !== 'object' || schemaNode === null) {
    return schemaNode;
  }

  if (Array.isArray(schemaNode)) {
    return schemaNode.map(normalizeSchemaTypes); // Recurse for array elements
  }

  // Create a new object to avoid modifying the original
  const newNode: { [key: string]: any } = {};

  for (const key in schemaNode) {
    if (Object.prototype.hasOwnProperty.call(schemaNode, key)) {
      const value = schemaNode[key];

      if (key === 'type') {
        if (
          typeof value === 'string' &&
          (VALID_SCHEMA_TYPES as ReadonlyArray<string>).includes(value)
        ) {
          // Convert type value(s) to lowercase
          newNode[key] = value.toLowerCase();
        } else if (Array.isArray(value)) {
          // Handle type arrays like ["STRING", "NULL"]
          newNode[key] = value.map((t) =>
            typeof t === 'string' && (VALID_SCHEMA_TYPES as ReadonlyArray<string>).includes(t)
              ? t.toLowerCase()
              : t,
          );
        } else {
          // Handle type used as function field rather than a schema type definition
          newNode[key] = normalizeSchemaTypes(value);
        }
      } else {
        // Recursively process nested objects/arrays
        newNode[key] = normalizeSchemaTypes(value);
      }
    }
  }

  return newNode;
}

export function parseStringObject(input: string | any) {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

export function validateFunctionCall(
  output: string | object,
  functions?: Tool[] | string,
  vars?: Record<string, VarValue>,
) {
  let functionCalls: FunctionCall[];
  try {
    let parsedOutput: object | Content = parseStringObject(output);
    if ('toolCall' in parsedOutput) {
      // Live Format
      parsedOutput = (parsedOutput as { toolCall: any }).toolCall;
      functionCalls = (parsedOutput as { functionCalls: any }).functionCalls;
    } else if (Array.isArray(parsedOutput)) {
      // Vertex and AIS Format
      functionCalls = parsedOutput
        .filter((obj) => Object.prototype.hasOwnProperty.call(obj, 'functionCall'))
        .map((obj) => obj.functionCall);
    } else {
      throw new Error('Unrecognized function call format');
    }
  } catch {
    throw new Error(
      `Google did not return a valid-looking function call: ${JSON.stringify(output)}`,
    );
  }

  const interpolatedFunctions = loadFile(functions, vars) as Tool[];

  for (const functionCall of functionCalls) {
    // Parse function call and validate it against schema
    const functionName = functionCall.name;
    const functionArgs = parseStringObject(functionCall.args);
    const functionDeclarations = interpolatedFunctions?.find((f) => 'functionDeclarations' in f);
    const functionSchema = functionDeclarations?.functionDeclarations?.find(
      (f) => f.name === functionName,
    );
    if (!functionSchema) {
      throw new Error(`Called "${functionName}", but there is no function with that name`);
    }
    if (Object.keys(functionArgs).length !== 0 && functionSchema?.parameters) {
      const parameterSchema = normalizeSchemaTypes(functionSchema.parameters);
      let validate;
      try {
        validate = ajv.compile(parameterSchema as AnySchema);
      } catch (err) {
        throw new Error(
          `Tool schema doesn't compile with ajv: ${err}. If this is a valid tool schema you may need to reformulate your assertion without is-valid-function-call.`,
        );
      }
      if (!validate(functionArgs)) {
        throw new Error(
          `Call to "${functionName}":\n${JSON.stringify(functionCall)}\ndoes not match schema:\n${JSON.stringify(validate.errors)}`,
        );
      }
    } else if (!(JSON.stringify(functionArgs) === '{}' && !functionSchema?.parameters)) {
      throw new Error(
        `Call to "${functionName}":\n${JSON.stringify(functionCall)}\ndoes not match schema:\n${JSON.stringify(functionSchema)}`,
      );
    }
  }
}

/**
 * Properties supported by Gemini's function calling API.
 * Based on Google's Schema type definition and API documentation.
 * @see https://ai.google.dev/api/caching#Schema
 */
const GEMINI_SUPPORTED_SCHEMA_PROPERTIES = new Set([
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'maxItems',
  'minItems',
  'properties',
  'required',
  'propertyOrdering',
  'items',
]);

/**
 * Valid JSON Schema types mapped to Gemini's expected format (uppercase).
 */
const JSON_SCHEMA_TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
  null: 'STRING', // Gemini doesn't support null type, fall back to STRING
};

/**
 * Recursively sanitizes a JSON Schema for Gemini API compatibility.
 *
 * - Removes unsupported properties (additionalProperties, $schema, default, title, etc.)
 * - Converts type values to uppercase (string → STRING, object → OBJECT)
 * - Recursively processes nested schemas in 'properties' and 'items'
 *
 * @param schema - The JSON Schema object to sanitize
 * @returns A sanitized schema compatible with Gemini's function calling API
 */
export function sanitizeSchemaForGemini(schema: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip properties not supported by Gemini
    if (!GEMINI_SUPPORTED_SCHEMA_PROPERTIES.has(key)) {
      continue;
    }

    if (key === 'type') {
      // Convert type to uppercase for Gemini
      if (typeof value === 'string') {
        const lowerType = value.toLowerCase();
        result[key] = JSON_SCHEMA_TYPE_MAP[lowerType] || value.toUpperCase();
      } else {
        result[key] = value;
      }
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recursively sanitize each property schema
      result[key] = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          result[key][propName] = sanitizeSchemaForGemini(propSchema as Record<string, any>);
        } else {
          result[key][propName] = propSchema;
        }
      }
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      // Recursively sanitize array item schema
      result[key] = sanitizeSchemaForGemini(value as Record<string, any>);
    } else {
      // Pass through allowed primitive values (enum, required, maxItems, etc.)
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a cache discriminator from auth headers.
 *
 * This is used to ensure different API keys/credentials don't share cached responses.
 * The discriminator is included as a custom property in fetchWithCache options,
 * which gets included in the cache key automatically.
 *
 * Security note: We hash auth headers rather than using them directly to avoid
 * exposing sensitive credentials in cache keys or logs. The hash is truncated
 * to 16 hex characters (64 bits) for brevity - collision probability is acceptably
 * low for cache key differentiation (birthday problem: ~4 billion entries needed
 * for 50% collision probability).
 *
 * @param headers - Request headers containing auth info
 * @returns A short hash string for cache key differentiation
 */
export function createAuthCacheDiscriminator(headers: Record<string, string>): string {
  // Extract auth-related header values
  const authValues: string[] = [];

  const authHeaderNames = [
    'authorization',
    'x-goog-api-key',
    'x-api-key',
    'api-key',
    'x-goog-user-project',
  ];

  for (const name of authHeaderNames) {
    const value = headers[name] || headers[name.toLowerCase()];
    if (value) {
      authValues.push(`${name}:${value}`);
    }
  }

  if (authValues.length === 0) {
    return '';
  }

  // Create a short hash for cache key (16 hex chars = 64 bits, sufficient for cache differentiation)
  return crypto.createHash('sha256').update(authValues.join('|')).digest('hex').substring(0, 16);
}
