import { describe, expect, it } from 'vitest';
import {
  toEvalDTO,
  toEvalDetailDTO,
  toConfigDTO,
  toConfigDetailDTO,
  toModelAuditDTO,
  toModelAuditDetailDTO,
  toTraceDTO,
  toSpanDTO,
  toEvalDTOs,
  toConfigDTOs,
  toModelAuditDTOs,
  toTraceDTOs,
  toSpanDTOs,
  type EvalRow,
  type ConfigRow,
  type ModelAuditRow,
  type TraceRow,
  type SpanRow,
} from '../../src/database/mappers';

describe('Database Mappers', () => {
  describe('Eval Mappers', () => {
    const mockEvalRow: EvalRow = {
      id: 'eval-123',
      createdAt: 1704067200000, // 2024-01-01
      author: 'test-author',
      description: 'Test evaluation',
      isRedteam: false,
      config: { providers: ['openai:gpt-4'] },
      results: { stats: { successes: 10 } },
      prompts: [{ id: 'prompt-1' }],
      vars: ['input', 'output'],
    };

    describe('toEvalDTO', () => {
      it('should map eval row to list-view DTO', () => {
        const dto = toEvalDTO(mockEvalRow);

        expect(dto).toEqual({
          id: 'eval-123',
          createdAt: 1704067200000,
          author: 'test-author',
          description: 'Test evaluation',
          isRedteam: false,
        });
      });

      it('should not include config/results in list DTO', () => {
        const dto = toEvalDTO(mockEvalRow);

        expect(dto).not.toHaveProperty('config');
        expect(dto).not.toHaveProperty('results');
        expect(dto).not.toHaveProperty('prompts');
        expect(dto).not.toHaveProperty('vars');
      });

      it('should handle null optional fields', () => {
        const row: EvalRow = {
          ...mockEvalRow,
          author: null,
          description: null,
        };
        const dto = toEvalDTO(row);

        expect(dto.author).toBeNull();
        expect(dto.description).toBeNull();
      });
    });

    describe('toEvalDetailDTO', () => {
      it('should include all fields for detail view', () => {
        const dto = toEvalDetailDTO(mockEvalRow);

        expect(dto).toEqual({
          id: 'eval-123',
          createdAt: 1704067200000,
          author: 'test-author',
          description: 'Test evaluation',
          isRedteam: false,
          config: { providers: ['openai:gpt-4'] },
          results: { stats: { successes: 10 } },
          prompts: [{ id: 'prompt-1' }],
          vars: ['input', 'output'],
        });
      });
    });

    describe('toEvalDTOs', () => {
      it('should map array of rows', () => {
        const rows = [mockEvalRow, { ...mockEvalRow, id: 'eval-456' }];
        const dtos = toEvalDTOs(rows);

        expect(dtos).toHaveLength(2);
        expect(dtos[0].id).toBe('eval-123');
        expect(dtos[1].id).toBe('eval-456');
      });

      it('should handle empty array', () => {
        expect(toEvalDTOs([])).toEqual([]);
      });
    });
  });

  describe('Config Mappers', () => {
    const mockConfigRow: ConfigRow = {
      id: 'config-123',
      name: 'My Config',
      type: 'redteam',
      createdAt: 1704067200000,
      updatedAt: 1704153600000,
      config: { target: 'openai:gpt-4' },
    };

    describe('toConfigDTO', () => {
      it('should map config row to list-view DTO', () => {
        const dto = toConfigDTO(mockConfigRow);

        expect(dto).toEqual({
          id: 'config-123',
          name: 'My Config',
          type: 'redteam',
          createdAt: 1704067200000,
          updatedAt: 1704153600000,
        });
      });

      it('should not include config content', () => {
        const dto = toConfigDTO(mockConfigRow);
        expect(dto).not.toHaveProperty('config');
      });
    });

    describe('toConfigDetailDTO', () => {
      it('should include config content', () => {
        const dto = toConfigDetailDTO(mockConfigRow);

        expect(dto.config).toEqual({ target: 'openai:gpt-4' });
      });
    });
  });

  describe('ModelAudit Mappers', () => {
    const mockModelAuditRow: ModelAuditRow = {
      id: 'audit-123',
      createdAt: 1704067200000,
      updatedAt: 1704153600000,
      name: 'Model Audit',
      author: 'auditor',
      modelPath: '/path/to/model',
      modelType: 'pytorch',
      hasErrors: false,
      totalChecks: 10,
      passedChecks: 8,
      failedChecks: 2,
      modelId: 'model-456',
      revisionSha: 'abc123',
      contentHash: 'def456',
      modelSource: 'huggingface',
      scannerVersion: '1.0.0',
      results: { findings: [] },
      checks: [{ name: 'check1', passed: true }],
      issues: [{ severity: 'warning', message: 'test' }],
      metadata: { extra: 'data' },
    };

    describe('toModelAuditDTO', () => {
      it('should map model audit row to list-view DTO', () => {
        const dto = toModelAuditDTO(mockModelAuditRow);

        expect(dto).toEqual({
          id: 'audit-123',
          createdAt: 1704067200000,
          updatedAt: 1704153600000,
          name: 'Model Audit',
          author: 'auditor',
          modelPath: '/path/to/model',
          modelType: 'pytorch',
          hasErrors: false,
          totalChecks: 10,
          passedChecks: 8,
          failedChecks: 2,
          modelId: 'model-456',
          revisionSha: 'abc123',
          contentHash: 'def456',
          modelSource: 'huggingface',
          scannerVersion: '1.0.0',
        });
      });

      it('should not include results/checks/issues', () => {
        const dto = toModelAuditDTO(mockModelAuditRow);
        expect(dto).not.toHaveProperty('results');
        expect(dto).not.toHaveProperty('checks');
        expect(dto).not.toHaveProperty('issues');
        expect(dto).not.toHaveProperty('metadata');
      });
    });

    describe('toModelAuditDetailDTO', () => {
      it('should include all detail fields', () => {
        const dto = toModelAuditDetailDTO(mockModelAuditRow);

        expect(dto.results).toEqual({ findings: [] });
        expect(dto.checks).toEqual([{ name: 'check1', passed: true }]);
        expect(dto.issues).toEqual([{ severity: 'warning', message: 'test' }]);
        expect(dto.metadata).toEqual({ extra: 'data' });
      });
    });
  });

  describe('Trace Mappers', () => {
    const mockTraceRow: TraceRow = {
      id: 'trace-123',
      traceId: 'tr-456',
      evaluationId: 'eval-789',
      testCaseId: 'tc-012',
      createdAt: 1704067200000,
      metadata: { key: 'value' },
    };

    describe('toTraceDTO', () => {
      it('should map trace row to DTO', () => {
        const dto = toTraceDTO(mockTraceRow);

        expect(dto).toEqual({
          id: 'trace-123',
          traceId: 'tr-456',
          evaluationId: 'eval-789',
          testCaseId: 'tc-012',
          createdAt: 1704067200000,
          metadata: { key: 'value' },
        });
      });

      it('should handle null metadata', () => {
        const row = { ...mockTraceRow, metadata: null };
        const dto = toTraceDTO(row);
        expect(dto.metadata).toBeNull();
      });
    });
  });

  describe('Span Mappers', () => {
    const mockSpanRow: SpanRow = {
      id: 'span-123',
      traceId: 'tr-456',
      spanId: 'sp-789',
      parentSpanId: 'sp-parent',
      name: 'llm.call',
      startTime: 1704067200000,
      endTime: 1704067201000,
      attributes: { model: 'gpt-4' },
      statusCode: 0,
      statusMessage: 'OK',
    };

    describe('toSpanDTO', () => {
      it('should map span row to DTO', () => {
        const dto = toSpanDTO(mockSpanRow);

        expect(dto).toEqual({
          id: 'span-123',
          traceId: 'tr-456',
          spanId: 'sp-789',
          parentSpanId: 'sp-parent',
          name: 'llm.call',
          startTime: 1704067200000,
          endTime: 1704067201000,
          attributes: { model: 'gpt-4' },
          statusCode: 0,
          statusMessage: 'OK',
        });
      });

      it('should handle null optional fields', () => {
        const row: SpanRow = {
          ...mockSpanRow,
          parentSpanId: null,
          endTime: null,
          attributes: null,
          statusCode: null,
          statusMessage: null,
        };
        const dto = toSpanDTO(row);

        expect(dto.parentSpanId).toBeNull();
        expect(dto.endTime).toBeNull();
        expect(dto.attributes).toBeNull();
        expect(dto.statusCode).toBeNull();
        expect(dto.statusMessage).toBeNull();
      });
    });

    describe('toSpanDTOs', () => {
      it('should map array of spans', () => {
        const rows = [mockSpanRow, { ...mockSpanRow, id: 'span-456' }];
        const dtos = toSpanDTOs(rows);

        expect(dtos).toHaveLength(2);
        expect(dtos[0].id).toBe('span-123');
        expect(dtos[1].id).toBe('span-456');
      });
    });
  });

  describe('Batch Mappers', () => {
    it('toConfigDTOs should map config array', () => {
      const rows: ConfigRow[] = [
        {
          id: 'c1',
          name: 'Config 1',
          type: 'eval',
          createdAt: 1000,
          updatedAt: 2000,
          config: {},
        },
      ];
      expect(toConfigDTOs(rows)).toHaveLength(1);
    });

    it('toModelAuditDTOs should map audit array', () => {
      const rows: ModelAuditRow[] = [
        {
          id: 'a1',
          createdAt: 1000,
          updatedAt: 2000,
          name: null,
          author: null,
          modelPath: '/path',
          modelType: null,
          hasErrors: false,
          totalChecks: null,
          passedChecks: null,
          failedChecks: null,
          modelId: null,
          revisionSha: null,
          contentHash: null,
          modelSource: null,
          scannerVersion: null,
          results: {},
          checks: null,
          issues: null,
          metadata: null,
        },
      ];
      expect(toModelAuditDTOs(rows)).toHaveLength(1);
    });

    it('toTraceDTOs should map trace array', () => {
      const rows: TraceRow[] = [
        {
          id: 't1',
          traceId: 'tr1',
          evaluationId: 'e1',
          testCaseId: 'tc1',
          createdAt: 1000,
          metadata: null,
        },
      ];
      expect(toTraceDTOs(rows)).toHaveLength(1);
    });
  });
});
