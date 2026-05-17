/**
 * CLI-side filesystem event handlers for recon.
 *
 * Wire onto an AgentClient to handle FS_READ, FS_LIST, FS_GREP, FS_WRITE
 * events from the server and respond with results.
 */

import logger from '../../logger';
import { TargetLinkEvents } from '../../types/targetLink';
import { grepFiles, listDirectory, readFile, writeFile } from './fsOperations';

import type {
  FsGrepRequest,
  FsListRequest,
  FsReadRequest,
  FsWriteRequest,
} from '../../types/targetLink';
import type { AgentClient } from './agentClient';

export interface AttachTargetLinkFsOptions {
  /** Called after a file is successfully written, with the absolute path. */
  onFileWritten?: (absolutePath: string) => void;
}

/**
 * Attach filesystem handlers to an AgentClient.
 *
 * **Trust model:** FS_WRITE content flowing through this handler should
 * originate from deterministic compilation (e.g., DSL-to-JS), not freeform
 * agent output. If the content source changes to accept agent-generated text,
 * an explicit user-approval gate must be added before writing.
 *
 * @param client - The connected AgentClient
 * @param rootDir - The root directory for filesystem operations
 * @param options - Optional callbacks
 */
export function attachTargetLinkFs(
  client: AgentClient,
  rootDir: string,
  options?: AttachTargetLinkFsOptions,
): void {
  client.on(TargetLinkEvents.FS_READ, (payload: FsReadRequest) => {
    void (async () => {
      const { requestId, path: filePath } = payload;
      logger.debug('[TargetLink] Received fs_read request', { requestId, path: filePath });

      try {
        const content = await readFile(filePath, rootDir);
        client.emit(TargetLinkEvents.FS_READ_RESULT, { requestId, content });
      } catch (error) {
        client.emit(TargetLinkEvents.FS_READ_RESULT, {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  client.on(TargetLinkEvents.FS_LIST, (payload: FsListRequest) => {
    void (async () => {
      const { requestId, path: dirPath } = payload;
      logger.debug('[TargetLink] Received fs_list request', { requestId, path: dirPath });

      try {
        const entries = await listDirectory(dirPath, rootDir);
        client.emit(TargetLinkEvents.FS_LIST_RESULT, { requestId, entries });
      } catch (error) {
        client.emit(TargetLinkEvents.FS_LIST_RESULT, {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  client.on(TargetLinkEvents.FS_GREP, (payload: FsGrepRequest) => {
    void (async () => {
      const { requestId, pattern, path: searchPath, include } = payload;
      logger.debug('[TargetLink] Received fs_grep request', { requestId, pattern });

      try {
        const { matches, truncated } = await grepFiles(pattern, rootDir, {
          path: searchPath,
          include,
        });
        client.emit(TargetLinkEvents.FS_GREP_RESULT, {
          requestId,
          matches,
          truncated,
        });
      } catch (error) {
        client.emit(TargetLinkEvents.FS_GREP_RESULT, {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  client.on(TargetLinkEvents.FS_WRITE, (payload: FsWriteRequest) => {
    void (async () => {
      const { requestId, path: filePath } = payload;
      logger.debug('[TargetLink] Received fs_write request', { requestId, path: filePath });

      try {
        const writtenPath = await writeFile(filePath, payload.content, rootDir);
        options?.onFileWritten?.(writtenPath);
        client.emit(TargetLinkEvents.FS_WRITE_RESULT, {
          requestId,
          success: true,
          writtenPath,
        });
      } catch (error) {
        client.emit(TargetLinkEvents.FS_WRITE_RESULT, {
          requestId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}
