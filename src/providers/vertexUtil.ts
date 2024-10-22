import type { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import logger from '../logger';

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

interface PartText {
  text: string;
}

interface PartFunctionCall {
  functionCall: {
    name: string;
    args: Record<string, string>;
  };
}

type Part = PartText | PartFunctionCall;

interface Content {
  parts: Part[];
  role?: 'model';
}

interface Candidate {
  content: Content;
  finishReason?: 'FINISH_REASON_STOP' | 'STOP' | 'SAFETY';
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
