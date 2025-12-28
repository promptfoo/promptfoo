import { describe, expect, it } from 'vitest';
import {
  ConversationMessageSchema,
  MultiTurnStateSchema,
  TestCaseMetadataSchema,
  GenerateTestRequestSchema,
  GenerateTestSingleResponseSchema,
  GenerateTestBatchResponseSchema,
  GenerateTestResponseSchema,
  RunRedteamRequestSchema,
  RunRedteamResponseSchema,
  CancelRedteamResponseSchema,
  CloudTaskParamsSchema,
  GetRedteamStatusResponseSchema,
  PolicyObjectSchema,
  CustomPolicyGenerationRequestSchema,
  CustomPolicyGenerationResponseSchema,
} from '../../src/dtos/redteam.dto';

describe('Redteam DTOs', () => {
  describe('ConversationMessageSchema', () => {
    it('should validate user message', () => {
      const msg = { role: 'user' as const, content: 'Hello' };
      expect(ConversationMessageSchema.parse(msg)).toEqual(msg);
    });

    it('should validate assistant message', () => {
      const msg = { role: 'assistant' as const, content: 'Hi there!' };
      expect(ConversationMessageSchema.parse(msg)).toEqual(msg);
    });

    it('should reject invalid role', () => {
      expect(() =>
        ConversationMessageSchema.parse({ role: 'system', content: 'test' }),
      ).toThrow();
    });
  });

  describe('MultiTurnStateSchema', () => {
    it('should validate multi-turn state', () => {
      const state = {
        strategy: 'crescendo',
        turn: 2,
        nextTurn: 3,
        maxTurns: 5,
        done: false,
        stateful: true,
        history: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi!' },
        ],
      };
      expect(MultiTurnStateSchema.parse(state)).toEqual(state);
    });
  });

  describe('TestCaseMetadataSchema', () => {
    it('should validate minimal metadata', () => {
      const metadata = {};
      expect(TestCaseMetadataSchema.parse(metadata)).toEqual({});
    });

    it('should validate full metadata', () => {
      const metadata = {
        pluginId: 'harmful:hate',
        strategyId: 'jailbreak',
        goal: 'Test for hate speech',
        harmCategory: 'hate',
        pluginConfig: { severity: 'high' },
        purpose: 'Security testing',
        multiTurn: {
          strategy: 'crescendo',
          turn: 1,
          nextTurn: 2,
          maxTurns: 3,
          done: false,
          stateful: false,
          history: [],
        },
      };
      expect(TestCaseMetadataSchema.parse(metadata)).toMatchObject(metadata);
    });

    it('should allow additional fields (passthrough)', () => {
      const metadata = {
        pluginId: 'test',
        customField: 'custom value',
        anotherField: 123,
      };
      const parsed = TestCaseMetadataSchema.parse(metadata);
      expect(parsed.customField).toBe('custom value');
      expect(parsed.anotherField).toBe(123);
    });
  });

  describe('GenerateTestRequestSchema', () => {
    it('should validate minimal request', () => {
      const request = {
        plugin: { id: 'harmful:hate' },
        strategy: { id: 'basic' },
        config: {
          applicationDefinition: { purpose: null },
        },
      };
      expect(GenerateTestRequestSchema.parse(request)).toMatchObject(request);
    });

    it('should validate full request with all options', () => {
      const request = {
        plugin: {
          id: 'harmful:hate',
          config: { severity: 'high' },
        },
        strategy: {
          id: 'crescendo',
          config: { maxTurns: 5 },
        },
        config: {
          applicationDefinition: { purpose: 'AI assistant for customer support' },
        },
        turn: 2,
        maxTurns: 5,
        history: [
          { role: 'user' as const, content: 'Previous message' },
          { role: 'assistant' as const, content: 'Previous response' },
        ],
        goal: 'Elicit harmful response',
        stateful: true,
        count: 5,
      };
      const parsed = GenerateTestRequestSchema.parse(request);
      expect(parsed.count).toBe(5);
      expect(parsed.turn).toBe(2);
    });

    it('should enforce count limits', () => {
      const request = {
        plugin: { id: 'test' },
        strategy: { id: 'basic' },
        config: { applicationDefinition: { purpose: null } },
        count: 15, // exceeds max of 10
      };
      expect(() => GenerateTestRequestSchema.parse(request)).toThrow();
    });
  });

  describe('GenerateTestResponseSchema (discriminated union)', () => {
    it('should parse single response', () => {
      const response = {
        kind: 'single' as const,
        prompt: 'Test prompt',
        context: 'Test context',
        metadata: { pluginId: 'harmful:hate' },
      };
      const parsed = GenerateTestResponseSchema.parse(response);
      expect(parsed.kind).toBe('single');
      if (parsed.kind === 'single') {
        expect(parsed.prompt).toBe('Test prompt');
        expect(parsed.context).toBe('Test context');
      }
    });

    it('should parse batch response', () => {
      const response = {
        kind: 'batch' as const,
        testCases: [
          { prompt: 'Prompt 1', context: 'Context 1' },
          { prompt: 'Prompt 2', context: 'Context 2', metadata: { pluginId: 'test' } },
        ],
        count: 2,
      };
      const parsed = GenerateTestResponseSchema.parse(response);
      expect(parsed.kind).toBe('batch');
      if (parsed.kind === 'batch') {
        expect(parsed.testCases).toHaveLength(2);
        expect(parsed.count).toBe(2);
      }
    });

    it('should reject response without kind discriminator', () => {
      const response = {
        prompt: 'Test prompt',
        context: 'Test context',
      };
      expect(() => GenerateTestResponseSchema.parse(response)).toThrow();
    });

    it('should enable type-safe narrowing', () => {
      const singleResponse = {
        kind: 'single' as const,
        prompt: 'Test',
        context: 'Context',
      };
      const parsed = GenerateTestResponseSchema.parse(singleResponse);

      // This is the type-safe pattern we want users to use
      if (parsed.kind === 'single') {
        // TypeScript should know prompt exists here
        expect(parsed.prompt).toBe('Test');
      } else {
        // TypeScript should know testCases exists here
        expect(parsed.testCases).toBeDefined();
      }
    });
  });

  describe('GenerateTestSingleResponseSchema', () => {
    it('should require kind discriminator', () => {
      const response = {
        kind: 'single' as const,
        prompt: 'Test prompt',
        context: 'Test context',
      };
      expect(GenerateTestSingleResponseSchema.parse(response)).toEqual(response);
    });

    it('should reject wrong kind', () => {
      const response = {
        kind: 'batch',
        prompt: 'Test',
        context: 'Context',
      };
      expect(() => GenerateTestSingleResponseSchema.parse(response)).toThrow();
    });
  });

  describe('GenerateTestBatchResponseSchema', () => {
    it('should validate batch response', () => {
      const response = {
        kind: 'batch' as const,
        testCases: [
          { prompt: 'P1', context: 'C1' },
          { prompt: 'P2', context: 'C2' },
        ],
        count: 2,
      };
      expect(GenerateTestBatchResponseSchema.parse(response)).toEqual(response);
    });

    it('should require testCases array', () => {
      const response = {
        kind: 'batch' as const,
        count: 0,
      };
      expect(() => GenerateTestBatchResponseSchema.parse(response)).toThrow();
    });
  });

  describe('RunRedteamRequestSchema', () => {
    it('should validate minimal request', () => {
      const request = { config: {} };
      expect(RunRedteamRequestSchema.parse(request)).toEqual(request);
    });

    it('should validate full request', () => {
      const request = {
        config: { description: 'Test run' },
        force: true,
        verbose: true,
        delay: 1000,
        maxConcurrency: 5,
      };
      expect(RunRedteamRequestSchema.parse(request)).toEqual(request);
    });
  });

  describe('RunRedteamResponseSchema', () => {
    it('should validate response with job ID', () => {
      const response = { id: 'job-12345' };
      expect(RunRedteamResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('CancelRedteamResponseSchema', () => {
    it('should validate cancel response', () => {
      const response = { message: 'Job cancelled' };
      expect(CancelRedteamResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('GetRedteamStatusResponseSchema', () => {
    it('should validate status with running job', () => {
      const response = {
        hasRunningJob: true,
        jobId: 'job-123',
      };
      expect(GetRedteamStatusResponseSchema.parse(response)).toEqual(response);
    });

    it('should validate status with no running job', () => {
      const response = {
        hasRunningJob: false,
        jobId: null,
      };
      expect(GetRedteamStatusResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('CustomPolicyGenerationSchemas', () => {
    it('should validate policy object', () => {
      const policy = {
        id: 'policy-1',
        name: 'No hate speech',
        text: 'The AI must not generate hate speech',
      };
      expect(PolicyObjectSchema.parse(policy)).toEqual(policy);
    });

    it('should validate generation request', () => {
      const request = {
        applicationDefinition: { purpose: 'Customer support' },
        existingPolicies: ['No harmful content'],
      };
      expect(CustomPolicyGenerationRequestSchema.parse(request)).toEqual(request);
    });

    it('should validate generation response', () => {
      const response = {
        result: [
          { id: 'p1', name: 'Policy 1', text: 'Policy text' },
        ],
        error: null,
        task: 'custom-policy-generation-task',
      };
      expect(CustomPolicyGenerationResponseSchema.parse(response)).toEqual(response);
    });
  });
});
