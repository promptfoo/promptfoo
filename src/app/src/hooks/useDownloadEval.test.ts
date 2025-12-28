import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './useDownloadEval';

describe('downloadBlob', () => {
  const createObjectURLMock = vi.fn();
  const revokeObjectURLMock = vi.fn();
  const clickMock = vi.fn();

  beforeEach(() => {
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    clickMock.mockClear();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

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
  ])('should trigger a file download $description', ({ blob, fileName, mockUrl }) => {
    createObjectURLMock.mockReturnValue(mockUrl);

    downloadBlob(blob, fileName);

    verifyDownloadProcess(blob, fileName, mockUrl);
  });

  it('should handle filenames with special characters', () => {
    const blob = new Blob(['file content'], { type: 'text/plain' });
    const fileName = 'file/with\\special:characters*.txt';
    const mockUrl = 'blob:http://localhost/mock-uuid';
    createObjectURLMock.mockReturnValue(mockUrl);

    downloadBlob(blob, fileName);

    expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    const link = (document.body.appendChild as any).mock.calls[0][0] as HTMLAnchorElement;
    expect(link.download).toBe(fileName);
  });

  it('should handle errors when URL.createObjectURL fails', () => {
    const blob = new Blob(['file content'], { type: 'text/plain' });
    const fileName = 'results.txt';
    const errorMessage = 'Failed to create object URL';
    createObjectURLMock.mockImplementation(() => {
      throw new Error(errorMessage);
    });

    expect(() => downloadBlob(blob, fileName)).toThrowError(errorMessage);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
