import * as fs from 'fs';
import * as path from 'path';
import { processFileReference } from '../src/assertions';
import cliState from '../src/cliState';

jest.mock('fs');
jest.mock('path');
jest.mock('../src/cliState');

describe('processFileReference', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.basePath = '/base/path';
  });

  it('should process JSON files correctly', () => {
    const jsonContent = JSON.stringify({ key: 'value' });
    jest.mocked(fs.readFileSync).mockReturnValue(jsonContent);
    jest.mocked(path.resolve).mockReturnValue('/base/path/test.json');
    jest.mocked(path.extname).mockReturnValue('.json');

    const result = processFileReference('file://test.json');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.json', 'utf8');
  });

  it('should process YAML files correctly', () => {
    const yamlContent = 'key: value';
    jest.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    jest.mocked(path.resolve).mockReturnValue('/base/path/test.yaml');
    jest.mocked(path.extname).mockReturnValue('.yaml');

    const result = processFileReference('file://test.yaml');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.yaml', 'utf8');
  });

  it('should process TXT files correctly', () => {
    const txtContent = 'plain text content\n';
    jest.mocked(fs.readFileSync).mockReturnValue(txtContent);
    jest.mocked(path.resolve).mockReturnValue('/base/path/test.txt');
    jest.mocked(path.extname).mockReturnValue('.txt');

    const result = processFileReference('file://test.txt');
    expect(result).toBe('plain text content');
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.txt', 'utf8');
  });

  it('should throw an error for unsupported file types', () => {
    jest.mocked(path.resolve).mockReturnValue('/base/path/test.unsupported');
    jest.mocked(path.extname).mockReturnValue('.unsupported');

    expect(() => processFileReference('file://test.unsupported')).toThrow('Unsupported file type');
  });
});
