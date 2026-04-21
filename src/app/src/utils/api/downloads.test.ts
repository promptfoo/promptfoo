import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from '../api';
import { downloadResultsFile } from './downloads';

vi.mock('../api', () => ({
  callApi: vi.fn(),
}));

const createSuccessfulMockResponse = (mockBlob: Blob) =>
  ({
    ok: true,
    blob: vi.fn().mockResolvedValue(mockBlob),
  }) as unknown as Response;

const createErrorJsonResponse = (
  status: number,
  statusText: string,
  errorData: Record<string, string>,
) =>
  ({
    ok: false,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(JSON.stringify(errorData)),
  }) as unknown as Response;

const createErrorTextResponse = (status: number, statusText: string, errorText: string) =>
  ({
    ok: false,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(errorText),
  }) as unknown as Response;

const createErrorResponseWithFailingText = (status: number, statusText: string) =>
  ({
    ok: false,
    status,
    statusText,
    text: vi.fn().mockRejectedValue(new Error('Failed to read response body')),
  }) as unknown as Response;

describe('downloadResultsFile', () => {
  const evalId = 'test-eval-123';
  const emptyEvalId = '';
  const mockBlob = new Blob(['mock file content'], { type: 'text/plain' });
  const formats = [{ format: 'csv' as const }, { format: 'json' as const }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(
    formats,
  )('should return a Blob containing the file data for format "$format" on successful API response', async ({
    format,
  }) => {
    const mockResponse = createSuccessfulMockResponse(mockBlob);
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    const result = await downloadResultsFile(evalId, format);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result).toBe(mockBlob);

    expect(mockResponse.blob).toHaveBeenCalledTimes(1);
  });

  it.each(
    formats,
  )('should call callApi with the correct URL when evalId is an empty string and format is $format', async ({
    format,
  }) => {
    const mockResponse = createSuccessfulMockResponse(mockBlob);
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await downloadResultsFile(emptyEvalId, format);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval//table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should throw an error with the "error" field from the JSON response when the API returns an error with a JSON body containing an error field for format "$format"', async ({
    format,
  }) => {
    const mockError = 'This is a test error message from the error field.';
    const mockResponse = createErrorJsonResponse(400, 'Bad Request', { error: mockError });
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(
      `Failed to download ${format.toUpperCase()}: ${mockError}`,
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should use the "message" field from the JSON error response when the "error" field is absent for format "$format"', async ({
    format,
  }) => {
    const mockMessage = 'This is an error message from the message field.';
    const mockResponse = createErrorJsonResponse(400, 'Bad Request', { message: mockMessage });
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(
      `Failed to download ${format.toUpperCase()}: ${mockMessage}`,
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should throw an error with the raw text when the API returns an error response with a non-JSON body for format "$format"', async ({
    format,
  }) => {
    const mockErrorText = 'Non-JSON error message from the API';
    const mockResponse = createErrorTextResponse(400, 'Bad Request', mockErrorText);
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(
      `Failed to download ${format.toUpperCase()}: ${mockErrorText}`,
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should include the format in the error message when the API returns an error', async ({
    format,
  }) => {
    const errorMessage = 'API Error Message';
    const mockResponse = createErrorTextResponse(500, 'Internal Server Error', errorMessage);
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(
      `Failed to download ${format.toUpperCase()}: ${errorMessage}`,
    );
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should throw an error with a fallback message when the API returns an error and reading the response body fails for format "$format"', async ({
    format,
  }) => {
    const mockStatus = 500;
    const mockStatusText = 'Internal Server Error';
    const mockResponse = createErrorResponseWithFailingText(mockStatus, mockStatusText);
    vi.mocked(callApi).mockResolvedValue(mockResponse);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(
      `Failed to download ${format.toUpperCase()}: HTTP ${mockStatus}: ${mockStatusText}`,
    );

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });

  it.each(
    formats,
  )('should throw an error when the network request fails for format "$format"', async ({
    format,
  }) => {
    const networkError = new Error('Network error');
    vi.mocked(callApi).mockRejectedValue(networkError);

    await expect(downloadResultsFile(evalId, format)).rejects.toThrowError(networkError);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(`/eval/${evalId}/table?format=${format}`, {
      method: 'GET',
    });
  });
});
