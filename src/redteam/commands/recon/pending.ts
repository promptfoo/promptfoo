/**
 * Centralized pending recon file I/O.
 *
 * This module provides read/write/delete helpers for the pending-recon.json file,
 * ensuring both CLI and server use identical paths and validation.
 *
 * @module redteam/commands/recon/pending
 */

import * as fs from 'fs';
import * as path from 'path';

import logger from '../../../logger';
import { getConfigDirectoryPath } from '../../../util/config/manage';
import { type PendingReconConfig, PendingReconConfigSchema } from '../../../validators/recon';

/** Filename for pending recon config */
export const PENDING_RECON_FILENAME = 'pending-recon.json';

/**
 * Gets the path to the pending recon config file.
 *
 * @param createDir - If true, creates the config directory if it doesn't exist
 * @returns Absolute path to pending-recon.json
 */
export function getPendingReconPath(createDir = false): string {
  return path.join(getConfigDirectoryPath(createDir), PENDING_RECON_FILENAME);
}

/**
 * Writes pending recon config to the file system.
 *
 * @param config - The pending recon configuration to write
 * @returns The path where the config was written
 */
export function writePendingReconConfig(config: PendingReconConfig): string {
  const pendingPath = getPendingReconPath(true);
  fs.writeFileSync(pendingPath, JSON.stringify(config, null, 2));
  logger.debug(`Wrote pending recon config to ${pendingPath}`);
  return pendingPath;
}

/**
 * Custom error for invalid pending recon config format.
 */
export class InvalidPendingReconError extends Error {
  public readonly details: Record<string, string[] | undefined>;

  constructor(message: string, details: Record<string, string[] | undefined>) {
    super(message);
    this.name = 'InvalidPendingReconError';
    this.details = details;
  }
}

/**
 * Reads and validates pending recon config from the file system.
 *
 * If the file exists but is corrupted (malformed JSON or invalid schema),
 * it will be automatically deleted to prevent repeated failures.
 *
 * @param options.deleteOnError - If true (default), delete corrupted files
 * @returns The parsed and validated config, or null if file doesn't exist
 * @throws InvalidPendingReconError if file exists but contains invalid data
 * @throws Error if file exists but contains malformed JSON
 */
export function readPendingReconConfig(
  options: { deleteOnError?: boolean } = {},
): PendingReconConfig | null {
  const { deleteOnError = true } = options;
  const pendingPath = getPendingReconPath();

  if (!fs.existsSync(pendingPath)) {
    return null;
  }

  let content: string;
  let parsed: unknown;

  try {
    content = fs.readFileSync(pendingPath, 'utf-8');
    parsed = JSON.parse(content);
  } catch {
    // Malformed JSON - delete the corrupted file
    if (deleteOnError) {
      logger.warn('Pending recon config contains malformed JSON, deleting corrupted file', {
        path: pendingPath,
      });
      try {
        fs.unlinkSync(pendingPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw new InvalidPendingReconError('Pending recon file contains malformed JSON', {
      parse: ['File is not valid JSON. Run `promptfoo redteam recon` again to regenerate.'],
    });
  }

  // Validate against schema
  const result = PendingReconConfigSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    logger.warn('Pending recon config validation failed', { errors: fieldErrors });

    // Delete corrupted file to prevent repeated failures
    if (deleteOnError) {
      logger.warn('Deleting invalid pending recon config', { path: pendingPath });
      try {
        fs.unlinkSync(pendingPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    throw new InvalidPendingReconError(
      'Invalid pending recon file format. Run `promptfoo redteam recon` again to regenerate.',
      fieldErrors,
    );
  }

  return result.data;
}

/**
 * Deletes the pending recon config file.
 *
 * @returns true if file was deleted, false if it didn't exist
 */
export function deletePendingReconConfig(): boolean {
  const pendingPath = getPendingReconPath();

  if (!fs.existsSync(pendingPath)) {
    return false;
  }

  fs.unlinkSync(pendingPath);
  logger.debug(`Deleted pending recon config at ${pendingPath}`);
  return true;
}

/**
 * Checks if a pending recon config exists.
 */
export function hasPendingReconConfig(): boolean {
  return fs.existsSync(getPendingReconPath());
}

/**
 * Builds a PendingReconConfig from recon results and config.
 *
 * This is the canonical way to construct the pending config structure,
 * ensuring consistency between CLI and any other code that needs to
 * create pending configs.
 *
 * @param config - The generated red team config
 * @param result - The recon analysis result
 * @param codebaseDirectory - Path to the analyzed codebase
 */
export function buildPendingConfig(
  config: Record<string, unknown>,
  result: {
    purpose?: string;
    features?: string;
    industry?: string;
    systemPrompt?: string;
    hasAccessTo?: string;
    doesNotHaveAccessTo?: string;
    userTypes?: string;
    securityRequirements?: string;
    sensitiveDataTypes?: string;
    exampleIdentifiers?: string;
    criticalActions?: string;
    forbiddenTopics?: string;
    attackConstraints?: string;
    competitors?: string;
    connectedSystems?: string;
    redteamUser?: string;
    stateful?: boolean;
    entities?: string[];
    discoveredTools?: Array<{
      name: string;
      description: string;
      file?: string;
      parameters?: string;
    }>;
    securityNotes?: string[];
    keyFiles?: string[];
    suggestedPlugins?: string[];
  },
  codebaseDirectory: string,
): PendingReconConfig {
  return {
    config,
    metadata: {
      source: 'recon-cli',
      timestamp: Date.now(),
      codebaseDirectory,
      keyFilesAnalyzed: result.keyFiles?.length || 0,
      applicationDefinition: {
        purpose: result.purpose,
        features: result.features,
        industry: result.industry,
        systemPrompt: result.systemPrompt,
        hasAccessTo: result.hasAccessTo,
        doesNotHaveAccessTo: result.doesNotHaveAccessTo,
        userTypes: result.userTypes,
        securityRequirements: result.securityRequirements,
        sensitiveDataTypes: result.sensitiveDataTypes,
        exampleIdentifiers: result.exampleIdentifiers,
        criticalActions: result.criticalActions,
        forbiddenTopics: result.forbiddenTopics,
        attackConstraints: result.attackConstraints,
        competitors: result.competitors,
        connectedSystems: result.connectedSystems,
        redteamUser: result.redteamUser,
      },
      reconDetails: {
        stateful: result.stateful,
        entities: result.entities,
        discoveredTools: result.discoveredTools,
        securityNotes: result.securityNotes,
        keyFiles: result.keyFiles,
        suggestedPlugins: result.suggestedPlugins,
      },
    },
    reconResult: result,
  };
}
