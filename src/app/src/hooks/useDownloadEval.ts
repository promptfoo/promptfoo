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

export const DownloadFormat = {
  CSV: 'csv',
  JSON: 'json',
} as const;
export type DownloadFormat = (typeof DownloadFormat)[keyof typeof DownloadFormat];

/**
 * Generic hook for downloading evaluation results
 * @param format The download format (csv or json)
 * @returns Download function and loading state
 */
export function useDownloadEval(format: DownloadFormat) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const download = useCallback(
    async (evalId: string) => {
      setIsLoading(true);
      try {
        const blob =
          format === 'csv' ? await downloadResultsCsv(evalId) : await downloadResultsJson(evalId);
        downloadBlob(blob, `${evalId}.${format}`);
        showToast(`${format.toUpperCase()} downloaded successfully`, 'success');
      } catch (error) {
        const err = error as Error;
        showToast(`Failed to download ${format.toUpperCase()}: ${err.message}`, 'error');
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [format, showToast],
  );

  return { download, isLoading };
}
