import * as fs from 'fs';
import { globSync } from 'glob';
import { readTestFiles } from '../../../src/util/testCaseReader';

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

describe('Test Case Reader - Variables File Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads variables from single YAML file', async () => {
    const yamlContent = 'var1: value1\nvar2: value2';
    jest.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    jest.mocked(globSync).mockReturnValue(['vars.yaml']);

    const result = await readTestFiles('vars.yaml');

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });

  it('merges variables from multiple YAML files', async () => {
    const yamlContent1 = 'var1: value1';
    const yamlContent2 = 'var2: value2';

    // Mock globSync to return both file paths
    jest.mocked(globSync).mockImplementation((pattern) => {
      if (pattern.includes('vars1.yaml')) {
        return ['vars1.yaml'];
      } else if (pattern.includes('vars2.yaml')) {
        return ['vars2.yaml'];
      }
      return [];
    });

    // Mock readFileSync to return different content for each file
    jest.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('vars1.yaml')) {
        return yamlContent1;
      } else if (path.toString().includes('vars2.yaml')) {
        return yamlContent2;
      }
      return '';
    });

    const result = await readTestFiles(['vars1.yaml', 'vars2.yaml']);

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });
});
