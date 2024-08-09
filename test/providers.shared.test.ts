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

    const expectedPath = path.resolve(basePath, 'test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should handle relative paths correctly', () => {
    const basePath = './relative/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file://test.txt');

    const expectedPath = path.resolve(basePath, 'test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should ignore basePath when file path is absolute', () => {
    const basePath = '/base/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file:///absolute/path/test.txt');

    const expectedPath = path.resolve('/absolute/path/test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should handle list of paths', () => {
    const basePath = './relative/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);

    maybeLoadFromExternalFile(['file://test1.txt', 'file://test2.txt', 'file://test3.txt']);

    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(fs.existsSync).toHaveBeenNthCalledWith(1, path.resolve(basePath, 'test1.txt'));
    expect(fs.existsSync).toHaveBeenNthCalledWith(2, path.resolve(basePath, 'test2.txt'));
    expect(fs.existsSync).toHaveBeenNthCalledWith(3, path.resolve(basePath, 'test3.txt'));

    cliState.basePath = undefined;
  });
});
