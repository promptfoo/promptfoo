import * as fs from 'fs';
import { globSync } from 'glob';
import { getEnvBool, getEnvString } from '../../src/envars';
import { importModule } from '../../src/esm';
import { fetchCsvFromGoogleSheet } from '../../src/googleSheets';
import { fetchHuggingFaceDataset } from '../../src/integrations/huggingfaceDatasets';
import { runPython } from '../../src/python/pythonUtils';
import { loadFile, loadFilesFromGlob, readFiles } from '../../src/util/fileLoader';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));
jest.mock('../../src/fetch');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  ...jest.requireActual('../../src/envars'),
  getEnvBool: jest.fn(),
  getEnvString: jest.fn(),
}));

jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

jest.mock('../../src/integrations/huggingfaceDatasets', () => ({
  fetchHuggingFaceDataset: jest.fn(),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

describe('fileLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEnvBool).mockImplementation((key, defaultValue = false) => defaultValue);
    jest.mocked(getEnvString).mockImplementation((key, defaultValue = '') => defaultValue);
  });

  describe('loadFile', () => {
    it('should load a CSV file', async () => {
      jest.mocked(fs.readFileSync).mockReturnValue('var1,var2\nvalue1,value2\nvalue3,value4');

      const result = await loadFile('test.csv');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'), 'utf-8');
      expect(result).toEqual([
        { var1: 'value1', var2: 'value2' },
        { var1: 'value3', var2: 'value4' },
      ]);
    });

    it('should load a CSV file with custom delimiter', async () => {
      jest.mocked(fs.readFileSync).mockReturnValue('var1;var2\nvalue1;value2\nvalue3;value4');
      jest.mocked(getEnvString).mockReturnValue(';');

      const result = await loadFile('test.csv');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'), 'utf-8');
      expect(result).toEqual([
        { var1: 'value1', var2: 'value2' },
        { var1: 'value3', var2: 'value4' },
      ]);
    });

    it('should load a JSON file', async () => {
      const jsonData = [{ var1: 'value1' }, { var2: 'value2' }];
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonData));

      const result = await loadFile('test.json');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.json'), 'utf-8');
      expect(result).toEqual(jsonData);
    });

    it('should load a YAML file', async () => {
      const yamlData = '- var1: value1\n- var2: value2';
      jest.mocked(fs.readFileSync).mockReturnValue(yamlData);

      const result = await loadFile('test.yaml');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.yaml'), 'utf-8');
      expect(result).toEqual([{ var1: 'value1' }, { var2: 'value2' }]);
    });

    it('should load a plain text file', async () => {
      const textContent = 'This is a plain text file';
      jest.mocked(fs.readFileSync).mockReturnValue(textContent);

      const result = await loadFile('test.txt');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.txt'), 'utf-8');
      expect(result).toEqual(textContent);
    });

    it('should load text file with prompt separator as array', async () => {
      const textContent = 'Prompt 1\n---\nPrompt 2\n---\nPrompt 3';
      jest.mocked(fs.readFileSync).mockReturnValue(textContent);
      jest
        .mocked(getEnvString)
        .mockImplementation((key, defaultValue) =>
          key === 'PROMPTFOO_PROMPT_SEPARATOR' ? '---' : defaultValue,
        );

      const result = await loadFile('prompts.txt');

      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('prompts.txt'), 'utf-8');
      expect(result).toEqual(['Prompt 1', 'Prompt 2', 'Prompt 3']);
    });

    it('should load a JavaScript file', async () => {
      const jsData = [{ var1: 'value1' }, { var2: 'value2' }];
      jest.mocked(importModule).mockResolvedValue(jsData);

      const result = await loadFile('test.js');

      expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test.js'), undefined);
      expect(result).toEqual(jsData);
    });

    it('should load a JavaScript file with function name', async () => {
      const jsFunction = jest.fn().mockResolvedValue([{ var1: 'value1' }]);
      jest.mocked(importModule).mockResolvedValue(jsFunction);

      const result = await loadFile('test.js:myFunction');

      expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test.js'), 'myFunction');
      expect(result).toEqual([{ var1: 'value1' }]);
    });

    it('should load a Python file', async () => {
      const pyData = [{ var1: 'value1' }, { var2: 'value2' }];
      jest.mocked(runPython).mockResolvedValue(pyData);

      const result = await loadFile('test.py');

      expect(runPython).toHaveBeenCalledWith(
        expect.stringContaining('test.py'),
        'generate_tests',
        [],
      );
      expect(result).toEqual(pyData);
    });

    it('should load a Python file with function name', async () => {
      const pyData = [{ var1: 'value1' }];
      jest.mocked(runPython).mockResolvedValue(pyData);

      const result = await loadFile('test.py:myFunction');

      expect(runPython).toHaveBeenCalledWith(expect.stringContaining('test.py'), 'myFunction', []);
      expect(result).toEqual(pyData);
    });

    it('should load from Google Sheets', async () => {
      const sheetData = [{ var1: 'value1' }, { var2: 'value2' }] as any;
      jest.mocked(fetchCsvFromGoogleSheet).mockResolvedValue(sheetData);

      const result = await loadFile('https://docs.google.com/spreadsheets/d/example');

      expect(fetchCsvFromGoogleSheet).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/example',
      );
      expect(result).toEqual(sheetData);
    });

    it('should load from HuggingFace dataset', async () => {
      const hfData = [{ var1: 'value1' }, { var2: 'value2' }] as any;
      jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(hfData);

      const result = await loadFile('huggingface://datasets/example/dataset');

      expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(
        'huggingface://datasets/example/dataset',
      );
      expect(result).toEqual(hfData);
    });

    it('should throw error with too many colons', async () => {
      await expect(loadFile('test.py:foo:bar')).rejects.toThrow(
        'Too many colons. Invalid test file script path: test.py:foo:bar',
      );
    });
  });

  describe('loadFilesFromGlob', () => {
    it('should load multiple files from a glob pattern', async () => {
      jest.mocked(globSync).mockReturnValue(['file1.txt', 'file2.txt']);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce('Content of file1')
        .mockReturnValueOnce('Content of file2');

      const result = await loadFilesFromGlob('*.txt');

      expect(globSync).toHaveBeenCalledWith(expect.stringContaining('*.txt'), expect.any(Object));
      expect(result).toEqual(['Content of file1', 'Content of file2']);
    });

    it('should handle empty glob results', async () => {
      jest.mocked(globSync).mockReturnValue([]);

      const result = await loadFilesFromGlob('*.nonexistent');

      expect(result).toEqual([]);
    });

    it('should flatten arrays of arrays', async () => {
      jest.mocked(globSync).mockReturnValue(['file1.txt', 'file2.txt']);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce('Part 1\n---\nPart 2')
        .mockReturnValueOnce('Part 3\n---\nPart 4');
      jest
        .mocked(getEnvString)
        .mockImplementation((key, defaultValue) =>
          key === 'PROMPTFOO_PROMPT_SEPARATOR' ? '---' : defaultValue,
        );

      const result = await loadFilesFromGlob('*.txt');

      expect(result).toEqual(['Part 1', 'Part 2', 'Part 3', 'Part 4']);
    });
  });

  describe('readFiles', () => {
    it('should read files and merge their contents', async () => {
      jest.mocked(globSync).mockReturnValue(['file1.yaml', 'file2.yaml']);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValueOnce('var1: value1\nvar2: value2')
        .mockReturnValueOnce('var3: value3\nvar4: value4');

      const result = await readFiles(['*.yaml']);

      expect(globSync).toHaveBeenCalledWith(expect.stringContaining('*.yaml'), expect.any(Object));
      expect(result).toEqual({
        var1: 'value1',
        var2: 'value2',
        var3: 'value3',
        var4: 'value4',
      });
    });

    it('should handle a single file path', async () => {
      jest.mocked(globSync).mockReturnValue(['file.yaml']);
      jest.mocked(fs.readFileSync).mockReturnValue('var1: value1\nvar2: value2');

      const result = await readFiles('file.yaml');

      expect(globSync).toHaveBeenCalledWith(
        expect.stringContaining('file.yaml'),
        expect.any(Object),
      );
      expect(result).toEqual({
        var1: 'value1',
        var2: 'value2',
      });
    });
  });
});
