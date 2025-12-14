/**
 * Build script for creating Node.js Single Executable Applications (SEA).
 *
 * ⚠️  EXPERIMENTAL: This script is a work-in-progress. Node.js SEA has
 * limited ESM support, and our codebase uses top-level await which
 * cannot be transpiled to CommonJS. Until Node.js SEA has better ESM
 * support, this script may not work reliably.
 *
 * For now, the recommended distribution methods are:
 * - npm/npx (requires Node.js)
 * - curl install.sh (installs via npm, requires Node.js)
 *
 * This script creates a standalone binary that includes Node.js runtime
 * and the bundled promptfoo CLI.
 *
 * Requirements:
 *   - Node.js 22+ (with improved SEA/ESM support)
 *   - npm run bundle must be run first
 *
 * Usage:
 *   npx tsx scripts/build-sea.ts
 *   npx tsx scripts/build-sea.ts --platform darwin-arm64
 *   npx tsx scripts/build-sea.ts --all-platforms
 *
 * Output:
 *   dist-binary/promptfoo-{version}-{platform}/
 *     - promptfoo (or promptfoo.exe on Windows)
 *     - better_sqlite3.node (native binding)
 *
 * @module scripts/build-sea
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'bundle');
const DIST_BINARY_DIR = path.join(ROOT, 'dist-binary');

// Read package.json for version
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = packageJson.version;

// Better-sqlite3 version from package-lock or node_modules
function getBetterSqlite3Version(): string {
  try {
    const lockfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const pkg = lockfile.packages?.['node_modules/better-sqlite3'];
    if (pkg?.version) {
      return pkg.version;
    }
  } catch {
    // Fallback to node_modules
  }

  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules/better-sqlite3/package.json'), 'utf8')
    );
    return pkg.version;
  } catch {
    throw new Error('Could not determine better-sqlite3 version');
  }
}

/**
 * Platform configurations for SEA builds.
 */
interface PlatformConfig {
  os: 'darwin' | 'linux' | 'win32';
  arch: 'x64' | 'arm64';
  nodeArch: string;
  extension: string;
  prebuildPlatform: string;
  prebuildArch: string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  'darwin-x64': {
    os: 'darwin',
    arch: 'x64',
    nodeArch: 'x64',
    extension: '',
    prebuildPlatform: 'darwin',
    prebuildArch: 'x64',
  },
  'darwin-arm64': {
    os: 'darwin',
    arch: 'arm64',
    nodeArch: 'arm64',
    extension: '',
    prebuildPlatform: 'darwin',
    prebuildArch: 'arm64',
  },
  'linux-x64': {
    os: 'linux',
    arch: 'x64',
    nodeArch: 'x64',
    extension: '',
    prebuildPlatform: 'linux',
    prebuildArch: 'x64',
  },
  'linux-arm64': {
    os: 'linux',
    arch: 'arm64',
    nodeArch: 'arm64',
    extension: '',
    prebuildPlatform: 'linux',
    prebuildArch: 'arm64',
  },
  'win32-x64': {
    os: 'win32',
    arch: 'x64',
    nodeArch: 'x64',
    extension: '.exe',
    prebuildPlatform: 'win32',
    prebuildArch: 'x64',
  },
  'win32-arm64': {
    os: 'win32',
    arch: 'arm64',
    nodeArch: 'arm64',
    extension: '.exe',
    prebuildPlatform: 'win32',
    prebuildArch: 'arm64',
  },
};

/**
 * Download a file from a URL.
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Download prebuild native binary for better-sqlite3.
 */
async function downloadPrebuild(
  platform: PlatformConfig,
  outputDir: string,
  betterSqlite3Version: string
): Promise<void> {
  // Determine the prebuild filename and URL
  // better-sqlite3 uses prebuild-install format:
  // https://github.com/WiseLibs/better-sqlite3/releases/download/v{version}/better-sqlite3-v{version}-node-v{nodeVersion}-{platform}-{arch}.tar.gz

  // Node.js 20 uses N-API version, so we need to use napi builds
  // Format: better-sqlite3-v{version}-napi-v{napiVersion}-{platform}-{arch}.tar.gz

  const napiVersion = 6; // Node.js 20 supports N-API v6+
  const tarName = `better-sqlite3-v${betterSqlite3Version}-napi-v${napiVersion}-${platform.prebuildPlatform}-${platform.prebuildArch}.tar.gz`;
  const downloadUrl = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${betterSqlite3Version}/${tarName}`;

  console.log(`  Downloading prebuild from: ${downloadUrl}`);

  const tempTar = path.join(outputDir, tarName);

  try {
    await downloadFile(downloadUrl, tempTar);

    // Extract the .node file
    execSync(`tar -xzf "${tempTar}" -C "${outputDir}"`, { stdio: 'inherit' });

    // The extracted file is in build/Release/better_sqlite3.node
    const extractedNode = path.join(outputDir, 'build', 'Release', 'better_sqlite3.node');
    const destNode = path.join(outputDir, 'better_sqlite3.node');

    if (fs.existsSync(extractedNode)) {
      fs.copyFileSync(extractedNode, destNode);
      // Clean up extracted directory
      fs.rmSync(path.join(outputDir, 'build'), { recursive: true, force: true });
    }

    // Clean up tar
    fs.unlinkSync(tempTar);

    console.log(`  ✓ Downloaded better_sqlite3.node for ${platform.prebuildPlatform}-${platform.prebuildArch}`);
  } catch (error) {
    console.error(`  ✗ Failed to download prebuild: ${error}`);
    throw error;
  }
}

/**
 * Create SEA config file.
 * Node.js 22+ supports ESM modules directly via the moduleType option.
 */
function createSeaConfig(outputDir: string): string {
  const bundlePath = path.join(BUNDLE_DIR, 'promptfoo.mjs');

  const config = {
    main: bundlePath,
    output: path.join(outputDir, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  };

  const configPath = path.join(outputDir, 'sea-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Build SEA for a specific platform.
 */
async function buildForPlatform(platformName: string): Promise<void> {
  const platform = PLATFORMS[platformName];
  if (!platform) {
    throw new Error(`Unknown platform: ${platformName}`);
  }

  console.log(`\n[sea] Building for ${platformName}...`);

  const outputDir = path.join(DIST_BINARY_DIR, `promptfoo-${VERSION}-${platformName}`);

  // Clean and create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Check if we're building for the current platform
  const currentPlatform = `${process.platform}-${process.arch}`;
  const isNativeBuild = currentPlatform === platformName;

  if (!isNativeBuild) {
    console.log(`  Cross-compilation not yet supported. Skipping ${platformName}.`);
    console.log(`  (Current platform: ${currentPlatform})`);
    // For cross-compilation, we'd need to download the Node.js binary for the target platform
    // and inject the blob into it. This is complex and requires platform-specific tools.
    return;
  }

  // 1. Create SEA config
  console.log('  Creating SEA config...');
  const configPath = createSeaConfig(outputDir);

  // 2. Generate SEA blob
  console.log('  Generating SEA blob...');
  const blobPath = path.join(outputDir, 'sea-prep.blob');
  execSync(`node --experimental-sea-config "${configPath}"`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // 3. Copy node executable
  console.log('  Copying Node.js executable...');
  const nodeExe = process.execPath;
  const outputExe = path.join(outputDir, `promptfoo${platform.extension}`);
  fs.copyFileSync(nodeExe, outputExe);

  // 4. Remove signature (macOS) or make writable
  if (platform.os === 'darwin') {
    console.log('  Removing code signature...');
    try {
      execSync(`codesign --remove-signature "${outputExe}"`, { stdio: 'inherit' });
    } catch {
      console.log('  (No signature to remove)');
    }
  } else if (platform.os === 'win32') {
    // signtool would be needed here for Windows
  }

  // 5. Inject the blob
  console.log('  Injecting SEA blob...');
  if (platform.os === 'darwin') {
    // Use postject for macOS
    execSync(
      `npx postject "${outputExe}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  } else if (platform.os === 'linux') {
    execSync(
      `npx postject "${outputExe}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  } else if (platform.os === 'win32') {
    execSync(
      `npx postject "${outputExe}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  }

  // 6. Re-sign (macOS)
  if (platform.os === 'darwin') {
    console.log('  Re-signing executable...');
    execSync(`codesign --sign - "${outputExe}"`, { stdio: 'inherit' });
  }

  // 7. Download better-sqlite3 prebuild
  console.log('  Downloading native modules...');
  const betterSqlite3Version = getBetterSqlite3Version();
  await downloadPrebuild(platform, outputDir, betterSqlite3Version);

  // 8. Copy assets
  console.log('  Copying assets...');
  const assetsSource = path.join(BUNDLE_DIR, 'assets');
  const assetsDest = path.join(outputDir, 'assets');
  if (fs.existsSync(assetsSource)) {
    fs.cpSync(assetsSource, assetsDest, { recursive: true });
  }

  // 9. Create pf symlink/copy
  const pfExe = path.join(outputDir, `pf${platform.extension}`);
  if (platform.os === 'win32') {
    fs.copyFileSync(outputExe, pfExe);
  } else {
    fs.symlinkSync(`promptfoo${platform.extension}`, pfExe);
  }

  // 10. Clean up intermediate files
  fs.unlinkSync(configPath);
  fs.unlinkSync(blobPath);

  // Get final size
  const stats = fs.statSync(outputExe);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`  ✓ Built ${outputExe} (${sizeMB} MB)`);
}

/**
 * Create distribution archives.
 */
function createArchives(): void {
  console.log('\n[sea] Creating distribution archives...');

  const distDirs = fs.readdirSync(DIST_BINARY_DIR).filter((name) => name.startsWith('promptfoo-'));

  for (const dir of distDirs) {
    const fullPath = path.join(DIST_BINARY_DIR, dir);
    if (!fs.statSync(fullPath).isDirectory()) {
      continue;
    }

    const isWindows = dir.includes('win32');
    const archiveName = isWindows ? `${dir}.zip` : `${dir}.tar.gz`;
    const archivePath = path.join(DIST_BINARY_DIR, archiveName);

    console.log(`  Creating ${archiveName}...`);

    if (isWindows) {
      // Use zip for Windows
      execSync(`cd "${DIST_BINARY_DIR}" && zip -r "${archiveName}" "${dir}"`, { stdio: 'inherit' });
    } else {
      // Use tar.gz for Unix
      execSync(`cd "${DIST_BINARY_DIR}" && tar -czf "${archiveName}" "${dir}"`, { stdio: 'inherit' });
    }

    const stats = fs.statSync(archivePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ Created ${archiveName} (${sizeMB} MB)`);
  }
}

/**
 * Parse command line arguments.
 */
function parseArgs(): { platform?: string; allPlatforms: boolean; createArchives: boolean } {
  const args = process.argv.slice(2);
  let platform: string | undefined;
  let allPlatforms = false;
  let createArchivesFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--platform' && args[i + 1]) {
      platform = args[++i];
    } else if (arg === '--all-platforms') {
      allPlatforms = true;
    } else if (arg === '--create-archives') {
      createArchivesFlag = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx tsx scripts/build-sea.ts [options]

Options:
  --platform PLATFORM   Build for specific platform (e.g., darwin-arm64)
  --all-platforms       Build for all supported platforms
  --create-archives     Create .tar.gz/.zip archives after building
  --help, -h            Show this help message

Supported platforms:
  ${Object.keys(PLATFORMS).join(', ')}

Examples:
  npx tsx scripts/build-sea.ts                           # Build for current platform
  npx tsx scripts/build-sea.ts --platform darwin-arm64   # Build for macOS ARM
  npx tsx scripts/build-sea.ts --all-platforms           # Build for all platforms
`);
      process.exit(0);
    }
  }

  return { platform, allPlatforms, createArchives: createArchivesFlag };
}

/**
 * Main build function.
 */
async function main(): Promise<void> {
  console.log('[sea] Node.js Single Executable Application Builder');
  console.log(`[sea] Version: ${VERSION}`);

  // Check prerequisites
  if (!fs.existsSync(path.join(BUNDLE_DIR, 'promptfoo.mjs'))) {
    console.error('[sea] Error: Bundle not found. Run "npm run bundle" first.');
    process.exit(1);
  }

  // Check Node.js version
  const nodeVersion = process.version.replace('v', '').split('.').map(Number);
  if (nodeVersion[0] < 20) {
    console.error('[sea] Error: Node.js 20+ is required for SEA support.');
    process.exit(1);
  }

  // Parse arguments
  const { platform, allPlatforms, createArchives: shouldCreateArchives } = parseArgs();

  // Create output directory
  if (!fs.existsSync(DIST_BINARY_DIR)) {
    fs.mkdirSync(DIST_BINARY_DIR, { recursive: true });
  }

  // Build
  if (allPlatforms) {
    // Build for all platforms (note: cross-compilation is limited)
    for (const platformName of Object.keys(PLATFORMS)) {
      try {
        await buildForPlatform(platformName);
      } catch (error) {
        console.error(`[sea] Failed to build for ${platformName}:`, error);
      }
    }
  } else if (platform) {
    await buildForPlatform(platform);
  } else {
    // Build for current platform
    const currentPlatform = `${process.platform}-${process.arch}`;
    if (PLATFORMS[currentPlatform]) {
      await buildForPlatform(currentPlatform);
    } else {
      console.error(`[sea] Error: Unsupported platform: ${currentPlatform}`);
      process.exit(1);
    }
  }

  // Create archives if requested
  if (shouldCreateArchives) {
    createArchives();
  }

  console.log('\n[sea] Build complete!');
  console.log(`[sea] Output directory: ${DIST_BINARY_DIR}`);
}

main().catch((error) => {
  console.error('[sea] Fatal error:', error);
  process.exit(1);
});
