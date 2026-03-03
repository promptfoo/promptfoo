/**
 * Integration test for Azure Responses API nested schema loading.
 *
 * This test verifies the bug fix where nested `schema: file://...` references
 * inside response_format configurations were not being loaded correctly.
 *
 * Unlike the unit tests in responses.test.ts which mock maybeLoadResponseFormatFromExternalFile,
 * this integration test uses real file system operations to verify the full loading chain.
 */
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';

// Only mock the network layer, not file operations
vi.mock('../../../src/cache');

const { fetchWithCache } = await import('../../../src/cache');
const mockFetchWithCache = vi.mocked(fetchWithCache);

describe('Azure Responses - Nested Schema Loading Integration', () => {
  const tempDir = path.join(__dirname, '.temp-nested-schema-test');
  let authHeadersValue: Record<string, string>;

  beforeAll(() => {
    // Create temp directory and test files
    fs.mkdirSync(tempDir, { recursive: true });

    // Create the nested schema file
    const nestedSchema = {
      type: 'object',
      properties: {
        event_name: { type: 'string' },
        date: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['event_name', 'date', 'location'],
      additionalProperties: false,
    };
    fs.writeFileSync(
      path.join(tempDir, 'event-schema.json'),
      JSON.stringify(nestedSchema, null, 2),
    );

    // Create the response_format file with nested file reference
    const responseFormat = {
      type: 'json_schema',
      name: 'event_extraction',
      schema: `file://${path.join(tempDir, 'event-schema.json')}`,
    };
    fs.writeFileSync(
      path.join(tempDir, 'nested-format.json'),
      JSON.stringify(responseFormat, null, 2),
    );

    // Create a flat response_format file (no nested reference)
    const flatFormat = {
      type: 'json_schema',
      name: 'flat_schema',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
    };
    fs.writeFileSync(path.join(tempDir, 'flat-format.json'), JSON.stringify(flatFormat, null, 2));
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock environment variables
    process.env.AZURE_API_KEY = 'test-key';
    process.env.AZURE_API_HOST = 'test.openai.azure.com';
    authHeadersValue = { 'api-key': 'test-key' };

    // Mock the auth headers getter
    Object.defineProperty(AzureResponsesProvider.prototype, 'authHeaders', {
      get: vi.fn(() => authHeadersValue),
      configurable: true,
    });

    // Mock ensureInitialized and getApiBaseUrl
    AzureResponsesProvider.prototype.ensureInitialized = vi.fn().mockResolvedValue(void 0);
    AzureResponsesProvider.prototype.getApiBaseUrl = vi
      .fn()
      .mockReturnValue('https://test.openai.azure.com');

    // Mock successful API response
    mockFetchWithCache.mockResolvedValue({
      data: {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"event_name": "Conference", "date": "2025-01-15", "location": "NYC"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  it('should load nested schema from file reference (regression test for Azure bug)', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1-test', {
      config: {
        response_format: `file://${path.join(tempDir, 'nested-format.json')}` as any,
      },
    });

    // Call the API - this should successfully load both the outer format and nested schema
    const result = await provider.callApi('Extract event info from: Conference in NYC on Jan 15');

    // Verify no error occurred (the bug would cause an error or malformed request)
    expect(result.error).toBeUndefined();
    expect(result.output).toBeDefined();

    // Verify the API was called with the correct format structure
    expect(mockFetchWithCache).toHaveBeenCalled();
    const callArgs = mockFetchWithCache.mock.calls[0]!;
    const requestBody = JSON.parse(callArgs[1]!.body as string);

    // The nested schema should be fully loaded (not a string file reference)
    expect(requestBody.text.format.type).toBe('json_schema');
    expect(requestBody.text.format.name).toBe('event_extraction');
    expect(requestBody.text.format.schema).toEqual({
      type: 'object',
      properties: {
        event_name: { type: 'string' },
        date: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['event_name', 'date', 'location'],
      additionalProperties: false,
    });
    // Should NOT be a file reference string
    expect(typeof requestBody.text.format.schema).not.toBe('string');
  });

  it('should handle flat response_format file without nested references', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1-test', {
      config: {
        response_format: `file://${path.join(tempDir, 'flat-format.json')}` as any,
      },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();

    const callArgs = mockFetchWithCache.mock.calls[0]!;
    const requestBody = JSON.parse(callArgs[1]!.body as string);

    expect(requestBody.text.format.type).toBe('json_schema');
    expect(requestBody.text.format.name).toBe('flat_schema');
    expect(requestBody.text.format.schema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
  });

  it('should handle inline response_format without file loading', async () => {
    const provider = new AzureResponsesProvider('gpt-4.1-test', {
      config: {
        // Using shorthand format (name/schema at top level) which the runtime code normalizes
        response_format: {
          type: 'json_schema',
          name: 'inline_test',
          schema: {
            type: 'object',
            properties: { result: { type: 'string' } },
            additionalProperties: false,
          },
        } as any,
      },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeUndefined();

    const callArgs = mockFetchWithCache.mock.calls[0]!;
    const requestBody = JSON.parse(callArgs[1]!.body as string);

    expect(requestBody.text.format.name).toBe('inline_test');
    expect(requestBody.text.format.schema).toEqual({
      type: 'object',
      properties: { result: { type: 'string' } },
      additionalProperties: false,
    });
  });
});
