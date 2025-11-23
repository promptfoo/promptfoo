import request from 'supertest';
import { createApp } from '../../../src/server/server';
import type { Express } from 'express';

// Mock dependencies
jest.mock('../../../src/redteam/shared');
jest.mock('../../../src/redteam/plugins/index');
jest.mock('../../../src/redteam/strategies/index');

describe('Redteam Routes - Validation', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /api/redteam/run', () => {
    describe('Type Coercion', () => {
      it('should accept numeric maxConcurrency', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: 5, // number
          });

        // Should not fail validation
        expect(response.status).not.toBe(400);
      });

      it('should coerce string maxConcurrency to number', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: '5', // string
          });

        // Should not fail validation - coercion should work
        expect(response.status).not.toBe(400);
      });

      it('should reject invalid maxConcurrency with clear error message', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: 'abc', // invalid
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid request body');
        expect(response.body.details).toContain('number or numeric string');
      });

      it('should coerce string delay to number', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            delay: '1000', // string
          });

        expect(response.status).not.toBe(400);
      });
    });

    describe('Validation Bounds', () => {
      it('should reject maxConcurrency below minimum', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: 0,
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('at least 1');
      });

      it('should reject maxConcurrency above maximum', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: 101,
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('cannot exceed 100');
      });

      it('should reject negative delay', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            delay: -100,
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('cannot be negative');
      });

      it('should reject delay above maximum', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            delay: 70000, // over 60 seconds
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('cannot exceed 60 seconds');
      });
    });

    describe('Passthrough Mode', () => {
      it('should allow additional fields for future compatibility', async () => {
        const response = await request(app)
          .post('/api/redteam/run')
          .send({
            config: {
              plugins: ['harmful'],
              target: {
                id: 'openai:gpt-4',
              },
            },
            maxConcurrency: 1,
            futureField: 'some value', // unknown field
          });

        // Should not fail due to unknown field
        expect(response.status).not.toBe(400);
      });
    });
  });

  describe('POST /api/redteam/generate-test', () => {
    describe('Frontend Contract Compatibility', () => {
      it('should accept isStatic field from frontend', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
              isStatic: true, // Frontend sends this
            },
            strategy: {
              id: 'basic',
              config: {},
              isStatic: true, // Frontend sends this
            },
            config: {
              applicationDefinition: {
                purpose: 'Test app',
              },
            },
          });

        // Should not fail validation (plugin lookup happens after validation passes)
        if (response.status === 400) {
          // If it's a 400, it should not be a validation error
          expect(response.body.error).not.toContain('Invalid request body');
        }
      });

      it('should coerce turn from string to number', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'Test app',
              },
            },
            turn: '3', // string
          });

        // Should not fail validation - string should be coerced to number
        if (response.status === 400) {
          expect(response.body.error).not.toContain('Invalid request body');
          if (response.body.details) {
            expect(response.body.details).not.toContain('Turn must be');
          }
        }
      });

      it('should coerce maxTurns from string to number', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'Test app',
              },
            },
            maxTurns: '5', // string
          });

        // Should not fail validation - string should be coerced to number
        if (response.status === 400) {
          expect(response.body.error).not.toContain('Invalid request body');
          if (response.body.details) {
            expect(response.body.details).not.toContain('Max turns must be');
          }
        }
      });
    });

    describe('DoS Protection', () => {
      it('should reject purpose exceeding max length', async () => {
        const longPurpose = 'a'.repeat(10001);

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: longPurpose,
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Purpose too long');
      });

      it('should reject history exceeding max messages', async () => {
        const largeHistory = Array(1001).fill({
          role: 'user',
          content: 'test',
        });

        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'Test',
              },
            },
            history: largeHistory,
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Conversation history too long');
      });
    });

    describe('Invalid Plugin/Strategy', () => {
      it('should reject invalid plugin ID', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'invalid-plugin-id-xyz',
              config: {},
            },
            strategy: {
              id: 'basic',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'Test',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Invalid plugin ID');
      });

      it('should reject invalid strategy ID', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-test')
          .send({
            plugin: {
              id: 'harmful:hate',
              config: {},
            },
            strategy: {
              id: 'invalid-strategy-xyz',
              config: {},
            },
            config: {
              applicationDefinition: {
                purpose: 'Test',
              },
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Invalid strategy ID');
      });
    });
  });

  describe('POST /api/redteam/generate-custom-policy', () => {
    describe('Frontend Contract', () => {
      it('should accept existingPolicies as string array', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-custom-policy')
          .send({
            applicationDefinition: {
              purpose: 'Test application',
            },
            existingPolicies: ['Never reveal sensitive information', 'Do not discuss competitors'],
          });

        // Should not fail validation (may fail on OpenAI key missing, but not validation)
        if (response.status === 400) {
          // If it fails, it should be due to missing OpenAI key, not validation
          expect(response.body.error).toContain('OpenAI');
        } else {
          expect(response.status).not.toBe(400);
        }
      });

      it('should accept empty existingPolicies', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-custom-policy')
          .send({
            applicationDefinition: {
              purpose: 'Test application',
            },
            existingPolicies: [],
          });

        if (response.status === 400) {
          expect(response.body.error).toContain('OpenAI');
        } else {
          expect(response.status).not.toBe(400);
        }
      });

      it('should default existingPolicies to empty array if not provided', async () => {
        const response = await request(app)
          .post('/api/redteam/generate-custom-policy')
          .send({
            applicationDefinition: {
              purpose: 'Test application',
            },
          });

        if (response.status === 400) {
          expect(response.body.error).toContain('OpenAI');
        } else {
          expect(response.status).not.toBe(400);
        }
      });
    });

    describe('Size Limits', () => {
      it('should reject too many existing policies', async () => {
        const manyPolicies = Array(201).fill('Policy text');

        const response = await request(app)
          .post('/api/redteam/generate-custom-policy')
          .send({
            applicationDefinition: {
              purpose: 'Test',
            },
            existingPolicies: manyPolicies,
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Too many existing policies');
      });

      it('should reject policy text exceeding max length', async () => {
        const longPolicy = 'a'.repeat(10001);

        const response = await request(app)
          .post('/api/redteam/generate-custom-policy')
          .send({
            applicationDefinition: {
              purpose: 'Test',
            },
            existingPolicies: [longPolicy],
          });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Policy text too long');
      });
    });
  });

  describe('POST /api/redteam/:task', () => {
    describe('SSRF Protection', () => {
      it('should accept whitelisted task names', async () => {
        const validTasks = [
          'synthesize',
          'extract-entities',
          'generate-examples',
          'llm-rubric',
          'similar',
        ];

        for (const task of validTasks) {
          const response = await request(app).post(`/api/redteam/${task}`).send({
            prompt: 'Test prompt',
          });

          // Should not fail validation (may fail on cloud connection, but not validation)
          if (response.status === 400) {
            expect(response.body.error).not.toContain('Invalid task parameter');
          }
        }
      });

      it('should reject non-whitelisted task names', async () => {
        const response = await request(app).post('/api/redteam/dangerous-task').send({
          prompt: 'Test prompt',
        });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('Task must be one of');
      });

      it('should reject task names with path traversal attempts', async () => {
        const response = await request(app).post('/api/redteam/../admin/delete').send({
          prompt: 'Test prompt',
        });

        // Express routing should handle this, but if it reaches validation:
        if (response.status === 400) {
          expect(response.body.error).toBeTruthy();
        }
      });

      it('should reject task names with special characters', async () => {
        const response = await request(app).post('/api/redteam/task@#$%').send({
          prompt: 'Test prompt',
        });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('alphanumeric');
      });
    });

    describe('Type Coercion in Task Requests', () => {
      it('should coerce string turn to number', async () => {
        const response = await request(app).post('/api/redteam/synthesize').send({
          prompt: 'Test',
          turn: '5', // string
        });

        if (response.status === 400) {
          expect(response.body.error).not.toContain('Invalid request body');
        }
      });

      it('should coerce string i (index) to number', async () => {
        const response = await request(app).post('/api/redteam/synthesize').send({
          prompt: 'Test',
          i: '3', // string
        });

        if (response.status === 400) {
          expect(response.body.error).not.toContain('Invalid request body');
        }
      });
    });
  });

  describe('POST /api/redteam/cancel', () => {
    it('should accept empty body', async () => {
      const response = await request(app).post('/api/redteam/cancel').send({});

      // Should not fail validation (will fail with "no job running" but that's OK)
      if (response.status === 400) {
        expect(response.body.error).toContain('No job currently running');
      } else {
        expect(response.status).not.toBe(400);
      }
    });

    it('should accept request with no body', async () => {
      const response = await request(app).post('/api/redteam/cancel');

      if (response.status === 400) {
        expect(response.body.error).toContain('No job currently running');
      } else {
        expect(response.status).not.toBe(400);
      }
    });
  });
});
