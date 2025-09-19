import { useState } from 'react';

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

type DownloadFormat = 'csv' | 'json';

/**
 * Generic hook for downloading evaluation results
 * @param format The download format (csv or json)
 * @param options Callbacks for success and error events
 * @returns Download function and loading state
 */
export function useDownload(format: DownloadFormat, options?: UseDownloadOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const download = async (evalId: string) => {
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
  };

  return { download, isLoading };
}

/**
 * Hook for downloading CSV files
 * @deprecated Use useDownload('csv', options) instead
 */
export function useDownloadCsv(options?: UseDownloadOptions) {
  const { download: downloadCsv, isLoading } = useDownload('csv', options);
  return { downloadCsv, isLoading };
}

/**
 * Hook for downloading JSON files
 * @deprecated Use useDownload('json', options) instead
 */
export function useDownloadJson(options?: UseDownloadOptions) {
  const { download: downloadJson, isLoading } = useDownload('json', options);
  return { downloadJson, isLoading };
}
