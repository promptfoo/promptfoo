import { callApi } from '../api';

/**
 * Generic function to download results in a specified format
 * @param evalId Evaluation ID
 * @param format Export format (csv or json)
 * @returns Blob containing the file data
 * @throws {Error} When the server returns a non-OK response status
 * @throws {Error} When the response cannot be converted to a blob
 */
export async function downloadResultsFile(evalId: string, format: 'csv' | 'json'): Promise<Blob> {
  const response = await callApi(`/eval/${evalId}/table?format=${format}`, {
    method: 'GET',
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorText = await response.text();
      // Try to parse as JSON first for structured error messages
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // If not JSON, use the text as-is
        errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch {
      // If we can't read the response body, provide a meaningful fallback
      errorMessage = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
    }

    throw new Error(`Failed to download ${format.toUpperCase()}: ${errorMessage}`);
  }

  return response.blob();
}

/**
 * Download results as CSV with full red team conversation history
 * @param evalId Evaluation ID
 * @returns Blob containing CSV data
 */
export async function downloadResultsCsv(evalId: string): Promise<Blob> {
  return downloadResultsFile(evalId, 'csv');
}

/**
 * Download results as JSON with full data
 * @param evalId Evaluation ID
 * @returns Blob containing JSON data
 */
export async function downloadResultsJson(evalId: string): Promise<Blob> {
  return downloadResultsFile(evalId, 'json');
}
