// Type definitions for eval creator generation features

export interface GenerationMetadata {
  isGenerated?: boolean;
  generatedAt?: string;
  generatedBy?: string;
  generationOptions?: {
    numPersonas?: number;
    numTestCasesPerPersona?: number;
    instructions?: string;
  };
  duplicatedFrom?: string;
  duplicatedAt?: string;
}

// Extend the TestCase type to include our generation metadata
export interface TestCaseWithGenerationMetadata {
  metadata?: GenerationMetadata & Record<string, any>;
}
