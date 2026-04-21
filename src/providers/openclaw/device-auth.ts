import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import logger from '../../logger';
import { getConfigDirectoryPath } from '../../util/config/manage';
import { sha256 } from '../../util/createHash';

export interface OpenClawDeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface OpenClawSignedDevice {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

export interface OpenClawDeviceAuthToken {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
}

interface DeviceAuthStore {
  version: 1;
  deviceId: string;
  tokens: Record<string, OpenClawDeviceAuthToken>;
}

export interface OpenClawDeviceAuthPayloadV3Params {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}

const DEFAULT_CLIENT_DIR = 'openclaw';
const DEFAULT_DEVICE_IDENTITY_FILE = 'device-identity.json';
const DEFAULT_DEVICE_AUTH_FILE = 'device-auth.json';

function defaultOpenClawClientPath(fileName: string): string {
  return path.join(getConfigDirectoryPath(true), DEFAULT_CLIENT_DIR, fileName);
}

export function getDefaultOpenClawDeviceIdentityPath(): string {
  return defaultOpenClawClientPath(DEFAULT_DEVICE_IDENTITY_FILE);
}

export function getDefaultOpenClawDeviceAuthPath(): string {
  return defaultOpenClawClientPath(DEFAULT_DEVICE_AUTH_FILE);
}

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

function writeJsonSecure(filePath: string, value: unknown): void {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch (err) {
    logger.debug('[OpenClaw Device Auth] Failed to parse JSON', {
      err,
      rawLength: raw.length,
      rawPreview: raw.slice(0, 100),
    });
    return undefined;
  }
}

function normalizeDeviceMetadataValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const scope of scopes || []) {
    const trimmed = scope.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  if (seen.has('operator.admin')) {
    seen.add('operator.read');
    seen.add('operator.write');
  } else if (seen.has('operator.write')) {
    seen.add('operator.read');
  }
  return Array.from(seen).sort();
}

function publicKeyBase64UrlFromPem(publicKeyPem: string): string {
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: unknown };
  if (typeof jwk.x === 'string' && jwk.x.trim()) {
    return jwk.x;
  }

  const der = publicKey.export({ type: 'spki', format: 'der' });
  return Buffer.from(der.subarray(Math.max(0, der.length - 32))).toString('base64url');
}

function deriveDeviceId(publicKeyPem: string): string {
  return sha256(Buffer.from(publicKeyBase64UrlFromPem(publicKeyPem), 'base64url'));
}

function isValidIdentity(identity: OpenClawDeviceIdentity): boolean {
  try {
    const publicKeyFromPrivateKey = crypto
      .createPublicKey(identity.privateKeyPem)
      .export({ type: 'spki', format: 'pem' }) as string;
    return (
      identity.deviceId === deriveDeviceId(identity.publicKeyPem) &&
      publicKeyBase64UrlFromPem(identity.publicKeyPem) ===
        publicKeyBase64UrlFromPem(publicKeyFromPrivateKey)
    );
  } catch {
    return false;
  }
}

function parseIdentity(raw: string): OpenClawDeviceIdentity | undefined {
  const parsed = parseJsonObject(raw);
  const identity = {
    deviceId: typeof parsed?.deviceId === 'string' ? parsed.deviceId : '',
    publicKeyPem: typeof parsed?.publicKeyPem === 'string' ? parsed.publicKeyPem : '',
    privateKeyPem: typeof parsed?.privateKeyPem === 'string' ? parsed.privateKeyPem : '',
  };
  return isValidIdentity(identity) ? identity : undefined;
}

function createDeviceIdentity(): OpenClawDeviceIdentity {
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const publicKeyPem = keyPair.publicKey;
  return {
    deviceId: deriveDeviceId(publicKeyPem),
    publicKeyPem,
    privateKeyPem: keyPair.privateKey,
  };
}

export function loadOrCreateOpenClawDeviceIdentity(filePath?: string): OpenClawDeviceIdentity {
  const identityPath = filePath || getDefaultOpenClawDeviceIdentityPath();
  try {
    if (fs.existsSync(identityPath)) {
      const identity = parseIdentity(fs.readFileSync(identityPath, 'utf-8'));
      if (identity) {
        return identity;
      }
    }
  } catch (err) {
    logger.warn('[OpenClaw Device Auth] Failed to read device identity; generating new identity', {
      err,
      identityPath,
    });
  }

  const identity = createDeviceIdentity();
  try {
    writeJsonSecure(identityPath, identity);
  } catch (err) {
    logger.warn('[OpenClaw Device Auth] Failed to persist device identity', { err, identityPath });
  }
  return identity;
}

export function buildOpenClawDeviceAuthPayloadV3(
  params: OpenClawDeviceAuthPayloadV3Params,
): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
    normalizeDeviceMetadataValue(params.platform),
    normalizeDeviceMetadataValue(params.deviceFamily),
  ].join('|');
}

export function signOpenClawDevicePayload(privateKeyPem: string, payload: string): string {
  return crypto.sign(null, Buffer.from(payload), privateKeyPem).toString('base64url');
}

export function buildSignedOpenClawDevice(params: {
  identity: OpenClawDeviceIdentity;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  nonce: string;
  token?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  nowMs?: number;
}): OpenClawSignedDevice {
  const signedAt = params.nowMs ?? Date.now();
  const payload = buildOpenClawDeviceAuthPayloadV3({
    deviceId: params.identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs: signedAt,
    token: params.token,
    nonce: params.nonce,
    platform: params.platform,
    deviceFamily: params.deviceFamily,
  });

  return {
    id: params.identity.deviceId,
    publicKey: publicKeyBase64UrlFromPem(params.identity.publicKeyPem),
    signature: signOpenClawDevicePayload(params.identity.privateKeyPem, payload),
    signedAt,
    nonce: params.nonce,
  };
}

function parseDeviceAuthStore(raw: string): DeviceAuthStore | undefined {
  const parsed = parseJsonObject(raw);
  if (!parsed || parsed.version !== 1 || typeof parsed.deviceId !== 'string') {
    return undefined;
  }
  const tokens: Record<string, OpenClawDeviceAuthToken> = {};
  const rawTokens =
    parsed.tokens && typeof parsed.tokens === 'object' && !Array.isArray(parsed.tokens)
      ? (parsed.tokens as Record<string, unknown>)
      : {};

  for (const [role, tokenRecord] of Object.entries(rawTokens)) {
    if (!tokenRecord || typeof tokenRecord !== 'object' || Array.isArray(tokenRecord)) {
      continue;
    }
    const record = tokenRecord as Record<string, unknown>;
    if (typeof record.token !== 'string' || !record.token.trim()) {
      continue;
    }
    tokens[role] = {
      token: record.token,
      role: typeof record.role === 'string' ? record.role : role,
      scopes: Array.isArray(record.scopes)
        ? normalizeScopes(
            record.scopes.filter((scope): scope is string => typeof scope === 'string'),
          )
        : [],
      updatedAtMs: typeof record.updatedAtMs === 'number' ? record.updatedAtMs : 0,
    };
  }

  return {
    version: 1,
    deviceId: parsed.deviceId,
    tokens,
  };
}

function readDeviceAuthStore(filePath: string): DeviceAuthStore | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    return parseDeviceAuthStore(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    logger.debug('[OpenClaw Device Auth] Failed to read device auth store', { err, filePath });
    return undefined;
  }
}

export function loadOpenClawDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  filePath?: string;
}): OpenClawDeviceAuthToken | undefined {
  const authPath = params.filePath || getDefaultOpenClawDeviceAuthPath();
  const store = readDeviceAuthStore(authPath);
  if (!store || store.deviceId !== params.deviceId) {
    return undefined;
  }
  const role = params.role.trim();
  const tokenRecord = store.tokens[role];
  const token = tokenRecord?.token.trim();
  return token ? { ...tokenRecord, token } : undefined;
}

export function storeOpenClawDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
  filePath?: string;
}): void {
  const token = params.token.trim();
  const role = params.role.trim();
  if (!token || !role) {
    return;
  }

  const authPath = params.filePath || getDefaultOpenClawDeviceAuthPath();
  const existing = readDeviceAuthStore(authPath);
  const store: DeviceAuthStore =
    existing && existing.deviceId === params.deviceId
      ? existing
      : { version: 1, deviceId: params.deviceId, tokens: {} };

  store.tokens[role] = {
    token,
    role,
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  };

  try {
    writeJsonSecure(authPath, store);
  } catch (err) {
    logger.warn('[OpenClaw Device Auth] Failed to persist device auth token', { err, authPath });
  }
}

export function clearOpenClawDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  filePath?: string;
}): void {
  const authPath = params.filePath || getDefaultOpenClawDeviceAuthPath();
  const store = readDeviceAuthStore(authPath);
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  delete store.tokens[params.role.trim()];
  try {
    writeJsonSecure(authPath, store);
  } catch (err) {
    logger.warn('[OpenClaw Device Auth] Failed to clear device auth token', { err, authPath });
  }
}
