import { afterEach, describe, expect, it, vi } from 'vitest';

const packageNames = ['playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'] as const;

afterEach(() => {
  for (const name of packageNames) {
    vi.doUnmock(name);
    vi.doUnmock(`${name}/package.json`);
  }
  vi.resetModules();
});

describe('optional browser dependencies', () => {
  it.each(packageNames)('explains how to co-install missing %s', async (name) => {
    vi.resetModules();
    vi.doMock(`${name}/package.json`, () => ({
      get default() {
        throw new Error(`Cannot find package '${name}'`);
      },
    }));
    const { loadBrowserProviderDependencies } = await import(
      '../../src/providers/browserDependencies'
    );
    await expect(loadBrowserProviderDependencies()).rejects.toThrow('npm install promptfoo');
    await expect(loadBrowserProviderDependencies()).rejects.toThrow(
      'npx playwright install chromium',
    );
  });

  it.each([
    ['playwright', '1.62.0'],
    ['playwright-extra', '4.3.5'],
    ['puppeteer-extra-plugin-stealth', '2.11.1'],
    ['playwright', 'invalid'],
  ])('rejects unsupported %s %s when invoked', async (name, version) => {
    vi.resetModules();
    vi.doMock(`${name}/package.json`, () => ({ default: { version } }));
    const { loadBrowserProviderDependencies } = await import(
      '../../src/providers/browserDependencies'
    );
    await expect(loadBrowserProviderDependencies()).rejects.toThrow(
      `installed ${name} package (${version}) is incompatible`,
    );
  });

  it('preserves the real installed browser and stealth exports', async () => {
    const { loadBrowserProviderDependencies, loadPlaywright } = await import(
      '../../src/providers/browserDependencies'
    );
    const { chromium, stealth } = await loadBrowserProviderDependencies();
    expect(chromium).toBe((await import('playwright-extra')).chromium);
    expect(stealth).toBe((await import('puppeteer-extra-plugin-stealth')).default);
    expect((await loadPlaywright()).chromium).toBe((await import('playwright')).chromium);
  });

  it('preserves errors from missing transitive packages', async () => {
    vi.resetModules();
    const error = new Error(
      "Cannot find package 'broken-transitive' imported from /node_modules/playwright/index.mjs",
    );
    vi.doMock('playwright/package.json', () => ({
      get default() {
        throw error;
      },
    }));
    const { loadPlaywright } = await import('../../src/providers/browserDependencies');
    await expect(loadPlaywright()).rejects.toBe(error);
  });
});
