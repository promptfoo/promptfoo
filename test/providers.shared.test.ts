import * as fs from 'fs';
import * as path from 'path';
import cliState from '../src/cliState';
import { maybeLoadFromExternalFile } from '../src/providers/shared';

jest.mock('fs');

describe('maybeLoadFromExternalFile', () => {
  const mockFileContent = 'test content';
  const mockJsonContent = '{"key": "value"}';
  const mockYamlContent = 'key: value';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should return the input if it is not a string', () => {
    const input = { key: 'value' };
    expect(maybeLoadFromExternalFile(input)).toBe(input);
  });

  it('should return the input if it does not start with "file://"', () => {
    const input = 'not a file path';
    expect(maybeLoadFromExternalFile(input)).toBe(input);
  });

  it('should throw an error if the file does not exist', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => maybeLoadFromExternalFile('file://nonexistent.txt')).toThrow(
      'File does not exist',
    );
  });

  it('should return the file contents for a non-JSON, non-YAML file', () => {
    expect(maybeLoadFromExternalFile('file://test.txt')).toBe(mockFileContent);
  });

  it('should parse and return JSON content for a .json file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);
    expect(maybeLoadFromExternalFile('file://test.json')).toEqual({ key: 'value' });
  });

  it('should parse and return YAML content for a .yaml file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
    expect(maybeLoadFromExternalFile('file://test.yaml')).toEqual({ key: 'value' });
  });

  it('should parse and return YAML content for a .yml file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
    expect(maybeLoadFromExternalFile('file://test.yml')).toEqual({ key: 'value' });
  });

  it('should use basePath when resolving file paths', () => {
    const basePath = '/base/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file://test.txt');

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringMatching(/^[/\\]base[/\\]path[/\\]test\.txt$/),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^[/\\]base[/\\]path[/\\]test\.txt$/),
      'utf8',
    );

    cliState.basePath = undefined;
  });

  it('should handle relative paths correctly', () => {
    const basePath = './relative/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file://test.txt');

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\.?[/\\]relative[/\\]path[/\\]test\.txt$/),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^\.?[/\\]relative[/\\]path[/\\]test\.txt$/),
      'utf8',
    );

    cliState.basePath = undefined; // Reset for other tests
  });

  it('should ignore basePath when file path is absolute', () => {
    const basePath = '/base/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file:///absolute/path/test.txt');

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringMatching(/^[/\\]absolute[/\\]path[/\\]test\.txt$/),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^[/\\]absolute[/\\]path[/\\]test\.txt$/),
      'utf8',
    );

    cliState.basePath = undefined; // Reset for other tests
  });
});
