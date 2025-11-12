/**
 * Tests for Setup PR Detection
 */

import { detectSetupPR, SETUP_WORKFLOW_PATH } from './setupPr';
import { FileChangeStatus, type FileChange } from '../../src/types/codeScan';

describe('detectSetupPR', () => {
  it('should return true for single workflow file addition', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: FileChangeStatus.ADDED,
      },
    ];

    expect(detectSetupPR(files)).toBe(true);
  });

  it('should return false for workflow file modification', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: FileChangeStatus.MODIFIED,
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for workflow file removal', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: FileChangeStatus.REMOVED,
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for wrong file path', () => {
    const files: FileChange[] = [
      {
        path: '.github/workflows/other-workflow.yml',
        status: FileChangeStatus.ADDED,
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });

  it('should return false for multiple files including workflow', () => {
    const files: FileChange[] = [
      {
        path: SETUP_WORKFLOW_PATH,
        status: FileChangeStatus.ADDED,
      },
      {
        path: 'README.md',
        status: FileChangeStatus.MODIFIED,
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
        status: FileChangeStatus.RENAMED,
      },
    ];

    expect(detectSetupPR(files)).toBe(false);
  });
});
