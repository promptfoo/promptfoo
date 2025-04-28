import fs from 'fs';
import path from 'path';
import { isLocalDev } from '../../src/util/isLocalDev';

jest.mock('fs');
jest.mock('path');

describe('isLocalDev', () => {
  let mockDirname: string;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(path.resolve).mockImplementation((...args) => args.join('/'));
    jest.mocked(path.join).mockImplementation((...args) => args.join('/'));
    mockDirname = '/some/path/promptfoo/dist/src/util';
    // Mock __dirname directly since it's used in the source code
    Object.defineProperty(global, '__dirname', {
      value: mockDirname,
      writable: true,
    });
  });

  it('should return false if running from node_modules', () => {
    Object.defineProperty(global, '__dirname', {
      value: '/some/path/node_modules/promptfoo/dist/src/util',
      writable: true,
    });
    expect(isLocalDev()).toBe(false);
  });

  it('should return true if .git directory exists', () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    expect(isLocalDev()).toBe(true);
  });

  it('should return false if .git directory does not exist', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    expect(isLocalDev()).toBe(false);
  });

  it('should return false if fs operations throw error', () => {
    jest.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });
    expect(isLocalDev()).toBe(false);
  });

  it('should check for .git in project root', () => {
    const mockPath = '/gru/repos/promptfoo/src/util';
    Object.defineProperty(global, '__dirname', {
      value: mockPath,
      writable: true,
    });
    jest.mocked(fs.existsSync).mockReturnValue(true);
    isLocalDev();
    expect(fs.existsSync).toHaveBeenCalledWith('/gru/repos/promptfoo/src/util/../../.git');
    expect(path.resolve).toHaveBeenCalledWith('/gru/repos/promptfoo/src/util', '..', '..');
    expect(path.join).toHaveBeenCalledWith('/gru/repos/promptfoo/src/util/../..', '.git');
  });

  it('should handle undefined __dirname', () => {
    Object.defineProperty(global, '__dirname', {
      value: undefined,
      writable: true,
    });
    expect(isLocalDev()).toBe(false);
  });

  it('should handle empty __dirname', () => {
    Object.defineProperty(global, '__dirname', {
      value: '',
      writable: true,
    });
    expect(isLocalDev()).toBe(false);
  });
});
