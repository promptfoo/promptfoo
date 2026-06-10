import { z } from 'zod';
import {
  AssertionGenerationOptionsSchema,
  ConceptExtractionOptionsSchema,
  DatasetGenerationOptionsSchema,
  DiversityOptionsSchema,
  SampleOutputSchema,
  TestSuiteGenerationOptionsSchema,
} from '../../generation/types';
import { AssertionOrSetSchema, AssertionSchema } from '../index';

export const GenerationPromptInputSchema = z.union([
  z.string(),
  z
    .object({
      raw: z.string(),
      label: z.string().optional(),
    })
    .passthrough(),
]);

export type GenerationPromptInput = z.infer<typeof GenerationPromptInputSchema>;

export const GenerationTestCaseInputSchema = z
  .object({
    vars: z.record(z.string(), z.unknown()).optional(),
    assert: z.array(AssertionOrSetSchema).optional(),
    description: z.string().optional(),
  })
  .passthrough();

export type GenerationTestCaseInput = z.infer<typeof GenerationTestCaseInputSchema>;

export const DatasetGenerateRequestSchema = z.object({
  prompts: z.array(GenerationPromptInputSchema).min(1),
  tests: z.array(GenerationTestCaseInputSchema).optional().default([]),
  options: DatasetGenerationOptionsSchema.partial().optional(),
});

export type DatasetGenerateRequest = z.infer<typeof DatasetGenerateRequestSchema>;

export const AssertionGenerateRequestSchema = z.object({
  prompts: z.array(GenerationPromptInputSchema).min(1),
  tests: z.array(GenerationTestCaseInputSchema).optional().default([]),
  options: AssertionGenerationOptionsSchema.partial().optional(),
});

export type AssertionGenerateRequest = z.infer<typeof AssertionGenerateRequestSchema>;

export const TestsGenerateRequestSchema = z.object({
  prompts: z.array(GenerationPromptInputSchema).min(1),
  tests: z.array(GenerationTestCaseInputSchema).optional().default([]),
  options: TestSuiteGenerationOptionsSchema.partial().optional(),
});

export type TestsGenerateRequest = z.infer<typeof TestsGenerateRequestSchema>;

export const AnalyzeConceptsRequestSchema = z.object({
  prompts: z.array(GenerationPromptInputSchema).min(1),
  options: ConceptExtractionOptionsSchema.partial().optional(),
});

export type AnalyzeConceptsRequest = z.infer<typeof AnalyzeConceptsRequestSchema>;

export const MeasureDiversityRequestSchema = z.object({
  testCases: z.array(z.record(z.string(), z.string())).min(1),
  options: DiversityOptionsSchema.partial().optional(),
});

export type MeasureDiversityRequest = z.infer<typeof MeasureDiversityRequestSchema>;

export const AnalyzeCoverageRequestSchema = z.object({
  prompts: z.array(GenerationPromptInputSchema).min(1),
  assertions: z.array(AssertionSchema).min(1),
});

export type AnalyzeCoverageRequest = z.infer<typeof AnalyzeCoverageRequestSchema>;

export const ValidateAssertionsRequestSchema = z.object({
  assertions: z.array(AssertionSchema).min(1),
  samples: z.array(SampleOutputSchema).min(1),
});

export type ValidateAssertionsRequest = z.infer<typeof ValidateAssertionsRequestSchema>;

export const GenerationSchemas = {
  DatasetGenerate: { Request: DatasetGenerateRequestSchema },
  AssertionGenerate: { Request: AssertionGenerateRequestSchema },
  TestsGenerate: { Request: TestsGenerateRequestSchema },
  AnalyzeConcepts: { Request: AnalyzeConceptsRequestSchema },
  MeasureDiversity: { Request: MeasureDiversityRequestSchema },
  AnalyzeCoverage: { Request: AnalyzeCoverageRequestSchema },
  ValidateAssertions: { Request: ValidateAssertionsRequestSchema },
} as const;
