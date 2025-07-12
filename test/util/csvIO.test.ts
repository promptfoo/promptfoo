import fs from 'fs';
import { getCsvEncoding, readCsvFile, writeCsvFile, appendCsvFile, parseFilePathWithEncoding } from '../../src/util/csvIO';

jest.mock('fs');

describe('csvIO', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.LANG;
    delete process.env.LC_ALL;
    delete process.env.LC_CTYPE;
  });

  describe('parseFilePathWithEncoding', () => {
    it('should parse file path with encoding', () => {
      const result = parseFilePathWithEncoding('file://test.csv#encoding=utf16le');
      expect(result).toEqual({
        path: 'file://test.csv',
        encoding: 'utf16le'
      });
    });

    it('should return path without encoding if not specified', () => {
      const result = parseFilePathWithEncoding('file://test.csv');
      expect(result).toEqual({
        path: 'file://test.csv',
        encoding: undefined
      });
    });

    it('should handle paths with other hash fragments', () => {
      const result = parseFilePathWithEncoding('file://test.csv#something');
      expect(result).toEqual({
        path: 'file://test.csv#something',
        encoding: undefined
      });
    });
  });

  describe('getCsvEncoding', () => {
    it('should return utf-8 by default', () => {
      expect(getCsvEncoding()).toBe('utf-8');
    });

    it('should prioritize file-specific encoding', () => {
      process.env.LANG = 'en_US.ISO-8859-1';
      expect(getCsvEncoding('utf16le')).toBe('utf16le');
    });

    it('should use system locale when no file-specific encoding', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(getCsvEncoding()).toBe('utf-8');
      
      process.env.LANG = 'en_US.ISO-8859-1';
      expect(getCsvEncoding()).toBe('latin1');
      
      process.env.LANG = 'en_US.UTF-16';
      expect(getCsvEncoding()).toBe('utf16le');
    });

    it('should check LC_ALL and LC_CTYPE as fallbacks', () => {
      process.env.LC_ALL = 'en_US.UTF-8';
      expect(getCsvEncoding()).toBe('utf-8');
      
      delete process.env.LC_ALL;
      process.env.LC_CTYPE = 'en_US.ISO-8859-1';
      expect(getCsvEncoding()).toBe('latin1');
    });

    it('should support Windows encodings', () => {
      const windowsEncodings = ['utf16le', 'latin1', 'ascii'];
      windowsEncodings.forEach((encoding) => {
        expect(getCsvEncoding(encoding)).toBe(encoding);
      });
    });

    it('should throw error for invalid file-specific encoding', () => {
      expect(() => getCsvEncoding('invalid-encoding')).toThrow(
        "Invalid CSV encoding 'invalid-encoding'. Valid encodings are: ascii, utf8, utf-8, utf16le, ucs2, ucs-2, base64, base64url, latin1, binary, hex"
      );
    });
  });

  describe('readCsvFile', () => {
    it('should read file with default utf-8 encoding', () => {
      jest.mocked(fs.readFileSync).mockReturnValue('test content');

      const result = readCsvFile('/path/to/file.csv');

      expect(result).toBe('test content');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/file.csv', 'utf-8');
    });

    it('should read file with file-specific encoding', () => {
      jest.mocked(fs.readFileSync).mockReturnValue('test content with special chars: ñáéíóú');

      const result = readCsvFile('/path/to/file.csv#encoding=latin1');

      expect(result).toBe('test content with special chars: ñáéíóú');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/file.csv', 'latin1');
    });

    it('should read file with system locale encoding', () => {
      process.env.LANG = 'en_US.UTF-16';
      jest.mocked(fs.readFileSync).mockReturnValue('test content');

      const result = readCsvFile('/path/to/file.csv');

      expect(result).toBe('test content');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/file.csv', 'utf16le');
    });

    it('should propagate file system errors', () => {
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => readCsvFile('/nonexistent/file.csv')).toThrow('File not found');
    });

    it('should provide helpful error message for file read failures', () => {
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => readCsvFile('/nonexistent.csv')).toThrow(
        "Failed to read CSV file '/nonexistent.csv': ENOENT: no such file or directory"
      );
    });
  });

  describe('writeCsvFile', () => {
    it('should write file with default utf-8 encoding', () => {
      writeCsvFile('/path/to/output.csv', 'test,data\n1,2');

      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'test,data\n1,2', 'utf-8');
    });

    it('should write file with file-specific encoding', () => {
      writeCsvFile('/path/to/output.csv#encoding=utf16le', 'test,data\n1,2');

      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'test,data\n1,2', 'utf16le');
    });

    it('should write file with system locale encoding', () => {
      process.env.LANG = 'en_US.ISO-8859-1';

      writeCsvFile('/path/to/output.csv', 'test,data\n1,2');

      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'test,data\n1,2', 'latin1');
    });

    it('should handle special characters correctly', () => {
      const contentWithSpecialChars = 'name,value\nJosé,100\nMaría,200';

      writeCsvFile('/path/to/output.csv#encoding=latin1', contentWithSpecialChars);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/output.csv',
        contentWithSpecialChars,
        'latin1',
      );
    });

    it('should provide helpful error message for file write failures', () => {
      jest.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => writeCsvFile('/readonly.csv', 'content')).toThrow(
        "Failed to write CSV file '/readonly.csv': EACCES: permission denied"
      );
    });
  });

  describe('appendCsvFile', () => {
    it('should append to file with default utf-8 encoding', () => {
      appendCsvFile('/path/to/output.csv', 'new,row\n3,4');

      expect(fs.appendFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'new,row\n3,4', 'utf-8');
    });

    it('should append to file with file-specific encoding', () => {
      appendCsvFile('/path/to/output.csv#encoding=ascii', 'new,row\n3,4');

      expect(fs.appendFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'new,row\n3,4', 'ascii');
    });

    it('should append to file with system locale encoding', () => {
      process.env.LANG = 'en_US.UTF-16';

      appendCsvFile('/path/to/output.csv', 'new,row\n3,4');

      expect(fs.appendFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'new,row\n3,4', 'utf16le');
    });

    it('should maintain encoding consistency when appending', () => {
      // Mock both write and append
      jest.mocked(fs.writeFileSync).mockImplementation(() => {});
      jest.mocked(fs.appendFileSync).mockImplementation(() => {});
      
      // First write with file-specific encoding
      writeCsvFile('/path/to/output.csv#encoding=utf16le', 'header1,header2\n');

      // Then append with same encoding
      appendCsvFile('/path/to/output.csv#encoding=utf16le', 'value1,value2\n');

      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'header1,header2\n', 'utf16le');
      expect(fs.appendFileSync).toHaveBeenCalledWith('/path/to/output.csv', 'value1,value2\n', 'utf16le');
    });

    it('should provide helpful error message for file append failures', () => {
      jest.mocked(fs.appendFileSync).mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      expect(() => appendCsvFile('/full-disk.csv', 'content')).toThrow(
        "Failed to append to CSV file '/full-disk.csv': ENOSPC: no space left on device"
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      jest.mocked(fs.writeFileSync).mockImplementation(() => {});
      
      writeCsvFile('/path/to/empty.csv', '');
      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/empty.csv', '', 'utf-8');
    });

    it('should handle BOM (Byte Order Mark) for UTF-16', () => {
      jest.mocked(fs.readFileSync).mockReturnValue('\uFEFFtest,data');

      const result = readCsvFile('/path/to/bom-file.csv#encoding=utf16le');
      expect(result).toBe('\uFEFFtest,data');
    });

    it('should work with various BufferEncoding types', () => {
      const validEncodings: BufferEncoding[] = [
        'ascii',
        'utf8',
        'utf-8',
        'utf16le',
        'ucs2',
        'ucs-2',
        'base64',
        'latin1',
        'binary',
        'hex',
      ];

      validEncodings.forEach((encoding) => {
        jest.mocked(fs.readFileSync).mockReturnValue('test');

        expect(() => readCsvFile(`/test.csv#encoding=${encoding}`)).not.toThrow();
        expect(fs.readFileSync).toHaveBeenCalledWith('/test.csv', encoding);
      });
    });

    it('should handle non-Error exceptions gracefully', () => {
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'string error';
      });

      expect(() => readCsvFile('/test.csv')).toThrow(
        "Failed to read CSV file '/test.csv': string error"
      );
    });
  });
}); 