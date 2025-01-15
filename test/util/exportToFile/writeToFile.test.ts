import fs from 'fs';
import path from 'path';
import { JsonlFileWriter } from '../../../src/util/exportToFile/writeToFile';

describe('JsonlFileWriter', () => {
  const testFilePath = path.join(__dirname, 'test.jsonl');

  beforeEach(() => {
    // Clean up test file before each test
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    // Clean up test file after each test
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it('should write data to file', async () => {
    const writer = new JsonlFileWriter(testFilePath);
    const testData = { test: 'data' };

    await writer.write(testData);
    await writer.close();

    const fileContent = fs.readFileSync(testFilePath, 'utf-8');
    expect(fileContent).toBe(JSON.stringify(testData) + '\n');
  });

  it('should append multiple records', async () => {
    const writer = new JsonlFileWriter(testFilePath);
    const testData1 = { id: 1, value: 'first' };
    const testData2 = { id: 2, value: 'second' };

    await writer.write(testData1);
    await writer.write(testData2);
    await writer.close();

    const fileContent = fs.readFileSync(testFilePath, 'utf-8');
    const expected = JSON.stringify(testData1) + '\n' + JSON.stringify(testData2) + '\n';
    expect(fileContent).toBe(expected);
  });

  it('should handle empty objects', async () => {
    const writer = new JsonlFileWriter(testFilePath);
    const emptyData = {};

    await writer.write(emptyData);
    await writer.close();

    const fileContent = fs.readFileSync(testFilePath, 'utf-8');
    expect(fileContent).toBe('{}\n');
  });

  it('should close the write stream', async () => {
    const writer = new JsonlFileWriter(testFilePath);
    await writer.write({ test: 'data' });
    await writer.close();

    // Verify file exists and was written to
    expect(fs.existsSync(testFilePath)).toBe(true);
  });
});
