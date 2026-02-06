import { describe, expect, it } from 'vitest';
import {
  AssertionGenerationOptionsSchema,
  ConceptAnalysisSchema,
  DatasetGenerationOptionsSchema,
  DiversityMetricsSchema,
  EdgeCaseSchema,
  GenerationJobSchema,
  PersonaSchema,
  RequirementCoverageSchema,
  RequirementSchema,
} from '../../src/generation/types';

describe('generation types', () => {
  describe('PersonaSchema', () => {
    it('should validate a complete persona', () => {
      const persona = {
        name: 'Tech-savvy Developer',
        description: 'An experienced software developer',
        demographics: {
          ageRange: '25-35',
          region: 'North America',
          expertise: 'expert',
        },
        goals: ['Build efficient code', 'Learn new technologies'],
        behaviors: ['Uses keyboard shortcuts', 'Reads documentation'],
        edge: 'Impatient and skips tutorials',
      };

      const result = PersonaSchema.safeParse(persona);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal persona with name and description', () => {
      const persona = {
        name: 'Casual User',
        description: 'A typical end user',
      };

      const result = PersonaSchema.safeParse(persona);
      expect(result.success).toBe(true);
    });

    it('should reject persona without name', () => {
      const persona = {
        description: 'Missing name field',
      };

      const result = PersonaSchema.safeParse(persona);
      expect(result.success).toBe(false);
    });

    it('should reject persona without description', () => {
      const persona = {
        name: 'Missing description',
      };

      const result = PersonaSchema.safeParse(persona);
      expect(result.success).toBe(false);
    });
  });

  describe('EdgeCaseSchema', () => {
    it('should validate a complete edge case', () => {
      const edgeCase = {
        vars: { input: '' },
        type: 'empty',
        description: 'Empty input test',
      };

      const result = EdgeCaseSchema.safeParse(edgeCase);
      expect(result.success).toBe(true);
    });

    it('should validate edge case with severity', () => {
      const edgeCase = {
        vars: { input: 'test' },
        type: 'boundary',
        description: 'Boundary test',
        severity: 'high',
      };

      const result = EdgeCaseSchema.safeParse(edgeCase);
      expect(result.success).toBe(true);
    });

    it('should reject edge case without required fields', () => {
      const edgeCase = {
        vars: { input: 'test' },
      };

      const result = EdgeCaseSchema.safeParse(edgeCase);
      expect(result.success).toBe(false);
    });
  });

  describe('ConceptAnalysisSchema', () => {
    it('should validate a complete concept analysis', () => {
      const analysis = {
        topics: [
          { name: 'AI', description: 'Artificial Intelligence' },
          { name: 'Machine Learning', relevance: 0.8 },
        ],
        entities: [
          { name: 'user', type: 'actor' },
          { name: 'model', occurrences: 5 },
        ],
        constraints: [
          { description: 'Must be under 100 words', type: 'length', source: 'explicit' },
          { description: 'No technical jargon', type: 'style' },
        ],
        variableRelationships: [{ variables: ['input', 'output'], relationship: 'generates' }],
      };

      const result = ConceptAnalysisSchema.safeParse(analysis);
      expect(result.success).toBe(true);
    });

    it('should validate an empty concept analysis', () => {
      const analysis = {
        topics: [],
        entities: [],
        constraints: [],
      };

      const result = ConceptAnalysisSchema.safeParse(analysis);
      expect(result.success).toBe(true);
    });

    it('should reject topics that are just strings', () => {
      const analysis = {
        topics: ['AI', 'ML'], // Should be objects with name property
        entities: [],
        constraints: [],
      };

      const result = ConceptAnalysisSchema.safeParse(analysis);
      expect(result.success).toBe(false);
    });
  });

  describe('DiversityMetricsSchema', () => {
    it('should validate complete diversity metrics', () => {
      const metrics = {
        score: 0.85,
        averageDistance: 0.6,
        minDistance: 0.2,
        maxDistance: 0.9,
        clusterCount: 3,
        coverageGaps: ['More technical queries needed'],
        distribution: {
          byTopic: { AI: 10, ML: 5 },
          byVariable: {
            query: { uniqueValues: 15, coverage: 0.8 },
          },
        },
      };

      const result = DiversityMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });

    it('should validate minimal diversity metrics', () => {
      const metrics = {
        score: 0.5,
        averageDistance: 0.5,
        minDistance: 0.1,
        maxDistance: 0.9,
      };

      const result = DiversityMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });

    it('should reject score outside 0-1 range', () => {
      const metrics = {
        score: 1.5,
        averageDistance: 0.5,
        minDistance: 0.1,
        maxDistance: 0.9,
      };

      const result = DiversityMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(false);
    });
  });

  describe('DatasetGenerationOptionsSchema', () => {
    it('should validate empty options', () => {
      const options = {};

      const result = DatasetGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should validate complete options', () => {
      const options = {
        instructions: 'Generate diverse test cases',
        numPersonas: 10,
        numTestCasesPerPersona: 5,
        provider: 'openai:gpt-4',
        concepts: {
          maxTopics: 10,
          maxEntities: 20,
        },
        personas: {
          type: 'mixed',
          grounded: true,
        },
        edgeCases: {
          enabled: true,
          types: ['boundary', 'format', 'empty'],
          count: 15,
        },
        diversity: {
          enabled: true,
          targetScore: 0.8,
          embeddingProvider: 'openai:text-embedding-ada-002',
        },
        iterative: {
          enabled: true,
          maxRounds: 3,
        },
      };

      const result = DatasetGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should reject invalid persona type', () => {
      const options = {
        personas: {
          type: 'invalid-type',
        },
      };

      const result = DatasetGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });
  });

  describe('AssertionGenerationOptionsSchema', () => {
    it('should validate empty options', () => {
      const options = {};

      const result = AssertionGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should validate complete options', () => {
      const options = {
        instructions: 'Generate strict assertions',
        numQuestions: 10,
        provider: 'openai:gpt-4',
        type: 'llm-rubric',
        coverage: {
          enabled: true,
          extractRequirements: true,
        },
        validation: {
          enabled: true,
          sampleOutputs: [
            { output: 'Hello, World!', expectedPass: true },
            { output: 'Error', expectedPass: false },
          ],
          autoGenerateSamples: false,
        },
        negativeTests: {
          enabled: true,
          types: ['should-not-contain', 'should-not-hallucinate'],
        },
        assertionTypes: ['pi', 'llm-rubric', 'similar'],
      };

      const result = AssertionGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should reject invalid assertion type', () => {
      const options = {
        type: 'invalid-type',
      };

      const result = AssertionGenerationOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });
  });

  describe('RequirementSchema', () => {
    it('should validate a complete requirement', () => {
      const requirement = {
        id: 'req-1',
        description: 'Must respond in under 2 seconds',
        source: 'explicit',
        testability: 'objective',
        priority: 'high',
        category: 'performance',
      };

      const result = RequirementSchema.safeParse(requirement);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal requirement', () => {
      const requirement = {
        id: 'req-2',
        description: 'Must be polite',
        source: 'implied',
        testability: 'subjective',
      };

      const result = RequirementSchema.safeParse(requirement);
      expect(result.success).toBe(true);
    });
  });

  describe('RequirementCoverageSchema', () => {
    it('should validate a complete requirement coverage', () => {
      const coverage = {
        requirement: {
          id: 'req-1',
          description: 'Must respond in under 2 seconds',
          source: 'explicit',
          testability: 'objective',
        },
        coveredBy: ['assertion-1', 'assertion-2'],
        coverageLevel: 'full',
        gaps: [],
      };

      const result = RequirementCoverageSchema.safeParse(coverage);
      expect(result.success).toBe(true);
    });

    it('should reject invalid coverage level', () => {
      const coverage = {
        requirement: {
          id: 'req-1',
          description: 'Must respond',
          source: 'explicit',
          testability: 'objective',
        },
        coveredBy: [],
        coverageLevel: 'invalid',
      };

      const result = RequirementCoverageSchema.safeParse(coverage);
      expect(result.success).toBe(false);
    });
  });

  describe('GenerationJobSchema', () => {
    it('should validate a pending job', () => {
      const job = {
        id: 'job-123',
        type: 'dataset',
        status: 'pending',
        progress: 0,
        total: 0,
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = GenerationJobSchema.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate a completed job with result', () => {
      const job = {
        id: 'job-456',
        type: 'assertions',
        status: 'complete',
        progress: 10,
        total: 10,
        phase: 'Done',
        logs: ['Started', 'Completed'],
        createdAt: new Date(),
        updatedAt: new Date(),
        result: {
          assertions: [{ type: 'pi', value: 'test' }],
        },
      };

      const result = GenerationJobSchema.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate a failed job with error', () => {
      const job = {
        id: 'job-789',
        type: 'dataset',
        status: 'error',
        progress: 5,
        total: 10,
        phase: 'Failed at generation',
        logs: ['Started', 'Error occurred'],
        createdAt: new Date(),
        updatedAt: new Date(),
        error: 'API rate limit exceeded',
      };

      const result = GenerationJobSchema.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should reject invalid job status', () => {
      const job = {
        id: 'job-123',
        type: 'dataset',
        status: 'invalid-status',
        progress: 0,
        total: 0,
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = GenerationJobSchema.safeParse(job);
      expect(result.success).toBe(false);
    });
  });
});
