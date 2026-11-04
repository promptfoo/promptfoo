import { mockObjectUrl } from '@app/tests/browserMocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './useDownloadEval';

describe('downloadBlob', () => {
  const clickMock = vi.fn();

  beforeEach(() => {
    clickMock.mockClear();

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickMock);

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const verifyDownloadProcess = (blob: Blob, fileName: string, mockUrl: string) => {
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    const link = (document.body.appendChild as any).mock.calls[0][0] as HTMLAnchorElement;

    expect(link.href).toBe(mockUrl);
    expect(link.download).toBe(fileName);

    expect(clickMock).toHaveBeenCalledTimes(1);

    expect(document.body.removeChild).toHaveBeenCalledWith(link);
    expect(document.body.removeChild).toHaveBeenCalledTimes(1);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  };

  it.each([
    {
      description: 'with the correct file name when provided a valid Blob and fileName',
      blob: new Blob(['file content'], { type: 'text/plain' }),
      fileName: 'results.txt',
      mockUrl: 'blob:http://localhost/mock-uuid',
    },
    {
      description: 'with an empty file when provided an empty Blob',
      blob: new Blob([], { type: 'text/plain' }),
      fileName: 'empty.txt',
      mockUrl: 'blob:http://localhost/mock-uuid',
    },
    {
      description: 'with different MIME types correctly',
      blob: new Blob(['file content'], { type: 'application/pdf' }),
      fileName: 'document.pdf',
      mockUrl: 'blob:http://localhost/mock-pdf-uuid',
    },
    {
      description: 'with special characters in the filename',
      blob: new Blob(['file content'], { type: 'text/plain' }),
      fileName: 'file/with\\special:characters*.txt',
      mockUrl: 'blob:http://localhost/mock-uuid',
    },
  ])('should trigger a file download $description', ({ blob, fileName, mockUrl }) => {
    mockObjectUrl(mockUrl);

    downloadBlob(blob, fileName);

    verifyDownloadProcess(blob, fileName, mockUrl);
  });

  it('should handle errors when URL.createObjectURL fails', () => {
    const blob = new Blob(['file content'], { type: 'text/plain' });
    const fileName = 'results.txt';
    const errorMessage = 'Failed to create object URL';
    mockObjectUrl().createObjectURL.mockImplementation(() => {
      throw new Error(errorMessage);
    });

    expect(() => downloadBlob(blob, fileName)).toThrowError(errorMessage);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
