type Probability = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface SafetyRating {
  category:
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  probability: Probability;
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
  finishReason?: 'FINISH_REASON_STOP' | 'STOP';
  safetyRatings: SafetyRating[];
}

interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount?: number;
  totalTokenCount: number;
}

interface ErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface ResponseData {
  candidates: Candidate[];
  usageMetadata?: UsageMetadata;
}

export type GeminiApiResponse = (ResponseData | ErrorResponse)[];
