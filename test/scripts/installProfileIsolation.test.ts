import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIsolatedConsumerRoot } from '../../scripts/installProfileIsolation';

describe('assertIsolatedConsumerRoot', () => {
  let temporaryRoot: string;
  let checkout: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-isolation-'));
    checkout = path.join(temporaryRoot, 'checkout');
    fs.mkdirSync(checkout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  function directory(relativePath: string): string {
    const result = path.join(temporaryRoot, relativePath);
    fs.mkdirSync(result, { recursive: true });
    return result;
  }

  it('accepts a fresh external temporary consumer despite checkout dependencies', () => {
    const consumer = directory('consumer');
    directory('checkout/node_modules');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).not.toThrow();
  });

  it('rejects the checkout itself', () => {
    expect(() => assertIsolatedConsumerRoot(checkout, checkout)).toThrow('outside the checkout');
  });

  it('rejects a TMPDIR nested in the checkout with ancestor dependencies', () => {
    const consumer = directory('checkout/tmp/consumer');
    directory('checkout/node_modules');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow('outside the checkout');
  });

  it('rejects descendants of the checkout even without installed dependencies', () => {
    const consumer = directory('checkout/tmp/consumer');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow('outside the checkout');
  });

  it('accepts a sibling sharing the checkout name prefix', () => {
    const consumer = directory('checkout-consumer');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).not.toThrow();
  });

  it('rejects an external ancestor installation beyond the immediate parent', () => {
    const consumer = directory('external/tmp/nested/consumer');
    const nodeModules = directory('external/node_modules');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow(
      `Consumer root has an ancestor node_modules entry: ${nodeModules}`,
    );
  });

  it('rejects an ancestor node_modules symlink, including a dangling target', () => {
    const consumer = directory('external/tmp/consumer');
    const nodeModules = path.join(temporaryRoot, 'external/node_modules');
    fs.symlinkSync(path.join(temporaryRoot, 'missing-target'), nodeModules, 'dir');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow(
      'ancestor node_modules entry',
    );
  });

  it('rejects an ancestor node_modules entry even when it is a regular file', () => {
    const consumer = directory('external/consumer');
    fs.writeFileSync(path.join(temporaryRoot, 'external/node_modules'), 'unexpected entry');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow(
      'ancestor node_modules entry',
    );
  });

  it('resolves a symlinked consumer path before checking checkout containment', () => {
    const actualConsumer = directory('checkout/tmp/consumer');
    const alias = path.join(temporaryRoot, 'external-alias');
    fs.symlinkSync(actualConsumer, alias, 'dir');

    expect(() => assertIsolatedConsumerRoot(alias, checkout)).toThrow('outside the checkout');
  });

  it('resolves a symlinked checkout path before checking containment', () => {
    const consumer = directory('checkout/tmp/consumer');
    const checkoutAlias = path.join(temporaryRoot, 'checkout-alias');
    fs.symlinkSync(checkout, checkoutAlias, 'dir');

    expect(() => assertIsolatedConsumerRoot(consumer, checkoutAlias)).toThrow(
      'outside the checkout',
    );
  });

  it('checks the real ancestors of a symlinked consumer outside the checkout', () => {
    const consumer = directory('external/tmp/consumer');
    directory('external/node_modules');
    const alias = path.join(temporaryRoot, 'consumer-alias');
    fs.symlinkSync(consumer, alias, 'dir');

    expect(() => assertIsolatedConsumerRoot(alias, checkout)).toThrow(
      'ancestor node_modules entry',
    );
  });

  it('allows the measured consumer installation itself', () => {
    const consumer = directory('consumer');
    directory('consumer/node_modules');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).not.toThrow();
  });

  it('rejects a consumer path that has not been created', () => {
    expect(() => assertIsolatedConsumerRoot(path.join(temporaryRoot, 'missing'), checkout)).toThrow(
      /ENOENT/,
    );
  });

  it('rejects a regular file as a consumer root', () => {
    const consumer = path.join(temporaryRoot, 'file');
    fs.writeFileSync(consumer, 'not a directory');

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow(
      'Consumer root must be a directory',
    );
  });

  it('preserves errors when ancestor isolation cannot be inspected', () => {
    const consumer = directory('consumer');
    const denied = Object.assign(new Error('access denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw denied;
    });

    expect(() => assertIsolatedConsumerRoot(consumer, checkout)).toThrow(denied);
  });
});
