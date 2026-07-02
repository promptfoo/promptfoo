import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import semver from 'semver';

const CODEX_SDK_PACKAGE_NAME = '@openai/codex-sdk';
const CODEX_CLI_PACKAGE_NAME = '@openai/codex';
const CODEX_VERSION_TIMEOUT_MS = 60_000;
const CODEX_EVENT_SCHEMA_TIMEOUT_MS = 10_000;
const CODEX_VERSION_PATTERN =
  /\bcodex-cli(?:-exec)?\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const EVENT_SCHEMA_CANARY_OUTPUT = 'before\u2028between\u2029after';
const EVENT_SCHEMA_CANARY_RESPONSE = 'codex-sdk-event-schema-compatible';
const EVENT_SCHEMA_CANARY_SOURCE = `
const events = [
  { type: 'thread.started', thread_id: 'promptfoo-compatibility-preflight' },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: {
      id: 'compatibility-command',
      type: 'command_execution',
      command: 'compatibility-preflight',
      aggregated_output: 'before\\u2028between\\u2029after',
      exit_code: 0,
      status: 'completed',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'compatibility-message',
      type: 'agent_message',
      text: '${EVENT_SCHEMA_CANARY_RESPONSE}',
    },
  },
  {
    type: 'turn.completed',
    usage: {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    },
  },
];
const payload = events.map((event) => JSON.stringify(event)).join('\\n') + '\\n';
require('node:fs').writeSync(1, payload);
process.exit(0);
`;

interface PackageManifest {
  name?: unknown;
  version?: unknown;
  dependencies?: Record<string, unknown>;
  bin?: string | Record<string, string>;
}

interface CodexCliInvocation {
  command: string;
  args: string[];
  displayPath: string;
}

export interface CodexCliCompatibilityResult {
  sdkVersion: string;
  supportedCliVersion: string;
  selectedCliVersion: string;
  selectedCliPath: string;
}

export interface CodexCliCompatibilityOptions {
  sdkEntryPoint: string;
  sdkModule: any;
  codexPathOverride?: string;
  env: Record<string, string>;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function readJsonFile(filePath: string): PackageManifest {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${filePath}: ${message}`);
  }

  try {
    return JSON.parse(contents) as PackageManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }
}

function findPackageManifest(entryPoint: string, packageName: string): string {
  if (!path.isAbsolute(entryPoint)) {
    throw new Error(`Resolved ${packageName} entry point is not an absolute path: ${entryPoint}`);
  }

  let currentDirectory = path.dirname(entryPoint);
  while (true) {
    const candidate = path.join(currentDirectory, 'package.json');
    if (fs.existsSync(candidate)) {
      const manifest = readJsonFile(candidate);
      if (manifest.name === packageName) {
        return candidate;
      }
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }

  throw new Error(`Could not locate the ${packageName} manifest for ${entryPoint}`);
}

function getExactVersion(value: unknown, description: string): string {
  if (typeof value !== 'string' || !semver.valid(value)) {
    throw new Error(`${description} must be an exact semantic version, received ${String(value)}`);
  }
  return value;
}

function getBundledCliInvocation(
  sdkManifestPath: string,
  supportedCliVersion: string,
): CodexCliInvocation {
  let cliManifestPath: string;
  try {
    cliManifestPath = createRequire(sdkManifestPath).resolve(
      `${CODEX_CLI_PACKAGE_NAME}/package.json`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not resolve the Codex CLI bundled with the SDK from ${sdkManifestPath}: ${message}`,
    );
  }

  const cliManifest = readJsonFile(cliManifestPath);
  const installedCliVersion = getExactVersion(
    cliManifest.version,
    `Installed ${CODEX_CLI_PACKAGE_NAME} version`,
  );
  if (!semver.eq(installedCliVersion, supportedCliVersion)) {
    throw new Error(
      `The SDK declares Codex CLI ${supportedCliVersion}, but its bundled CLI package is ${installedCliVersion}`,
    );
  }

  const bin = typeof cliManifest.bin === 'string' ? cliManifest.bin : cliManifest.bin?.codex;
  if (!bin) {
    throw new Error(
      `The bundled ${CODEX_CLI_PACKAGE_NAME} package does not declare a codex binary`,
    );
  }

  const cliPath = path.resolve(path.dirname(cliManifestPath), bin);
  if (!fs.existsSync(cliPath)) {
    throw new Error(`The bundled Codex CLI entry point does not exist: ${cliPath}`);
  }

  // The npm package exposes a JavaScript launcher. Invoke it with the current Node runtime so
  // this check works on Windows as well as Unix; the launcher selects the same native binary
  // that the SDK resolves internally.
  return {
    command: process.execPath,
    args: [cliPath],
    displayPath: cliPath,
  };
}

function runVersionProbe(
  invocation: CodexCliInvocation,
  env: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const args = [...invocation.args, 'exec', '--experimental-json', '--version'];

  return new Promise((resolve, reject) => {
    execFile(
      invocation.command,
      args,
      {
        encoding: 'utf8',
        env,
        signal,
        timeout: CODEX_VERSION_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          if (isAbortError(error)) {
            reject(error);
            return;
          }
          const detail = [error.message, stdout, stderr]
            .filter(
              (value): value is string => typeof value === 'string' && value.trim().length > 0,
            )
            .join('\n')
            .trim();
          reject(
            new Error(
              `Codex CLI JSON event mode probe failed for ${invocation.displayPath}${detail ? `: ${detail}` : ''}`,
            ),
          );
          return;
        }

        const output = `${stdout ?? ''}\n${stderr ?? ''}`;
        const match = CODEX_VERSION_PATTERN.exec(output);
        if (!match) {
          reject(
            new Error(
              `Codex CLI JSON event mode probe returned an unrecognized version for ${invocation.displayPath}: ${output.trim() || '(empty output)'}`,
            ),
          );
          return;
        }

        const version = semver.valid(match[1]);
        if (!version) {
          reject(
            new Error(
              `Codex CLI JSON event mode probe returned an invalid semantic version for ${invocation.displayPath}: ${match[1]}`,
            ),
          );
          return;
        }

        resolve(version);
      },
    );
  });
}

async function runEventSchemaProbe(sdkModule: any, signal?: AbortSignal): Promise<void> {
  if (typeof sdkModule?.Codex !== 'function') {
    throw new Error('Loaded Codex SDK does not export a Codex constructor');
  }

  const probeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-sdk-preflight-'));
  const preloadPath = path.join(probeDirectory, 'emit-events.cjs');
  fs.writeFileSync(preloadPath, EVENT_SCHEMA_CANARY_SOURCE, 'utf8');
  let codex: any;

  try {
    // NODE_OPTIONS makes the current Node executable act as a zero-token fake Codex CLI. This
    // drives representative JSONL through the SDK's real child-process framing and parser on the
    // active Node runtime without contacting an API.
    codex = new sdkModule.Codex({
      codexPathOverride: process.execPath,
      env: {
        NODE_OPTIONS: `--require ${JSON.stringify(preloadPath)}`,
      },
    });
    const thread = codex.startThread({
      workingDirectory: probeDirectory,
      skipGitRepoCheck: true,
    });
    const timeoutSignal = AbortSignal.timeout(CODEX_EVENT_SCHEMA_TIMEOUT_MS);
    const probeSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const result = await thread.run('compatibility-preflight', { signal: probeSignal });
    const commandItem = result?.items?.find(
      (item: any) => item?.type === 'command_execution' && item?.id === 'compatibility-command',
    );

    if (
      result?.finalResponse !== EVENT_SCHEMA_CANARY_RESPONSE ||
      commandItem?.aggregated_output !== EVENT_SCHEMA_CANARY_OUTPUT
    ) {
      throw new Error(
        'SDK returned an unexpected result for the representative JSONL event stream',
      );
    }
  } finally {
    try {
      if (typeof codex?.destroy === 'function') {
        await codex.destroy();
      } else if (typeof codex?.cleanup === 'function') {
        await codex.cleanup();
      } else if (typeof codex?.close === 'function') {
        await codex.close();
      }
    } finally {
      fs.rmSync(probeDirectory, { recursive: true, force: true });
    }
  }
}

/**
 * Verify the selected Codex CLI against the exact CLI release declared by the loaded SDK.
 *
 * The TypeScript SDK does not expose a separate exec-JSONL schema version. Its exact
 * `@openai/codex` dependency is therefore the only machine-readable compatibility contract for
 * both the CLI release and its event schema. The version probe also exercises the SDK's
 * `exec --experimental-json` invocation surface without starting a turn or making an API call.
 */
export async function preflightCodexSdkCliCompatibility(
  options: CodexCliCompatibilityOptions,
): Promise<CodexCliCompatibilityResult> {
  let sdkManifestPath: string;
  let sdkManifest: PackageManifest;
  try {
    sdkManifestPath = findPackageManifest(options.sdkEntryPoint, CODEX_SDK_PACKAGE_NAME);
    sdkManifest = readJsonFile(sdkManifestPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex SDK/CLI compatibility preflight failed: ${message}`);
  }

  let sdkVersion: string;
  let supportedCliVersion: string;
  try {
    sdkVersion = getExactVersion(
      sdkManifest.version,
      `Installed ${CODEX_SDK_PACKAGE_NAME} version`,
    );
    supportedCliVersion = getExactVersion(
      sdkManifest.dependencies?.[CODEX_CLI_PACKAGE_NAME],
      `${CODEX_SDK_PACKAGE_NAME} dependency on ${CODEX_CLI_PACKAGE_NAME}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex SDK/CLI compatibility preflight failed: ${message}`);
  }

  let invocation: CodexCliInvocation;
  try {
    invocation = options.codexPathOverride
      ? {
          command: options.codexPathOverride,
          args: [],
          displayPath: options.codexPathOverride,
        }
      : getBundledCliInvocation(sdkManifestPath, supportedCliVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex SDK/CLI compatibility preflight failed: ${message}`);
  }

  let selectedCliVersion: string;
  try {
    selectedCliVersion = await runVersionProbe(invocation, options.env, options.signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Codex SDK/CLI compatibility preflight failed for SDK ${sdkVersion}: ${message}. ` +
        'No Codex turn was started.',
    );
  }

  if (!semver.eq(selectedCliVersion, supportedCliVersion)) {
    const overrideGuidance = options.codexPathOverride
      ? 'Remove codex_path_override to use the SDK-bundled CLI, or install an SDK that matches the selected CLI.'
      : 'Reinstall @openai/codex-sdk so its bundled CLI matches the declared dependency.';
    throw new Error(
      `Codex SDK/CLI compatibility preflight failed: ${CODEX_SDK_PACKAGE_NAME} ${sdkVersion} ` +
        `supports Codex CLI/event schema ${supportedCliVersion}, but ${invocation.displayPath} reports ` +
        `${selectedCliVersion}. ${overrideGuidance} No Codex turn was started.`,
    );
  }

  try {
    await runEventSchemaProbe(options.sdkModule, options.signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const detail = message.startsWith('Failed to parse item:')
      ? 'valid command output containing U+2028/U+2029 was split or rejected'
      : message;
    throw new Error(
      `Codex SDK/CLI compatibility preflight failed: ${CODEX_SDK_PACKAGE_NAME} ${sdkVersion} ` +
        `cannot parse the supported CLI event schema on Node ${process.version}: ${detail}. ` +
        'Use a compatible Node runtime or SDK release. No Codex API request was made.',
    );
  }

  return {
    sdkVersion,
    supportedCliVersion,
    selectedCliVersion,
    selectedCliPath: invocation.displayPath,
  };
}
