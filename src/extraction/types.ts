export interface Variable {
  /** Variable name (e.g., "input", "query") */
  name: string;
  /** Original syntax in the prompt (e.g., "{{input}}", "${query}") */
  syntax: string;
  /** Variable syntax type */
  syntaxType: 'mustache' | 'python' | 'js-template' | 'shell' | 'nunjucks';
  /** Inferred type if possible */
  type?: string;
  /** Sample value for testing */
  sampleValue?: string;
}

export interface Message {
  /** Role of the message */
  role: 'system' | 'user' | 'assistant';
  /** Content of the message */
  content: string;
  /** Whether this is a template/variable reference */
  isVariable?: boolean;
  /** Variable name if this is a dynamic message */
  variableName?: string;
}

export interface ExtractedPrompt {
  /** The prompt text content */
  content: string;
  /** Detected template variables */
  variables: Variable[];
  /** Source location information */
  location: {
    file: string;
    line: number;
    context: string;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected API provider (e.g., "openai", "anthropic") */
  apiProvider?: string;
  /** Role (for chat messages) */
  role?: 'system' | 'user' | 'assistant';
  /** If this is a composed prompt with multiple messages */
  messages?: Message[];
  /** Type of prompt extraction */
  type?: 'single' | 'composed';
}

export interface ExtractionOptions {
  /** Output file path */
  output?: string;
  /** System purpose description */
  purpose?: string;
  /** Plugins to include */
  plugins?: string[];
  /** Strategies to include */
  strategies?: string[];
  /** Target provider */
  provider?: string;
  /** Interactive mode */
  interactive?: boolean;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

export interface GenerationOptions {
  /** System purpose description */
  purpose?: string;
  /** Plugins to include */
  plugins?: string[];
  /** Strategies to include */
  strategies?: string[];
  /** Target provider */
  provider?: string;
  /** Output file path */
  output?: string;
}
