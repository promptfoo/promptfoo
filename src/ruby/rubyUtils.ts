import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { getEnvString } from '../envars';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';

const execFileAsync = promisify(execFile);

export const state: {
  cachedRubyPath: string | null;
  validationPromise: Promise<string> | null;
} = {
  cachedRubyPath: null,
  validationPromise: null,
};

/**
 * Search for a Ruby executable on Windows using the `where` command and return the first validated `.exe` path.
 *
 * @returns The validated Ruby executable path if found, `null` otherwise.
 */
async function tryWindowsWhere(): Promise<string | null> {
  try {
    const result = await execFileAsync('where', ['ruby']);
    const output = result.stdout.trim();

    // Handle empty output
    if (!output) {
      logger.debug("Windows 'where ruby' returned empty output");
      return null;
    }

    const paths = output.split('\n').filter((path) => path.trim());

    for (const rubyPath of paths) {
      const trimmedPath = rubyPath.trim();

      // Skip non-executables
      if (!trimmedPath.endsWith('.exe')) {
        continue;
      }

      const validated = await tryPath(trimmedPath);
      if (validated) {
        return validated;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`Windows 'where ruby' failed: ${errorMsg}`);

    // Log permission/access errors differently
    if (errorMsg.includes('Access is denied') || errorMsg.includes('EACCES')) {
      logger.warn(`Permission denied when searching for Ruby: ${errorMsg}`);
    }
  }

  return null;
}

/**
 * Probe a list of Ruby command names to discover the Ruby interpreter path.
 *
 * @param commands - Candidate Ruby command names to try (for example `"ruby"` or platform-specific variants)
 * @returns The discovered Ruby executable path, or `null` if none of the commands produced a valid path
 */
async function tryRubyCommands(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const result = await execFileAsync(cmd, ['-e', 'puts RbConfig.ruby']);
      const executablePath = result.stdout.trim();
      if (executablePath && executablePath !== 'None') {
        return executablePath;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Ruby command "${cmd}" failed: ${errorMsg}`);

      // Log permission/access errors differently
      if (
        errorMsg.includes('Access is denied') ||
        errorMsg.includes('EACCES') ||
        errorMsg.includes('EPERM')
      ) {
        logger.warn(`Permission denied when trying Ruby command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Attempt to validate each provided command as a Ruby executable and return the first valid path.
 *
 * @param commands - Candidate command names or paths to test as Ruby executables
 * @returns The first command path that validates as Ruby, or `null` if none do
 */
async function tryDirectCommands(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const validated = await tryPath(cmd);
      if (validated) {
        return validated;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Direct command "${cmd}" failed: ${errorMsg}`);

      // Log permission/access errors differently
      if (
        errorMsg.includes('Access is denied') ||
        errorMsg.includes('EACCES') ||
        errorMsg.includes('EPERM')
      ) {
        logger.warn(`Permission denied when trying Ruby command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Locate the Ruby executable on the current system using platform-specific detection.
 *
 * @returns The absolute path to the Ruby executable if found, `null` otherwise.
 */
export async function getSysExecutable(): Promise<string | null> {
  if (process.platform === 'win32') {
    // Windows: Try 'where ruby' first
    const whereResult = await tryWindowsWhere();
    if (whereResult) {
      return whereResult;
    }

    // Then try ruby commands
    const sysResult = await tryRubyCommands(['ruby']);
    if (sysResult) {
      return sysResult;
    }

    // Final fallback to direct ruby command
    return await tryDirectCommands(['ruby']);
  } else {
    // Unix: Standard ruby detection
    return await tryRubyCommands(['ruby']);
  }
}

/**
 * Attempts to validate a Ruby executable path.
 * @param path - The path to the Ruby executable to test.
 * @returns The validated path if successful, or null if invalid.
 */
export async function tryPath(path: string): Promise<string | null> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Command timed out')), 2500);
    });

    const result = await Promise.race([execFileAsync(path, ['--version']), timeoutPromise]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const versionOutput = (result as { stdout: string }).stdout.trim();
    if (versionOutput.toLowerCase().includes('ruby')) {
      return path;
    }
    return null;
  } catch {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return null;
  }
}

/**
 * Validates and caches the Ruby executable path.
 *
 * @param rubyPath - Path to the Ruby executable.
 * @param isExplicit - If true, only tries the provided path.
 * @returns Validated Ruby executable path.
 * @throws {Error} If no valid Ruby executable is found.
 */
export async function validateRubyPath(rubyPath: string, isExplicit: boolean): Promise<string> {
  // Return cached result if available
  if (state.cachedRubyPath) {
    return state.cachedRubyPath;
  }

  // Create validation promise atomically if it doesn't exist
  // This prevents race conditions where multiple calls create separate validations
  if (!state.validationPromise) {
    state.validationPromise = (async () => {
      try {
        const primaryPath = await tryPath(rubyPath);
        if (primaryPath) {
          state.cachedRubyPath = primaryPath;
          state.validationPromise = null;
          return primaryPath;
        }

        if (isExplicit) {
          const error = new Error(
            `Ruby not found. Tried "${rubyPath}" ` +
              `Please ensure Ruby is installed and set the PROMPTFOO_RUBY environment variable ` +
              `to your Ruby executable path (e.g., '${process.platform === 'win32' ? 'C:\\Ruby32\\bin\\ruby.exe' : '/usr/bin/ruby'}').`,
          );
          // Clear promise on error to allow retry
          state.validationPromise = null;
          throw error;
        }

        // Try to get Ruby executable using comprehensive detection
        const detectedPath = await getSysExecutable();
        if (detectedPath) {
          state.cachedRubyPath = detectedPath;
          state.validationPromise = null;
          return detectedPath;
        }

        const error = new Error(
          `Ruby not found. Tried "${rubyPath}", ruby executable detection, and fallback commands. ` +
            `Please ensure Ruby is installed and set the PROMPTFOO_RUBY environment variable ` +
            `to your Ruby executable path (e.g., '${process.platform === 'win32' ? 'C:\\Ruby32\\bin\\ruby.exe' : '/usr/bin/ruby'}').`,
        );
        // Clear promise on error to allow retry
        state.validationPromise = null;
        throw error;
      } catch (error) {
        // Ensure promise is cleared on any error
        state.validationPromise = null;
        throw error;
      }
    })();
  }

  // Return the existing or newly-created promise
  return state.validationPromise;
}

/**
 * Execute a Ruby script's specified method with provided arguments and return its result.
 *
 * Writes the arguments to a temporary JSON file, invokes a Ruby wrapper to call the target
 * script/method, reads and parses the wrapper's JSON output, and returns the `data` from a
 * `{ type: 'final_result', data: ... }` response.
 *
 * @param scriptPath - Path to the Ruby script to invoke
 * @param method - Method name to call inside the Ruby script
 * @param args - Arguments to pass to the method; values are serialized to JSON
 * @param options - Optional runtime settings
 * @param options.rubyExecutable - Explicit path to the Ruby executable to use (falls back to env or system lookup if omitted)
 * @returns The `data` value produced by the Ruby script's `final_result` response
 * @throws An error if the Ruby executable cannot be validated, the subprocess fails, the wrapper output is not valid JSON, or the parsed result is not a `final_result`
 */
export async function runRuby(
  scriptPath: string,
  method: string,
  args: (string | number | object | undefined)[],
  options: { rubyExecutable?: string } = {},
): Promise<any> {
  const absPath = path.resolve(scriptPath);
  const tempJsonPath = path.join(
    os.tmpdir(),
    `promptfoo-ruby-input-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `promptfoo-ruby-output-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const customPath = options.rubyExecutable || getEnvString('PROMPTFOO_RUBY');
  let rubyPath = customPath || 'ruby';

  rubyPath = await validateRubyPath(rubyPath, typeof customPath === 'string');

  const wrapperPath = path.join(__dirname, 'wrapper.rb');

  try {
    fs.writeFileSync(tempJsonPath, safeJsonStringify(args) as string, 'utf-8');
    logger.debug(`Running Ruby wrapper with args: ${safeJsonStringify(args)}`);

    const { stdout, stderr } = await execFileAsync(rubyPath, [
      wrapperPath,
      absPath,
      method,
      tempJsonPath,
      outputPath,
    ]);

    if (stdout) {
      logger.debug(stdout.trim());
    }

    if (stderr) {
      logger.error(stderr.trim());
    }

    const output = fs.readFileSync(outputPath, 'utf-8');
    logger.debug(`Ruby script ${absPath} returned: ${output}`);

    let result: { type: 'final_result'; data: any } | undefined;
    try {
      result = JSON.parse(output);
      logger.debug(
        `Ruby script ${absPath} parsed output type: ${typeof result}, structure: ${result ? JSON.stringify(Object.keys(result)) : 'undefined'}`,
      );
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${(error as Error).message} when parsing result: ${
          output
        }\nStack Trace: ${(error as Error).stack}`,
      );
    }
    if (result?.type !== 'final_result') {
      throw new Error('The Ruby script `call_api` function must return a hash with an `output`');
    }

    return result.data;
  } catch (error) {
    logger.error(
      `Error running Ruby script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack || 'No Ruby traceback available'
      }`,
    );
    throw new Error(
      `Error running Ruby script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack || 'No Ruby traceback available'
      }`,
    );
  } finally {
    [tempJsonPath, outputPath].forEach((file) => {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        logger.error(`Error removing ${file}: ${error}`);
      }
    });
  }
}