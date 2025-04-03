import type { GoogleAuth } from 'google-auth-library';
import Clone from 'rfdc';
import { z } from 'zod';
import logger from '../../logger';
import type { CallApiContextParams } from '../../types';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { getNunjucksEngine } from '../../util/templates';
import { parseChatPrompt } from '../shared';
import { type Tool } from './types';
import type { Content } from './types';

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

// interface PartText {
//   text: string;
// }

// interface PartFunctionCall {
//   functionCall: {
//     name: string;
//     args: Record<string, string>;
//   };
// }

// type Part = PartText | PartFunctionCall;

// interface Content {
//   parts: Part[];
//   role?: 'model';
// }

interface Candidate {
  content: Content;
  finishReason?:
    | 'FINISH_REASON_UNSPECIFIED'
    | 'STOP'
    | 'MAX_TOKENS'
    | 'SAFETY'
    | 'RECITATION'
    | 'OTHER'
    | 'BLOCKLIST'
    | 'PROHIBITED_CONTENT'
    | 'SPII'
    | 'MALFORMED_FUNCTION_CALL';
  safetyRatings: SafetyRating[];
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  totalTokenCount: number;
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
export type GeminiPart = z.infer<typeof PartSchema>;

export function maybeCoerceToGeminiFormat(contents: any): {
  contents: GeminiFormat;
  coerced: boolean;
  systemInstruction: { parts: [GeminiPart, ...GeminiPart[]] } | undefined;
} {
  let coerced = false;
  const parseResult = GeminiFormatSchema.safeParse(contents);

  if (parseResult.success) {
    return {
      contents: parseResult.data,
      coerced,
      systemInstruction: undefined,
    };
  }

  let coercedContents: GeminiFormat;

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
      systemPromptParts.length > 0
        ? { parts: systemPromptParts as [GeminiPart, ...GeminiPart[]] }
        : undefined,
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

export function stringifyCandidateContents(data: GeminiResponseData) {
  let output = '';
  for (const candidate of data.candidates) {
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if ('text' in part) {
          output += part.text;
        } else {
          output += JSON.stringify(part);
        }
      }
    }
  }
  return output;
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
      return JSON.parse(fileContents);
    } catch (err) {
      logger.debug(`ERROR: failed to file contents to JSON:\n${JSON.stringify(err)}`);
      return fileContents;
    }
  }
  return fileContents;
}

export function geminiFormatSystemInstructions(
  prompt: string,
  context?: CallApiContextParams,
  configSystemInstruction?: Content,
) {
  let contents: GeminiFormat | { role: string; parts: { text: string } } = parseChatPrompt(prompt, {
    role: 'user',
    parts: {
      text: prompt,
    },
  });
  const {
    contents: updatedContents,
    coerced,
    systemInstruction: parsedSystemInstruction,
  } = maybeCoerceToGeminiFormat(contents);
  if (coerced) {
    logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
    contents = updatedContents;
  }

  let systemInstruction: Content | undefined = parsedSystemInstruction;
  if (configSystemInstruction && !systemInstruction) {
    // Make a copy
    systemInstruction = clone(configSystemInstruction);
    if (systemInstruction && context?.vars) {
      const nunjucks = getNunjucksEngine();
      for (const part of systemInstruction.parts) {
        if (part.text) {
          part.text = nunjucks.renderString(part.text, context.vars);
        }
      }
    }
  } else if (configSystemInstruction && systemInstruction) {
    return {
      error: `Preprocessing error: system instruction defined in prompt and config.`,
    };
  }

  return { contents, systemInstruction };
}
