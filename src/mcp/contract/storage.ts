import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { McpServerContract } from './types';

export const DEFAULT_CONTRACT_DIR = '.promptfoo/contracts';

/**
 * Resolves standard contract baseline path on disk.
 */
export function getContractBaselinePath(serverId: string, customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  const sanitizedId = serverId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.resolve(DEFAULT_CONTRACT_DIR, `${sanitizedId}.contract.json`);
}

/**
 * Saves an MCP server contract snapshot to disk.
 */
export async function saveContractBaseline(
  contract: McpServerContract,
  customPath?: string,
): Promise<string> {
  const filePath = getContractBaselinePath(contract.serverId, customPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(contract, null, 2), 'utf8');
  return filePath;
}

/**
 * Loads an MCP server contract snapshot from disk.
 * Returns null if the file does not exist.
 */
export async function loadContractBaseline(
  serverId: string,
  customPath?: string,
): Promise<McpServerContract | null> {
  const filePath = getContractBaselinePath(serverId, customPath);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as McpServerContract;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

