import * as fs from 'fs';
import { getEnvBool, getEnvString } from '../../../src/envars';
import { readStandaloneTestsFile } from '../../../src/util/testCaseReader';

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

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../../../src/envars', () => ({
  ...jest.requireActual('../../../src/envars'),
  getEnvBool: jest.fn(),
  getEnvString: jest.fn(),
}));

describe('Test Case Reader - CSV JSON Field Parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEnvBool).mockImplementation((key, defaultValue = false) => defaultValue);
    jest.mocked(getEnvString).mockImplementation((key, defaultValue) => defaultValue || '');
  });

  it('parses properly escaped JSON fields in CSV', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,"{\""answer\"":""""}",file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('falls back to relaxed parsing for unescaped JSON', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('enforces strict CSV parsing when environment variable is set', async () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key, defaultValue = false) =>
        key === 'PROMPTFOO_CSV_STRICT' ? true : defaultValue,
      );

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow(
      'Invalid Opening Quote: a quote is found on field',
    );

    jest.mocked(fs.readFileSync).mockRestore();
  });
});
