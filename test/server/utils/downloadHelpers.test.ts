import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { setDownloadHeaders } from '../../../src/server/utils/downloadHelpers';
import type { Response } from 'express';

describe('downloadHelpers', () => {
  describe('setDownloadHeaders', () => {
    let mockRes: Partial<Response>;
    let setHeaderMock: Mock;

    beforeEach(() => {
      setHeaderMock = vi.fn().mockReturnThis();
      mockRes = {
        setHeader: setHeaderMock,
      } as Partial<Response>;
    });

    it('should set correct headers for CSV download', () => {
      setDownloadHeaders(mockRes as Response, 'test-file.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test-file.csv"',
      );
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
      expect(setHeaderMock).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(setHeaderMock).toHaveBeenCalledWith('Expires', '0');
    });

    it('should set correct headers for JSON download', () => {
      setDownloadHeaders(mockRes as Response, 'data.json', 'application/json');

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="data.json"',
      );
    });

    it('should handle special characters in filename', () => {
      setDownloadHeaders(mockRes as Response, 'file with spaces & special.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="file with spaces & special.csv"',
      );
    });

    it('should handle very long filenames', () => {
      const longFileName = 'a'.repeat(255) + '.csv';
      setDownloadHeaders(mockRes as Response, longFileName, 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${longFileName}"`,
      );
    });

    it('should handle Unicode characters in filename', () => {
      setDownloadHeaders(mockRes as Response, '测试文件.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="测试文件.csv"',
      );
    });

    it('should handle different content types', () => {
      const testCases = [
        { fileName: 'file.pdf', contentType: 'application/pdf' },
        { fileName: 'file.xml', contentType: 'application/xml' },
        { fileName: 'file.txt', contentType: 'text/plain' },
        { fileName: 'file.yaml', contentType: 'application/x-yaml' },
      ];

      testCases.forEach(({ fileName, contentType }) => {
        setHeaderMock.mockClear();
        setDownloadHeaders(mockRes as Response, fileName, contentType);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', contentType);
        expect(setHeaderMock).toHaveBeenCalledWith(
          'Content-Disposition',
          `attachment; filename="${fileName}"`,
        );
      });
    });

    it('should set all cache control headers', () => {
      setDownloadHeaders(mockRes as Response, 'test.csv', 'text/csv');

      // Verify all cache-preventing headers are set
      const calls = setHeaderMock.mock.calls;
      const headerMap = new Map(calls.map((call) => [call[0] as string, call[1]]));

      expect(headerMap.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      expect(headerMap.get('Pragma')).toBe('no-cache');
      expect(headerMap.get('Expires')).toBe('0');
    });

    it('should be called exactly 5 times for all headers', () => {
      setDownloadHeaders(mockRes as Response, 'test.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledTimes(5);
    });

    it('should handle empty filename', () => {
      setDownloadHeaders(mockRes as Response, '', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=""');
    });

    it('should handle filename with quotes', () => {
      setDownloadHeaders(mockRes as Response, 'file"with"quotes.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="file"with"quotes.csv"',
      );
    });

    it('should handle filename with path separators', () => {
      setDownloadHeaders(mockRes as Response, 'path/to/file.csv', 'text/csv');

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="path/to/file.csv"',
      );
    });
  });
});
