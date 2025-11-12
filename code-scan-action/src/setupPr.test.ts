/**
 * Tests for Setup PR Detection
 */

import { detectSetupPR, SETUP_WORKFLOW_PATH } from './setupPr';
import type { FileChange } from '../../src/types/codeScan';

describe('detectSetupPR', () => {
  it('should return true for single workflow file addition', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: 'added',
      },
    ];

    expect(detectSetupPR(files)).toBe(true);
  });

  it('should return false for workflow file modification', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: 'modified',
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for workflow file removal', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: 'removed',
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for wrong file path', () => {
    const files: FileChange[] = [
      {
        path: '.github/workflows/other-workflow.yml',
        status: 'added',
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for multiple files including workflow', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: 'added',
      },
      {
        path: 'README.md',
        status: 'modified',
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for empty file list', () => {
    const files: FileChange[] = [];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for workflow file with renamed status', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: 'renamed',
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });
});
