/**
 * Mock for fileLoader module for tests
 * This simulates the behavior of src/util/fileLoader.ts for tests
 */
import * as fs from 'fs';

// Mock the loadFile function
export const loadFile = jest
  .fn()
  .mockImplementation(async (filePath: string, options: any = {}) => {
    try {
      // Simulate the real fileLoader behavior by reading files with fs.readFileSync
      const content = fs.readFileSync(filePath, 'utf-8');

      // Handle different file formats based on extension
      if (filePath.endsWith('.json')) {
        try {
          return JSON.parse(content);
        } catch (e) {
          return content; // Return raw content if parsing fails
        }
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        try {
          return require('js-yaml').load(content);
        } catch (e) {
          return content; // Return raw content if parsing fails
        }
      }

      // Default behavior - return content as string
      return content;
    } catch (error) {
      throw error;
    }
  });

// Mock the loadFilesFromGlob function
export const loadFilesFromGlob = jest
  .fn()
  .mockImplementation(async (globPattern: string, options: any = {}) => {
    const paths = require('glob').globSync(globPattern);
    const results = [];

    for (const filePath of paths) {
      try {
        const content = await loadFile(filePath, options);
        results.push(content);
      } catch (error) {
        // Ignore errors for non-existent files during glob
        console.error(`Error loading file ${filePath}:`, error);
      }
    }

    return results;
  });

// Mock the readFiles function
export const readFiles = jest
  .fn()
  .mockImplementation(async (filesOrGlob: string | string[], basePath: string = '') => {
    if (Array.isArray(filesOrGlob)) {
      const results = [];
      for (const fileOrGlob of filesOrGlob) {
        const content = await loadFile(fileOrGlob);
        results.push(content);
      }
      return results;
    } else {
      return loadFile(filesOrGlob);
    }
  });

// Export the mock functions
export default {
  loadFile,
  loadFilesFromGlob,
  readFiles,
};
