import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface Component {
  name: string;
  version: string;
}

// Read the installed tree independently of npm's SBOM generator. In particular, a
// workspace/lockfile-only SBOM can silently omit packages from a consumer install.
export function installedComponents(consumerDir: string): Component[] {
  const components = new Map<string, Component>();
  function visitModules(modulesDir: string): void {
    if (!fs.existsSync(modulesDir)) {
      return;
    }
    function visitPackage(packageDir: string): void {
      assert(
        !fs.lstatSync(packageDir).isSymbolicLink(),
        `Unexpected installed link: ${packageDir}`,
      );
      const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
      assert(typeof manifest.name === 'string' && typeof manifest.version === 'string');
      const component = { name: manifest.name, version: manifest.version };
      components.set(`${component.name}@${component.version}`, component);
      visitModules(path.join(packageDir, 'node_modules'));
    }
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const directory = path.join(modulesDir, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scoped of fs.readdirSync(directory)) {
          visitPackage(path.join(directory, scoped));
        }
      } else {
        visitPackage(directory);
      }
    }
  }
  visitModules(path.join(consumerDir, 'node_modules'));
  return [...components.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

export function assertSbomCoverage(
  installed: Component[],
  sbom: { bomFormat?: string; components?: Array<Component & { purl: string }> },
): void {
  assert.equal(sbom.bomFormat, 'CycloneDX', 'Expected a CycloneDX SBOM');
  assert(Array.isArray(sbom.components), 'Missing SBOM components');
  const identities = (components: Component[]) =>
    [...new Set(components.map(({ name, version }) => `${name}@${version}`))].sort();
  // npm's display name can be an install alias (e.g. Codex platform binaries).
  // PURLs identify the underlying published package, as its manifest does.
  const canonical = sbom.components.map((component) => {
    assert(typeof component.purl === 'string' && component.purl.startsWith('pkg:npm/'));
    const coordinate = component.purl.slice('pkg:npm/'.length).split(/[?#]/)[0];
    const versionSeparator = coordinate.lastIndexOf('@');
    assert(versionSeparator > 0, `Missing npm PURL version: ${component.purl}`);
    const name = decodeURIComponent(coordinate.slice(0, versionSeparator));
    const version = decodeURIComponent(coordinate.slice(versionSeparator + 1));
    assert.equal(version, component.version, 'SBOM PURL version must match its component');
    return { name, version };
  });
  assert.deepEqual(
    identities(canonical),
    identities(installed),
    'SBOM components must match packages actually installed on disk',
  );
}

export function verifyPackedBrowserInventory(appDir: string): string {
  const contents = fs.readFileSync(path.join(appDir, 'browser-inventory.json'), 'utf8');
  const inventory = JSON.parse(contents);
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.surface, 'app');
  assert(Array.isArray(inventory.assets) && inventory.assets.length > 0);
  const expected = new Set<string>();
  for (const asset of inventory.assets) {
    assert(typeof asset.path === 'string');
    assert(!path.posix.isAbsolute(asset.path) && !path.win32.isAbsolute(asset.path));
    assert(!asset.path.includes('\\') && !asset.path.split('/').includes('..'));
    assert(!expected.has(asset.path), `Duplicate asset: ${asset.path}`);
    expected.add(asset.path);
    const bytes = fs.readFileSync(path.join(appDir, asset.path));
    assert.equal(bytes.length, asset.size, `Packaged asset size: ${asset.path}`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256,
      `Packaged asset hash: ${asset.path}`,
    );
  }
  function files(directory: string, prefix = ''): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = `${prefix}${entry.name}`;
      assert(!entry.isSymbolicLink(), `Unexpected browser asset link: ${relative}`);
      return entry.isDirectory()
        ? files(path.join(directory, entry.name), `${relative}/`)
        : [relative];
    });
  }
  assert.deepEqual(
    files(appDir)
      .filter((file) => file !== 'browser-inventory.json' && !file.endsWith('.map'))
      .sort(),
    [...expected].sort(),
    'Browser inventory must cover all packaged assets',
  );
  return contents;
}

export function writePackedConsumerSbom(
  consumerDir: string,
  tarball: string,
  outputDir: string,
  profile: string,
  npmEnv: NodeJS.ProcessEnv,
): void {
  assert(process.env.npm_execpath, 'Run the artifact test through npm');
  const runNpm = (args: string[]) =>
    execFileSync(process.execPath, [process.env.npm_execpath!, ...args], {
      cwd: consumerDir,
      encoding: 'utf8',
      env: { ...process.env, ...npmEnv },
      maxBuffer: 128 * 1024 * 1024,
    });
  const components = installedComponents(consumerDir);
  assert(
    components.some(({ name }) => name === 'promptfoo'),
    'Missing installed Promptfoo',
  );
  const sbom = JSON.parse(
    runNpm([
      'sbom',
      '--sbom-format=cyclonedx',
      '--package-lock-only=false',
      '--workspaces=false',
      // The consumer install already applied omission policy. Inventory every
      // package that remains on disk, regardless of npm's dependency selectors.
      '--include=dev',
      '--include=optional',
      '--include=peer',
    ]),
  );
  assertSbomCoverage(components, sbom);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'app-browser.json'),
    verifyPackedBrowserInventory(path.join(consumerDir, 'node_modules/promptfoo/dist/src/app')),
  );
  fs.writeFileSync(
    path.join(outputDir, `runtime-${profile}.cdx.json`),
    `${JSON.stringify(sbom, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDir, `runtime-${profile}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        surface: `runtime-${profile}`,
        sourceSha: process.env.GITHUB_SHA ?? null,
        capturedAt: new Date().toISOString(),
        environment: {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          npm: runNpm(['--version']).trim(),
          registry: npmEnv.npm_config_registry,
          installStrategy: process.env.npm_config_install_strategy ?? 'hoisted',
          lifecycleScripts: false,
        },
        artifact: {
          sha512: createHash('sha512').update(fs.readFileSync(tarball)).digest('hex'),
          size: fs.statSync(tarball).size,
        },
        components,
        limitations: [
          'Fresh npm consumer resolution; repository overrides and lockfile are not published.',
          'Platform-specific install, with lifecycle scripts disabled, captured before test fixtures.',
          'Browser bundles, external services, OS packages and optional peer features are separate.',
        ],
      },
      null,
      2,
    )}\n`,
  );
}
