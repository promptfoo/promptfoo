import { useCallback, useState } from 'react';

import { downloadResultsCsv, downloadResultsJson } from '../utils/api/downloads';
import { useToast } from './useToast';
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface UseDownloadOptions {
  onSuccess?: (fileName: string) => void;
  onError?: (error: Error) => void;
}

export const DownloadFormat = {
  CSV: 'csv',
  JSON: 'json',
} as const;
export type DownloadFormat = (typeof DownloadFormat)[keyof typeof DownloadFormat];

/**
 * Generic hook for downloading evaluation results
 * @param format The download format (csv or json)
 * @param options Callbacks for success and error events
 * @returns Download function and loading state
 */
export function useDownloadEval(format: DownloadFormat, options?: UseDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const download = useCallback(
    async (evalId: string) => {
      setIsLoading(true);
      try {
        const blob =
          format === 'csv' ? await downloadResultsCsv(evalId) : await downloadResultsJson(evalId);
        const fileName = `${evalId}.${format}`;
        downloadBlob(blob, fileName);
        showToast(`${format.toUpperCase()} downloaded successfully`, 'success');
        options?.onSuccess?.(fileName);
        return fileName;
      } catch (error) {
        const err = error as Error;
        showToast(`Failed to download ${format.toUpperCase()}: ${err.message}`, 'error');
        options?.onError?.(err);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [format, options, showToast],
  );

  return { download, isLoading };
}
