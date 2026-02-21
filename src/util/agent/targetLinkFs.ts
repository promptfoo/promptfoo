/**
 * CLI-side filesystem event handlers for recon.
 *
 * Wire onto an AgentClient to handle FS_READ, FS_LIST, FS_GREP
 * events from the server and respond with results.
 */

import logger from '../../logger';
import { TargetLinkEvents } from '../../types/targetLink';

import type { FsReadRequest, FsListRequest, FsGrepRequest } from '../../types/targetLink';
import type { AgentClient } from './agentClient';
import { readFile, listDirectory, grepFiles } from './fsOperations';

/**
 * Attach filesystem handlers to an AgentClient.
 *
 * @param client - The connected AgentClient
 * @param rootDir - The root directory for filesystem operations
 */
export function attachTargetLinkFs(client: AgentClient, rootDir: string): void {
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
        const { matches, truncated } = grepFiles(pattern, rootDir, {
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
}
