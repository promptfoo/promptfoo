import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAssertions } from '../../src/generation/assertions';
import { generateDataset } from '../../src/generation/dataset';
import { generateTestSuite } from '../../src/generation/index';

vi.mock('../../src/generation/assertions', () => ({
  generateAssertions: vi.fn(),
}));

vi.mock('../../src/generation/dataset', () => ({
  generateDataset: vi.fn(),
}));

const mockGenerateDataset = vi.mocked(generateDataset);
const mockGenerateAssertions = vi.mocked(generateAssertions);

const prompts = [{ raw: 'Return JSON', label: 'Prompt' }];
const existingTests = [{ vars: { city: 'Paris' } }];

describe('generateTestSuite', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(250);
  });

  it('runs dataset and assertion generation in parallel when requested', async () => {
    mockGenerateDataset.mockResolvedValue({
      testCases: [{ city: 'London' }],
      metadata: {
        totalGenerated: 1,
        durationMs: 10,
        provider: 'dataset-provider',
      },
    });
    mockGenerateAssertions.mockResolvedValue({
      assertions: [{ type: 'contains', value: 'London' }],
      metadata: {
        totalGenerated: 1,
        pythonConverted: 0,
        durationMs: 20,
        provider: 'assertion-provider',
      },
    });

    const result = await generateTestSuite(
      prompts,
      existingTests,
      {
        parallel: true,
        dataset: { provider: 'dataset-provider' },
        assertions: { provider: 'assertion-provider' },
      },
      { jobId: 'job-parallel' },
    );

    expect(mockGenerateDataset).toHaveBeenCalledWith(
      prompts,
      existingTests,
      expect.objectContaining({ provider: 'dataset-provider' }),
      { jobId: 'job-parallel' },
    );
    expect(mockGenerateAssertions).toHaveBeenCalledWith(
      prompts,
      existingTests,
      expect.objectContaining({ provider: 'assertion-provider' }),
      { jobId: 'job-parallel' },
    );
    expect(result).toMatchObject({
      metadata: {
        provider: 'dataset-provider',
        totalDurationMs: 150,
      },
    });
  });

  it('feeds sequential dataset output into assertion generation', async () => {
    mockGenerateDataset.mockResolvedValue({
      testCases: [{ city: 'Berlin' }, { city: 'Tokyo' }],
      metadata: {
        totalGenerated: 2,
        durationMs: 10,
        provider: 'dataset-provider',
      },
    });
    mockGenerateAssertions.mockResolvedValue({
      assertions: [{ type: 'contains', value: 'Berlin' }],
      metadata: {
        totalGenerated: 1,
        pythonConverted: 0,
        durationMs: 20,
        provider: 'assertion-provider',
      },
    });

    const result = await generateTestSuite(prompts, existingTests, {
      assertions: { provider: 'assertion-provider' },
    });

    expect(mockGenerateDataset).toHaveBeenCalledWith(prompts, existingTests, {}, undefined);
    expect(mockGenerateAssertions).toHaveBeenCalledWith(
      prompts,
      [
        ...existingTests,
        { vars: { city: 'Berlin' } },
        { vars: { city: 'Tokyo' } },
      ],
      expect.objectContaining({ provider: 'assertion-provider' }),
      undefined,
    );
    expect(result).toMatchObject({
      metadata: {
        provider: 'assertion-provider',
        totalDurationMs: 150,
      },
    });
  });

  it('supports assertion-only generation without creating a dataset first', async () => {
    mockGenerateAssertions.mockResolvedValue({
      assertions: [{ type: 'contains', value: 'Paris' }],
      metadata: {
        totalGenerated: 1,
        pythonConverted: 0,
        durationMs: 20,
        provider: 'assertion-provider',
      },
    });

    const result = await generateTestSuite(prompts, existingTests, {
      skipDataset: true,
      assertions: { provider: 'assertion-provider' },
    });

    expect(mockGenerateDataset).not.toHaveBeenCalled();
    expect(mockGenerateAssertions).toHaveBeenCalledWith(
      prompts,
      existingTests,
      expect.objectContaining({ provider: 'assertion-provider' }),
      undefined,
    );
    expect(result.dataset).toBeUndefined();
  });

  it('supports dataset-only generation and falls back to the default provider label', async () => {
    mockGenerateDataset.mockResolvedValue({
      testCases: [{ city: 'Oslo' }],
      metadata: {
        totalGenerated: 1,
        durationMs: 10,
        provider: 'default',
      },
    });

    const result = await generateTestSuite(prompts, existingTests, {
      skipAssertions: true,
    });

    expect(mockGenerateDataset).toHaveBeenCalledWith(prompts, existingTests, {}, undefined);
    expect(mockGenerateAssertions).not.toHaveBeenCalled();
    expect(result.assertions).toBeUndefined();
    expect(result.metadata.provider).toBe('default');
  });
});
