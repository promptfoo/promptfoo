import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import logger from '../../logger';

/**
 * Shape of a Claude Code OAuth credential sourced from either the macOS
 * keychain or `$HOME/.claude/.credentials.json`.
 */
export interface ClaudeCodeOAuthCredential {
  accessToken: string;
  refreshToken?: string;
  /** Milliseconds since epoch when the access token expires, if known. */
  expiresAt?: number;
  subscriptionType?: string;
}

/**
 * Claude Code prepends this identity block as the first `system` message when
 * calling the Anthropic Messages API with an OAuth token. The API rejects
 * requests that omit it (HTTP 400), so any caller reusing a Claude Code
 * OAuth token must inject this block before the user-provided system prompt.
 */
export const CLAUDE_CODE_IDENTITY_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Anthropic beta headers required when authenticating the Messages API with a
 * Claude Code OAuth token (e.g. a Claude Max subscription access token, or a
 * long-lived token minted by `claude setup-token`).
 *
 * - `oauth-2025-04-20` enables OAuth bearer tokens on `/v1/messages`.
 * - `claude-code-20250219` enables the Claude Code tool-use surface area the
 *   OAuth token is scoped to.
 *
 * Revisit if Anthropic ships an OAuth-native Messages path that no longer
 * requires these betas.
 */
export const CLAUDE_CODE_OAUTH_BETA_FEATURES = Object.freeze([
  'claude-code-20250219',
  'oauth-2025-04-20',
] as const);

/**
 * The `user-agent` value Claude Code CLI sends on OAuth-authenticated
 * Messages requests. Anthropic's API gates OAuth tokens to the Claude Code
 * app identity, so requests that use a different user-agent fail with 401.
 *
 * The `1.0.0` suffix is cosmetic — Anthropic gates on the `claude-cli`
 * product identifier, not the semver. Revisit if OAuth requests start
 * returning 401 after SDK or CLI updates.
 */
export const CLAUDE_CODE_USER_AGENT = 'claude-cli/1.0.0 (external, promptfoo)';

/**
 * The `x-app` header value Claude Code CLI sends. Paired with
 * {@link CLAUDE_CODE_USER_AGENT} to satisfy Anthropic's OAuth app-identity
 * gate.
 */
export const CLAUDE_CODE_X_APP = 'cli';

const CLAUDE_CODE_KEYCHAIN_SERVICE = 'Claude Code-credentials';
const CLAUDE_CODE_CREDENTIALS_FILE = path.join('.claude', '.credentials.json');

function resolveCredentialsPath(): string {
  return path.join(os.homedir(), CLAUDE_CODE_CREDENTIALS_FILE);
}

function parseCredential(raw: unknown): ClaudeCodeOAuthCredential | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const outer = raw as Record<string, unknown>;
  const claudeAiOauth = outer.claudeAiOauth;
  if (!claudeAiOauth || typeof claudeAiOauth !== 'object') {
    return null;
  }
  const inner = claudeAiOauth as Record<string, unknown>;
  const accessToken = inner.accessToken;
  if (typeof accessToken !== 'string' || !accessToken) {
    return null;
  }
  const credential: ClaudeCodeOAuthCredential = { accessToken };
  if (typeof inner.refreshToken === 'string' && inner.refreshToken) {
    credential.refreshToken = inner.refreshToken;
  }
  if (typeof inner.expiresAt === 'number' && Number.isFinite(inner.expiresAt)) {
    credential.expiresAt = inner.expiresAt;
  }
  if (typeof inner.subscriptionType === 'string') {
    credential.subscriptionType = inner.subscriptionType;
  }
  return credential;
}

function readFromMacosKeychain(): ClaudeCodeOAuthCredential | null {
  if (process.platform !== 'darwin') {
    return null;
  }
  try {
    // `security` prints the password (the stored JSON blob) to stdout with -w.
    // stderr is silenced so denied keychain prompts do not pollute logs.
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', CLAUDE_CODE_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    );
    const trimmed = out.trim();
    if (!trimmed) {
      return null;
    }
    return parseCredential(JSON.parse(trimmed));
  } catch (err) {
    logger.debug('[anthropic] Failed to read Claude Code credential from macOS keychain', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function readFromFile(): ClaudeCodeOAuthCredential | null {
  const filePath = resolveCredentialsPath();
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseCredential(JSON.parse(raw));
  } catch (err) {
    logger.debug('[anthropic] Failed to read Claude Code credentials file', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Loads a Claude Code OAuth credential from the local environment.
 *
 * Resolution order:
 * 1. macOS keychain (`security find-generic-password -s "Claude Code-credentials"`)
 *    — only attempted on darwin.
 * 2. `$HOME/.claude/.credentials.json` — the Linux/Windows default used by
 *    Claude Code, and a fallback on macOS when the keychain entry is missing.
 *
 * Returns `null` when no credential is available or the source is malformed.
 * Never throws; callers decide how to surface a missing credential.
 */
export function loadClaudeCodeCredential(): ClaudeCodeOAuthCredential | null {
  return readFromMacosKeychain() ?? readFromFile();
}

/**
 * Returns `true` when the credential's `expiresAt` (ms since epoch) is in the
 * past. Credentials without an `expiresAt` are treated as non-expired — the
 * Anthropic API will reject them with a 401 if the token is actually invalid.
 */
export function isCredentialExpired(credential: ClaudeCodeOAuthCredential): boolean {
  if (credential.expiresAt == null) {
    return false;
  }
  return Date.now() >= credential.expiresAt;
}
