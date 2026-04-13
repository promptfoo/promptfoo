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
 * calling the Anthropic Messages API with an OAuth token. As of 2025-Q4 the
 * API returns HTTP 400 `invalid_request_error` when an OAuth-authenticated
 * request's first system block is not this exact string, so any caller
 * reusing a Claude Code OAuth token must inject this block before the
 * user-provided system prompt. Re-verify if Anthropic ships an OAuth-native
 * `/v1/messages` path that drops the requirement.
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

/**
 * Result of attempting to parse a Claude Code credential blob. Uses a
 * discriminated union so callers can distinguish a parse failure (shape is
 * wrong — warn the user) from a missing credential (silently fall through to
 * the next source).
 */
type ParseResult =
  | { ok: true; credential: ClaudeCodeOAuthCredential }
  | { ok: false; reason: string };

/**
 * `security` exits with status 44 when the requested generic-password entry
 * does not exist. Any other non-zero exit (or throw) indicates a real failure
 * — ACL denial, corrupted entry, missing binary, timeout — and is worth a
 * `warn` log rather than silently falling through.
 */
const SECURITY_ENTRY_NOT_FOUND = 44;

function parseCredential(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'credential JSON is not an object' };
  }
  const outer = raw as Record<string, unknown>;
  const claudeAiOauth = outer.claudeAiOauth;
  if (!claudeAiOauth || typeof claudeAiOauth !== 'object') {
    return { ok: false, reason: 'missing `claudeAiOauth` object' };
  }
  const inner = claudeAiOauth as Record<string, unknown>;
  const accessToken = inner.accessToken;
  if (typeof accessToken !== 'string' || !accessToken) {
    return { ok: false, reason: 'missing `claudeAiOauth.accessToken` string' };
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
  return { ok: true, credential };
}

function parseJsonBlob(blob: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch (err) {
    return {
      ok: false,
      reason: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return parseCredential(parsed);
}

function readFromMacosKeychain(): ClaudeCodeOAuthCredential | null {
  if (process.platform !== 'darwin') {
    return null;
  }
  let out: string;
  try {
    // `security` prints the password (the stored JSON blob) to stdout with -w.
    // stderr is silenced so denied keychain prompts do not pollute logs.
    out = execFileSync(
      'security',
      ['find-generic-password', '-s', CLAUDE_CODE_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    );
  } catch (err) {
    const status = (err as NodeJS.ErrnoException & { status?: number })?.status;
    if (status === SECURITY_ENTRY_NOT_FOUND) {
      // No entry in the keychain — fall through to file-based lookup silently.
      logger.debug(
        '[anthropic] No Claude Code credential entry in the macOS keychain; trying file fallback.',
      );
      return null;
    }
    // Anything else is a real failure (ACL denied, `security` missing,
    // timeout, etc.). Surface it at `warn` so users can diagnose a broken
    // setup without enabling debug logging.
    logger.warn(
      '[anthropic] Failed to read Claude Code credential from macOS keychain; falling back to file lookup.',
      { error: err instanceof Error ? err.message : String(err) },
    );
    return null;
  }
  const trimmed = out.trim();
  if (!trimmed) {
    // Keychain entry exists but is empty — treat as malformed and warn.
    logger.warn(
      '[anthropic] Claude Code macOS keychain entry is empty. Run `claude /login` to refresh it.',
    );
    return null;
  }
  const result = parseJsonBlob(trimmed);
  if (!result.ok) {
    logger.warn(
      `[anthropic] Claude Code macOS keychain entry is malformed (${result.reason}). Run \`claude /login\` to refresh it.`,
    );
    return null;
  }
  return result.credential;
}

function readFromFile(): ClaudeCodeOAuthCredential | null {
  const filePath = resolveCredentialsPath();
  if (!fs.existsSync(filePath)) {
    // No credentials file — this is the common "not logged in" path; the
    // caller at `generic.ts` already surfaces a user-facing warning.
    return null;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.warn(
      `[anthropic] Claude Code credentials file at ${filePath} exists but could not be read. Run \`claude /login\` to refresh it.`,
      { error: err instanceof Error ? err.message : String(err) },
    );
    return null;
  }
  const result = parseJsonBlob(raw);
  if (!result.ok) {
    logger.warn(
      `[anthropic] Claude Code credentials file at ${filePath} is malformed (${result.reason}). Run \`claude /login\` to refresh it.`,
    );
    return null;
  }
  return result.credential;
}

/**
 * Loads a Claude Code OAuth credential from the local environment.
 *
 * Resolution order:
 * 1. macOS keychain (`security find-generic-password -s "Claude Code-credentials"`)
 *    — only attempted on darwin.
 * 2. `$HOME/.claude/.credentials.json` — the Linux/Windows default used by
 *    Claude Code, and a fallback on macOS when the keychain entry is missing.
 *    On Windows this resolves to `%USERPROFILE%\.claude\.credentials.json`.
 *
 * Returns `null` when no credential is available. Callers should check
 * {@link isCredentialExpired} on a non-null return before using it — this
 * function does not filter out expired credentials so callers can decide
 * whether to warn, refuse, or surface a 401 to the user.
 *
 * Never throws. Missing credentials fall through silently; corrupted or
 * unreadable credentials are logged at `warn` level with a reason so broken
 * setups are diagnosable without enabling debug logging.
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
