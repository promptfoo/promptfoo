import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenClawDeviceAuthPayloadV3,
  buildSignedOpenClawDevice,
  clearOpenClawDeviceAuthToken,
  loadOpenClawDeviceAuthToken,
  loadOrCreateOpenClawDeviceIdentity,
  storeOpenClawDeviceAuthToken,
} from '../../src/providers/openclaw/device-auth';

describe('OpenClaw device auth', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.resetAllMocks();
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempPath(fileName: string): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openclaw-'));
    tempDirs.push(tempDir);
    return path.join(tempDir, fileName);
  }

  it('should build the upstream v3 signature payload', () => {
    expect(
      buildOpenClawDeviceAuthPayloadV3({
        deviceId: 'device-id',
        clientId: 'gateway-client',
        clientMode: 'cli',
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        signedAtMs: 123,
        token: 'token',
        nonce: 'nonce',
        platform: 'Darwin',
        deviceFamily: 'PromptFoo',
      }),
    ).toBe(
      'v3|device-id|gateway-client|cli|operator|operator.read,operator.write|123|token|nonce|darwin|promptfoo',
    );
  });

  it('should create, persist, and reuse an Ed25519 device identity', () => {
    const identityPath = makeTempPath('device-identity.json');

    const firstIdentity = loadOrCreateOpenClawDeviceIdentity(identityPath);
    const secondIdentity = loadOrCreateOpenClawDeviceIdentity(identityPath);

    expect(secondIdentity).toEqual(firstIdentity);
    expect(firstIdentity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    expect(firstIdentity.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(firstIdentity.privateKeyPem).toContain('BEGIN PRIVATE KEY');
  });

  it('should sign a device challenge with the persisted identity', () => {
    const identity = loadOrCreateOpenClawDeviceIdentity(makeTempPath('device-identity.json'));
    const signedDevice = buildSignedOpenClawDevice({
      identity,
      clientId: 'gateway-client',
      clientMode: 'cli',
      role: 'operator',
      scopes: ['operator.read'],
      nowMs: 123,
      nonce: 'challenge',
      token: 'token',
      platform: 'linux',
      deviceFamily: 'promptfoo',
    });
    const payload = buildOpenClawDeviceAuthPayloadV3({
      deviceId: identity.deviceId,
      clientId: 'gateway-client',
      clientMode: 'cli',
      role: 'operator',
      scopes: ['operator.read'],
      signedAtMs: signedDevice.signedAt,
      token: 'token',
      nonce: 'challenge',
      platform: 'linux',
      deviceFamily: 'promptfoo',
    });

    expect(
      crypto.verify(
        null,
        Buffer.from(payload),
        identity.publicKeyPem,
        Buffer.from(signedDevice.signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('should persist device tokens with normalized scopes', () => {
    const authPath = makeTempPath('device-auth.json');

    storeOpenClawDeviceAuthToken({
      deviceId: 'device-1',
      role: 'operator',
      token: 'device-token',
      scopes: ['operator.write'],
      filePath: authPath,
    });

    expect(
      loadOpenClawDeviceAuthToken({
        deviceId: 'device-1',
        role: 'operator',
        filePath: authPath,
      }),
    ).toEqual({
      token: 'device-token',
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      updatedAtMs: expect.any(Number),
    });
  });

  it('should clear a stored device token while preserving other roles', () => {
    const authPath = makeTempPath('device-auth.json');

    storeOpenClawDeviceAuthToken({
      deviceId: 'device-1',
      role: 'operator',
      token: 'op-token',
      scopes: ['operator.read'],
      filePath: authPath,
    });
    storeOpenClawDeviceAuthToken({
      deviceId: 'device-1',
      role: 'admin',
      token: 'admin-token',
      scopes: ['operator.admin'],
      filePath: authPath,
    });

    clearOpenClawDeviceAuthToken({
      deviceId: 'device-1',
      role: 'operator',
      filePath: authPath,
    });

    expect(
      loadOpenClawDeviceAuthToken({ deviceId: 'device-1', role: 'operator', filePath: authPath }),
    ).toBeUndefined();
    expect(
      loadOpenClawDeviceAuthToken({ deviceId: 'device-1', role: 'admin', filePath: authPath }),
    ).toEqual(expect.objectContaining({ token: 'admin-token' }));
  });

  it('should no-op when clearing a token for a non-existent file', () => {
    const authPath = makeTempPath('missing-auth.json');
    expect(() => {
      clearOpenClawDeviceAuthToken({ deviceId: 'device-1', role: 'operator', filePath: authPath });
    }).not.toThrow();
  });

  it('should no-op when clearing a token for a different device ID', () => {
    const authPath = makeTempPath('device-auth.json');
    storeOpenClawDeviceAuthToken({
      deviceId: 'device-1',
      role: 'operator',
      token: 'token-1',
      filePath: authPath,
    });

    clearOpenClawDeviceAuthToken({
      deviceId: 'device-2',
      role: 'operator',
      filePath: authPath,
    });

    expect(
      loadOpenClawDeviceAuthToken({ deviceId: 'device-1', role: 'operator', filePath: authPath }),
    ).toEqual(expect.objectContaining({ token: 'token-1' }));
  });

  it('should regenerate identity when existing file has invalid content', () => {
    const identityPath = makeTempPath('device-identity.json');
    fs.writeFileSync(identityPath, '{"deviceId":"bad","publicKeyPem":"x","privateKeyPem":"y"}');

    const identity = loadOrCreateOpenClawDeviceIdentity(identityPath);
    expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('should regenerate identity when existing file has malformed JSON', () => {
    const identityPath = makeTempPath('device-identity.json');
    fs.writeFileSync(identityPath, 'not valid json {{{');

    const identity = loadOrCreateOpenClawDeviceIdentity(identityPath);
    expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });
});
