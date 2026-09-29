import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getEnvString } from '../../envars';
import logger from '../../logger';

import type { EnvOverrides } from '../../types/env';

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
const CLAUDE_CODE_CREDENTIALS_FILENAME = '.credentials.json';

/**
 * Returns the `CLAUDE_CONFIG_DIR` override when one is set, or `undefined`
 * for the default `~/.claude` layout. A provider-scoped `env` override takes
 * precedence over the root config / process environment, matching how other
 * provider env vars resolve (see `AnthropicGenericProvider.getApiKey`).
 *
 * The raw configured value is returned without path normalization on
 * purpose: the Claude Code CLI derives its macOS keychain service name from
 * the exact string (see {@link resolveKeychainService}), so normalizing here
 * would break keychain lookups for values with e.g. a trailing slash.
 */
function resolveConfiguredDir(env?: EnvOverrides): string | undefined {
  return env?.CLAUDE_CONFIG_DIR || getEnvString('CLAUDE_CONFIG_DIR') || undefined;
}

/**
 * Resolves the directory Claude Code stores its config (including
 * `.credentials.json`) in. Honors `CLAUDE_CONFIG_DIR`, the same environment
 * variable the Claude Code CLI itself uses to relocate `~/.claude`, so
 * Promptfoo finds the credential file when a user has customized their
 * Claude Code config location.
 */
function resolveConfigDir(env?: EnvOverrides): string {
  return resolveConfiguredDir(env) ?? path.join(os.homedir(), '.claude');
}

function resolveCredentialsPath(env?: EnvOverrides): string {
  return path.join(resolveConfigDir(env), CLAUDE_CODE_CREDENTIALS_FILENAME);
}

/**
 * Resolves the macOS keychain service name for the Claude Code credential,
 * mirroring the Claude Code CLI: with the default config dir it is
 * `Claude Code-credentials`, but whenever `CLAUDE_CONFIG_DIR` is set — even
 * to the default `~/.claude` — the CLI appends `-` plus the first 8 hex
 * chars of sha256 of the *raw* configured value (no path normalization; a
 * trailing slash produces a different hash). Empirically verified against
 * claude v2.1.204 by tracing its `security find-generic-password` calls;
 * this is an internal CLI detail that may drift, in which case the lookup
 * misses and falls through to the credentials-file path, then to the
 * caller's "no credential found" warning.
 */
function resolveKeychainService(env?: EnvOverrides): string {
  const configuredDir = resolveConfiguredDir(env);
  if (!configuredDir) {
    return CLAUDE_CODE_KEYCHAIN_SERVICE;
  }
  const suffix = createHash('sha256').update(configuredDir).digest('hex').slice(0, 8);
  return `${CLAUDE_CODE_KEYCHAIN_SERVICE}-${suffix}`;
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

function readFromMacosKeychain(env?: EnvOverrides): ClaudeCodeOAuthCredential | null {
  if (process.platform !== 'darwin') {
    return null;
  }
  let out: string;
  try {
    // `security` prints the password (the stored JSON blob) to stdout with -w.
    // stderr is silenced so denied keychain prompts do not pollute logs.
    out = execFileSync(
      'security',
      ['find-generic-password', '-s', resolveKeychainService(env), '-w'],
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

function readFromFile(env?: EnvOverrides): ClaudeCodeOAuthCredential | null {
  const filePath = resolveCredentialsPath(env);
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
 * 1. macOS keychain — only attempted on darwin. The service name mirrors the
 *    Claude Code CLI: `Claude Code-credentials` for the default config dir,
 *    or `Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR)[:8]>` when
 *    `CLAUDE_CONFIG_DIR` is set (see {@link resolveKeychainService}), so each
 *    Claude Code profile resolves to its own credential.
 * 2. `$HOME/.claude/.credentials.json` — the Linux/Windows default used by
 *    Claude Code, and a fallback on macOS when the keychain entry is missing.
 *    On Windows this resolves to `%USERPROFILE%\.claude\.credentials.json`.
 *    Set `CLAUDE_CONFIG_DIR` to read from a different directory instead —
 *    the same environment variable the Claude Code CLI itself uses to
 *    relocate `~/.claude`. It resolves from the provider-scoped `env`
 *    override first, then the root config / process environment.
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
export function loadClaudeCodeCredential(env?: EnvOverrides): ClaudeCodeOAuthCredential | null {
  return readFromMacosKeychain(env) ?? readFromFile(env);
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
