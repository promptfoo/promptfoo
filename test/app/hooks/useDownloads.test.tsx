import {
  downloadBlob,
  useDownload,
  useDownloadCsv,
  useDownloadJson,
} from '../../../src/app/src/hooks/useDownloads';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock the useToast hook
const showToastMock = jest.fn();
jest.mock('../../../src/app/src/hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

// Mock the downloads API module
const mockDownloadResultsCsv = jest.fn();
const mockDownloadResultsJson = jest.fn();
jest.mock('../../../src/app/src/utils/api/downloads', () => ({
  downloadResultsCsv: mockDownloadResultsCsv,
  downloadResultsJson: mockDownloadResultsJson,
}));

// Mock URL and HTMLAnchorElement methods
const createObjectURLMock = jest.fn().mockReturnValue('blob:mock-url');
const revokeObjectURLMock = jest.fn();
const clickMock = jest.fn();

describe('useDownloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup URL mocks
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    // Setup HTMLAnchorElement click mock
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('downloadBlob', () => {
    it('should create a download link and trigger download', () => {
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const fileName = 'test-file.txt';

      downloadBlob(mockBlob, fileName);

      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should set correct download attributes on the anchor element', () => {
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const fileName = 'test-file.txt';
      let createdLink: HTMLAnchorElement | null = null;

      // Capture the created link element
      const originalAppendChild = document.body.appendChild;
      document.body.appendChild = jest.fn().mockImplementation((node) => {
        if (node instanceof HTMLAnchorElement) {
          createdLink = node;
        }
        return originalAppendChild.call(document.body, node);
      });

      downloadBlob(mockBlob, fileName);

      expect(createdLink).not.toBeNull();
      expect(createdLink?.download).toBe(fileName);
      expect(createdLink?.href).toBe('blob:mock-url');
    });
  });

  describe('useDownloadCsv', () => {
    it('should download CSV successfully', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(mockBlob);

      const onSuccessMock = jest.fn();
      const { result } = renderHook(() => useDownloadCsv({ onSuccess: onSuccessMock }));

      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        const fileName = await result.current.downloadCsv('test-eval-id');
        expect(fileName).toBe('test-eval-id-results.csv');
      });

      await waitFor(() => {
        expect(mockDownloadResultsCsv).toHaveBeenCalledWith('test-eval-id');
        expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
        expect(clickMock).toHaveBeenCalled();
        expect(showToastMock).toHaveBeenCalledWith('CSV downloaded successfully', 'success');
        expect(onSuccessMock).toHaveBeenCalledWith('test-eval-id-results.csv');
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle CSV download error', async () => {
      const error = new Error('Network error');
      mockDownloadResultsCsv.mockRejectedValue(error);

      const onErrorMock = jest.fn();
      const { result } = renderHook(() => useDownloadCsv({ onError: onErrorMock }));

      await act(async () => {
        await expect(result.current.downloadCsv('test-eval-id')).rejects.toThrow('Network error');
      });

      await waitFor(() => {
        expect(showToastMock).toHaveBeenCalledWith(
          'Failed to download CSV: Network error',
          'error',
        );
        expect(onErrorMock).toHaveBeenCalledWith(error);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set loading state during download', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      let resolvePromise: (value: Blob) => void;
      const downloadPromise = new Promise<Blob>((resolve) => {
        resolvePromise = resolve;
      });
      mockDownloadResultsCsv.mockReturnValue(downloadPromise);

      const { result } = renderHook(() => useDownloadCsv());

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.downloadCsv('test-eval-id').catch(() => {});
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise!(mockBlob);
        await downloadPromise;
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle concurrent download requests', async () => {
      const mockBlob1 = new Blob(['csv1'], { type: 'text/csv' });
      const mockBlob2 = new Blob(['csv2'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValueOnce(mockBlob1).mockResolvedValueOnce(mockBlob2);

      const { result } = renderHook(() => useDownloadCsv());

      await act(async () => {
        const [fileName1, fileName2] = await Promise.all([
          result.current.downloadCsv('eval-1'),
          result.current.downloadCsv('eval-2'),
        ]);

        expect(fileName1).toBe('eval-1-results.csv');
        expect(fileName2).toBe('eval-2-results.csv');
      });

      expect(mockDownloadResultsCsv).toHaveBeenCalledTimes(2);
      expect(clickMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('useDownloadJson', () => {
    it('should download JSON successfully', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      mockDownloadResultsJson.mockResolvedValue(mockBlob);

      const onSuccessMock = jest.fn();
      const { result } = renderHook(() => useDownloadJson({ onSuccess: onSuccessMock }));

      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        const fileName = await result.current.downloadJson('test-eval-id');
        expect(fileName).toBe('test-eval-id-results.json');
      });

      await waitFor(() => {
        expect(mockDownloadResultsJson).toHaveBeenCalledWith('test-eval-id');
        expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
        expect(clickMock).toHaveBeenCalled();
        expect(showToastMock).toHaveBeenCalledWith('JSON downloaded successfully', 'success');
        expect(onSuccessMock).toHaveBeenCalledWith('test-eval-id-results.json');
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle JSON download error', async () => {
      const error = new Error('Server error');
      mockDownloadResultsJson.mockRejectedValue(error);

      const onErrorMock = jest.fn();
      const { result } = renderHook(() => useDownloadJson({ onError: onErrorMock }));

      await act(async () => {
        await expect(result.current.downloadJson('test-eval-id')).rejects.toThrow('Server error');
      });

      await waitFor(() => {
        expect(showToastMock).toHaveBeenCalledWith(
          'Failed to download JSON: Server error',
          'error',
        );
        expect(onErrorMock).toHaveBeenCalledWith(error);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set loading state during download', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      let resolvePromise: (value: Blob) => void;
      const downloadPromise = new Promise<Blob>((resolve) => {
        resolvePromise = resolve;
      });
      mockDownloadResultsJson.mockReturnValue(downloadPromise);

      const { result } = renderHook(() => useDownloadJson());

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.downloadJson('test-eval-id').catch(() => {});
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise!(mockBlob);
        await downloadPromise;
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle empty evaluation ID', async () => {
      const { result } = renderHook(() => useDownloadJson());

      await act(async () => {
        await expect(result.current.downloadJson('')).rejects.toThrow();
      });
    });

    it('should handle special characters in evaluation ID', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      mockDownloadResultsJson.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useDownloadJson());
      const specialEvalId = 'eval/with:special@chars#123';

      await act(async () => {
        const fileName = await result.current.downloadJson(specialEvalId);
        expect(fileName).toBe(`${specialEvalId}-results.json`);
      });

      expect(mockDownloadResultsJson).toHaveBeenCalledWith(specialEvalId);
    });
  });

  describe('Edge cases', () => {
    it('should handle download when URL.createObjectURL is not available', () => {
      const originalCreateObjectURL = global.URL.createObjectURL;
      // @ts-expect-error - Testing undefined case
      global.URL.createObjectURL = undefined;

      const mockBlob = new Blob(['test'], { type: 'text/plain' });

      expect(() => {
        downloadBlob(mockBlob, 'test.txt');
      }).toThrow();

      global.URL.createObjectURL = originalCreateObjectURL;
    });

    it('should cleanup properly even if click throws an error', () => {
      clickMock.mockImplementationOnce(() => {
        throw new Error('Click failed');
      });

      const mockBlob = new Blob(['test'], { type: 'text/plain' });

      expect(() => {
        downloadBlob(mockBlob, 'test.txt');
      }).toThrow('Click failed');

      // Verify cleanup still happened
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should handle very large file downloads', async () => {
      // Create a 10MB blob
      const largeContent = new Array(10 * 1024 * 1024).fill('a').join('');
      const largeBlob = new Blob([largeContent], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(largeBlob);

      const { result } = renderHook(() => useDownloadCsv());

      await act(async () => {
        await result.current.downloadCsv('large-eval');
      });

      expect(createObjectURLMock).toHaveBeenCalledWith(largeBlob);
      expect(showToastMock).toHaveBeenCalledWith('CSV downloaded successfully', 'success');
    });

    it('should handle rapid successive downloads', async () => {
      const mockBlob = new Blob(['test'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useDownloadCsv());

      await act(async () => {
        // Trigger multiple downloads rapidly
        result.current.downloadCsv('eval-1');
        result.current.downloadCsv('eval-2');
        result.current.downloadCsv('eval-3');
      });

      // All downloads should complete
      await waitFor(() => {
        expect(mockDownloadResultsCsv).toHaveBeenCalledTimes(3);
        expect(clickMock).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('useDownload (generic hook)', () => {
    it('should download CSV format', async () => {
      const mockBlob = new Blob(['csv data'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useDownload('csv'));

      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        await result.current.download('test-eval-csv');
      });

      expect(mockDownloadResultsCsv).toHaveBeenCalledWith('test-eval-csv');
      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
      expect(showToastMock).toHaveBeenCalledWith('CSV downloaded successfully', 'success');
    });

    it('should download JSON format', async () => {
      const mockBlob = new Blob(['{"data": "test"}'], { type: 'application/json' });
      mockDownloadResultsJson.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useDownload('json'));

      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        await result.current.download('test-eval-json');
      });

      expect(mockDownloadResultsJson).toHaveBeenCalledWith('test-eval-json');
      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
      expect(showToastMock).toHaveBeenCalledWith('JSON downloaded successfully', 'success');
    });

    it('should handle download errors', async () => {
      const error = new Error('Network error');
      mockDownloadResultsCsv.mockRejectedValue(error);

      const onError = jest.fn();
      const { result } = renderHook(() => useDownload('csv', { onError }));

      await act(async () => {
        await expect(result.current.download('error-eval')).rejects.toThrow('Network error');
      });

      expect(onError).toHaveBeenCalledWith(error);
      expect(showToastMock).toHaveBeenCalledWith('Failed to download CSV: Network error', 'error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should call onSuccess callback', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(mockBlob);

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useDownload('csv', { onSuccess }));

      await act(async () => {
        const fileName = await result.current.download('success-eval');
        expect(fileName).toBe('success-eval.csv');
      });

      expect(onSuccess).toHaveBeenCalledWith('success-eval.csv');
    });

    it('should handle loading state correctly', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      mockDownloadResultsCsv.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useDownload('csv'));

      expect(result.current.isLoading).toBe(false);

      const downloadPromise = act(async () => {
        await result.current.download('loading-test');
      });

      // Should be loading during download
      expect(result.current.isLoading).toBe(true);

      await downloadPromise;

      // Should not be loading after download
      expect(result.current.isLoading).toBe(false);
    });
  });
});
