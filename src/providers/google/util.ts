import Clone from 'rfdc';
import { z } from 'zod';
import logger from '../../logger';
import { renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { getAjv } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { parseChatPrompt } from '../shared';
import { VALID_SCHEMA_TYPES } from './types';
import type { AnySchema } from 'ajv';
import type { GoogleAuth } from 'google-auth-library';

import type { Content, FunctionCall, Part, Tool } from './types';

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

export function maybeCoerceToGeminiFormat(contents: any): {
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
    coercedContents = contents.map((item) => ({
      role: item.role as 'user' | 'model' | undefined,
      parts: [{ text: item.content }],
    }));
    coerced = true;
  } else if (Array.isArray(contents) && contents.every((item) => item.role && item.content)) {
    // This looks like an OpenAI chat format with content that might be an array or object
    coercedContents = contents.map((item) => {
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
          role: item.role as 'user' | 'model' | undefined,
          parts,
        };
      } else if (typeof item.content === 'object') {
        // Handle object content
        return {
          role: item.role as 'user' | 'model' | undefined,
          parts: [item.content],
        };
      } else {
        // Handle string content
        return {
          role: item.role as 'user' | 'model' | undefined,
          parts: [{ text: item.content }],
        };
      }
    });
    coerced = true;
  } else if (typeof contents === 'object' && 'parts' in contents) {
    // This might be a single content object
    coercedContents = [contents as z.infer<typeof ContentSchema>];
    coerced = true;
  } else {
    logger.warn(`Unknown format for Gemini: ${JSON.stringify(contents)}`);
    return { contents: contents as GeminiFormat, coerced: false, systemInstruction: undefined };
  }

  const systemPromptParts: { text: string }[] = [];
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

  return {
    contents: coercedContents,
    coerced,
    systemInstruction:
      systemPromptParts.length > 0 ? { parts: systemPromptParts as [Part, ...Part[]] } : undefined,
  };
}

let cachedAuth: GoogleAuth | undefined;
export async function getGoogleClient() {
  if (!cachedAuth) {
    let GoogleAuth;
    try {
      const importedModule = await import('google-auth-library');
      GoogleAuth = importedModule.GoogleAuth;
    } catch {
      throw new Error(
        'The google-auth-library package is required as a peer dependency. Please install it in your project or globally.',
      );
    }
    cachedAuth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
  }
  const client = await cachedAuth.getClient();
  const projectId = await cachedAuth.getProjectId();
  return { client, projectId };
}

export async function hasGoogleDefaultCredentials() {
  try {
    await getGoogleClient();
    return true;
  } catch {
    return false;
  }
}

export function getCandidate(data: GeminiResponseData) {
  if (!data || !data.candidates || data.candidates.length < 1) {
    throw new Error('Expected at least one candidate in AI Studio API response.');
  }
  if (data.candidates.length > 1) {
    logger.debug(
      `Expected one candidate in AI Studio API response, but got ${data.candidates.length}.`,
    );
  }
  const candidate = data.candidates[0];
  return candidate;
}

export function formatCandidateContents(candidate: Candidate) {
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
 * Normalizes tools configuration to handle both snake_case and camelCase formats.
 * This ensures compatibility with both Google API formats while maintaining
 * consistent behavior in our codebase.
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

    return normalizedTool;
  });
}

export function loadFile(
  config_var: Tool[] | string | undefined,
  context_vars: Record<string, string | object> | undefined,
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
  if (!data || data.length < 100) {
    return false;
  }

  try {
    // Verify it's valid base64
    Buffer.from(data, 'base64');

    // Check for known image format headers
    return (
      data.startsWith('/9j/') || // JPEG
      data.startsWith('iVBORw0KGgo') || // PNG
      data.startsWith('R0lGODlh') || // GIF
      data.startsWith('UklGR') // WebP
    );
  } catch {
    return false;
  }
}

function getMimeTypeFromBase64(base64Data: string): string {
  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('UklGR')) {
    return 'image/webp';
  }
  // Default to jpeg for unknown formats
  return 'image/jpeg';
}

function processImagesInContents(
  contents: GeminiFormat,
  contextVars?: Record<string, string | object>,
): GeminiFormat {
  if (!contextVars) {
    return contents;
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
              processedParts.push({
                inlineData: {
                  mimeType,
                  data: trimmedLine,
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

export function geminiFormatAndSystemInstructions(
  prompt: string,
  contextVars?: Record<string, string | object>,
  configSystemInstruction?: Content | string,
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
  } = maybeCoerceToGeminiFormat(contents);
  if (coerced) {
    logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
    contents = updatedContents;
  }

  let systemInstruction: Content | string | undefined = parsedSystemInstruction;
  if (configSystemInstruction && !systemInstruction) {
    // Make a copy
    systemInstruction = clone(configSystemInstruction);

    // Load SI from file
    if (typeof configSystemInstruction === 'string') {
      systemInstruction = loadFile(configSystemInstruction, contextVars);
    }

    // Format SI if string was not a filepath above
    if (typeof systemInstruction === 'string') {
      systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (contextVars && systemInstruction) {
      const nunjucks = getNunjucksEngine();
      for (const part of systemInstruction.parts) {
        if (part.text) {
          try {
            part.text = nunjucks.renderString(part.text, contextVars);
          } catch (err) {
            throw new Error(`Unable to render nunjunks in systemInstruction: ${err}`);
          }
        }
      }
    }
  } else if (configSystemInstruction && systemInstruction) {
    throw new Error(`Template error: system instruction defined in prompt and config.`);
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
  vars?: Record<string, string | object>,
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
      throw new Error();
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
