import { z } from 'zod';
import { ApiSchemas } from '../../src/server/apiSchemas';
import {
  ConfigDTOSchemas,
  EvalDTOSchemas,
  EvalJobDTOSchemas,
  ModelAuditDTOSchemas,
  ProviderDTOSchemas,
  RedteamDTOSchemas,
  TraceDTOSchemas,
  UserDTOSchemas,
} from '../../src/shared/dto';

describe('DTO Schema Validation', () => {
  describe('ApiSchemas exports match shared DTOs', () => {
    it('should export all Config schemas correctly', () => {
      expect(ApiSchemas.Config).toBe(ConfigDTOSchemas);
      expect(ApiSchemas.Config.List).toBeDefined();
      expect(ApiSchemas.Config.Get).toBeDefined();
      expect(ApiSchemas.Config.Create).toBeDefined();
      expect(ApiSchemas.Config.GetByType).toBeDefined();
    });

    it('should export all Eval schemas correctly', () => {
      expect(ApiSchemas.Eval).toBe(EvalDTOSchemas);
      expect(ApiSchemas.Eval.Create).toBeDefined();
      expect(ApiSchemas.Eval.Update).toBeDefined();
      expect(ApiSchemas.Eval.UpdateAuthor).toBeDefined();
      expect(ApiSchemas.Eval.GetTable).toBeDefined();
      expect(ApiSchemas.Eval.AddResults).toBeDefined();
      expect(ApiSchemas.Eval.UpdateResultRating).toBeDefined();
      expect(ApiSchemas.Eval.Delete).toBeDefined();
    });

    it('should export all EvalJob schemas correctly', () => {
      expect(ApiSchemas.EvalJob).toBe(EvalJobDTOSchemas);
      expect(ApiSchemas.EvalJob.Create).toBeDefined();
      expect(ApiSchemas.EvalJob.Get).toBeDefined();
    });

    it('should export all Provider schemas correctly', () => {
      expect(ApiSchemas.Provider).toBe(ProviderDTOSchemas);
      expect(ApiSchemas.Provider.Test).toBeDefined();
      expect(ApiSchemas.Provider.Discover).toBeDefined();
    });

    it('should export all Redteam schemas correctly', () => {
      expect(ApiSchemas.Redteam).toBe(RedteamDTOSchemas);
      expect(ApiSchemas.Redteam.Run).toBeDefined();
      expect(ApiSchemas.Redteam.Cancel).toBeDefined();
      expect(ApiSchemas.Redteam.Status).toBeDefined();
    });

    it('should export all Trace schemas correctly', () => {
      expect(ApiSchemas.Trace).toBe(TraceDTOSchemas);
      expect(ApiSchemas.Trace.GetByEvaluation).toBeDefined();
      expect(ApiSchemas.Trace.Get).toBeDefined();
    });

    it('should export all ModelAudit schemas correctly', () => {
      expect(ApiSchemas.ModelAudit).toBe(ModelAuditDTOSchemas);
      expect(ApiSchemas.ModelAudit.CheckInstalled).toBeDefined();
      expect(ApiSchemas.ModelAudit.CheckPath).toBeDefined();
      expect(ApiSchemas.ModelAudit.Scan).toBeDefined();
    });

    it('should export all User schemas correctly', () => {
      expect(ApiSchemas.User).toBe(UserDTOSchemas);
      expect(ApiSchemas.User.Get).toBeDefined();
      expect(ApiSchemas.User.GetId).toBeDefined();
      expect(ApiSchemas.User.Update).toBeDefined();
      expect(ApiSchemas.User.EmailStatus).toBeDefined();
    });
  });

  describe('Schema validation examples', () => {
    describe('EvalJob schemas', () => {
      it('should validate create request with minimal data', () => {
        const minimalRequest = {
          prompts: ['Test prompt'],
          providers: ['openai:gpt-3.5-turbo'],
        };

        const result = ApiSchemas.EvalJob.Create.Request.safeParse(minimalRequest);
        expect(result.success).toBe(true);
      });

      it('should validate create request with full data', () => {
        const fullRequest = {
          prompts: ['Test prompt'],
          providers: ['openai:gpt-3.5-turbo'],
          tests: [{ assert: { type: 'equals', value: 'expected' } }],
          evaluateOptions: {
            maxConcurrency: 5,
            showProgressBar: true,
          },
          sharing: false,
        };

        const result = ApiSchemas.EvalJob.Create.Request.safeParse(fullRequest);
        expect(result.success).toBe(true);
      });

      it('should accept create request without prompts/providers due to catchall', () => {
        const requestWithOnlyTests = {
          // The schema uses catchall, so this is valid
          tests: [{ assert: { type: 'equals', value: 'expected' } }],
        };

        const result = ApiSchemas.EvalJob.Create.Request.safeParse(requestWithOnlyTests);
        expect(result.success).toBe(true);
      });
    });

    describe('Provider schemas', () => {
      it('should validate test request', () => {
        const testRequest = {
          id: 'openai:gpt-3.5-turbo',
          config: { temperature: 0.7 },
        };

        const result = ApiSchemas.Provider.Test.Request.safeParse(testRequest);
        expect(result.success).toBe(true);
      });

      it('should validate test response', () => {
        const testResponse = {
          success: true,
          output: 'Test response from provider',
          tokenUsage: {
            total: 100,
            prompt: 50,
            completion: 50,
          },
          cost: 0.002,
        };

        const result = ApiSchemas.Provider.Test.Response.safeParse(testResponse);
        expect(result.success).toBe(true);
      });
    });

    describe('ModelAudit schemas', () => {
      it('should validate scan request with options', () => {
        const scanRequest = {
          paths: ['/models/suspicious.pkl', '/models/untrusted.h5'],
          options: {
            exclude: ['*.tmp', '*.backup'],
            timeout: 120,
            maxFileSize: 50000000,
            maxTotalSize: 1000000000,
            verbose: true,
          },
        };

        const result = ApiSchemas.ModelAudit.Scan.Request.safeParse(scanRequest);
        expect(result.success).toBe(true);
      });

      it('should validate scan response with findings', () => {
        const scanResponse = {
          success: true,
          results: {
            totalFiles: 10,
            scannedFiles: 8,
            findings: [
              {
                file: '/models/suspicious.pkl',
                severity: 'high',
                type: 'security',
                message: 'Potential arbitrary code execution via pickle',
                details: {
                  line: 42,
                  code: 'pickle.loads(data)',
                },
              },
            ],
            summary: {
              critical: 0,
              high: 1,
              medium: 2,
              low: 5,
            },
          },
        };

        const result = ApiSchemas.ModelAudit.Scan.Response.safeParse(scanResponse);
        expect(result.success).toBe(true);
      });
    });

    describe('Trace schemas', () => {
      it('should validate trace with spans', () => {
        const traceData = {
          trace: {
            traceId: 'trace-123',
            evalId: 'eval-456',
            createdAt: new Date().toISOString(),
            spans: [
              {
                spanId: 'span-1',
                traceId: 'trace-123',
                name: 'API Call',
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                attributes: {
                  'http.method': 'POST',
                  'http.url': 'https://api.openai.com/v1/completions',
                },
              },
            ],
          },
        };

        const result = ApiSchemas.Trace.Get.Response.safeParse(traceData);
        expect(result.success).toBe(true);
      });
    });

    describe('Config schemas', () => {
      it('should validate config list with type filter', () => {
        const listQuery = { type: 'prompt' };
        const result = ApiSchemas.Config.List.Query.safeParse(listQuery);
        expect(result.success).toBe(true);
      });

      it('should reject invalid config type', () => {
        const listQuery = { type: 'invalid-type' };
        const result = ApiSchemas.Config.List.Query.safeParse(listQuery);
        expect(result.success).toBe(false);
      });
    });

    describe('Eval schemas', () => {
      it('should validate eval table query with all filters', () => {
        const tableQuery = {
          limit: 100,
          offset: 50,
          filter: 'failures',
          query: 'search term',
          metadataFilter: {
            metric: 'accuracy',
          },
        };

        const result = ApiSchemas.Eval.GetTable.Query.safeParse(tableQuery);
        expect(result.success).toBe(true);
      });

      it('should provide default values for optional query params', () => {
        const emptyQuery = {};
        const result = ApiSchemas.Eval.GetTable.Query.parse(emptyQuery);
        
        // Only offset has a default value (0) in the schema
        expect(result.offset).toBe(0);
        // Other fields are optional without defaults
        expect(result.limit).toBeUndefined();
        expect(result.filter).toBeUndefined();
        expect(result.query).toBeUndefined();
      });
    });
  });

  describe('Type inference validation', () => {
    it('should correctly infer request types', () => {
      // This test ensures TypeScript can properly infer types from schemas
      type ProviderTestRequest = z.infer<typeof ApiSchemas.Provider.Test.Request>;
      
      const request: ProviderTestRequest = {
        id: 'test-provider',
        config: { key: 'value' },
      };

      expect(request.id).toBe('test-provider');
      expect(request.config).toEqual({ key: 'value' });
    });

    it('should correctly infer response types', () => {
      type ConfigListResponse = z.infer<typeof ApiSchemas.Config.List.Response>;
      
      const response: ConfigListResponse = {
        configs: [
          {
            id: 'config-1',
            description: 'Test config',
            pluginModule: '',
            redteam: undefined,
          },
        ],
      };

      expect(response.configs).toHaveLength(1);
      expect(response.configs[0].id).toBe('config-1');
    });
  });

  describe('Error message validation', () => {
    it('should provide clear error messages for validation failures', () => {
      const invalidRequest = {
        paths: 'not-an-array', // Should be an array
      };

      const result = ApiSchemas.ModelAudit.Scan.Request.safeParse(invalidRequest);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors).toContainEqual(
          expect.objectContaining({
            path: ['paths'],
            message: expect.any(String),
          })
        );
      }
    });
  });
});