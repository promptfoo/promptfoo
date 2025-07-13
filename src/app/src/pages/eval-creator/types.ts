// Type definitions for eval creator generation features

export interface GenerationBatch {
  id: string;
  generatedAt: string;
  generatedBy: string;
  type: 'dataset' | 'assertions';
  generationOptions?: {
    numPersonas?: number;
    numTestCasesPerPersona?: number;
    instructions?: string;
  };
}

export interface GenerationMetadata {
  generationBatchId?: string; // Reference to the batch this was generated in
  duplicatedFrom?: string;
  duplicatedAt?: string;
}

// Extend the TestCase type to include our generation metadata
export interface TestCaseWithGenerationMetadata {
  metadata?: GenerationMetadata & Record<string, any>;
}

// Prompt suggestion types
export interface PromptSuggestion {
  label: string;
  template: string;
  description: string;
  variables?: string[];
  category?: 'general' | 'testing' | 'safety' | 'performance' | 'ux';
}
