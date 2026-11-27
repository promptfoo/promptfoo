import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*!
 * The .env parser below is adapted from dotenv (BSD-2-Clause).
 * Copyright (c) 2015, Scott Motte
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// Keep the existing grammar: Node's parseEnv differs on escaped quotes, colon
// assignments, carriage returns, and BOMs. Normalizing those requires parsing too.
function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = contents.replace(/\r\n?/gm, '\n');
  const pattern =
    /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

  for (const match of lines.matchAll(pattern)) {
    let value = (match[2] || '').trim();
    const quote = value[0];
    value = value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');
    if (quote === '"') {
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }
    parsed[match[1]] = value;
  }

  return parsed;
}

interface LoadEnvOptions {
  override?: boolean;
  processEnv?: NodeJS.ProcessEnv;
}

/**
 * Load plain .env files without importing application state or logging. Safe to
 * call during initialization and from the repository's CommonJS scripts.
 * Explicit-path existence checks belong to setupEnv; reads remain best effort.
 */
export function loadEnvFiles(paths?: string[], options: LoadEnvOptions = {}): void {
  // Explicit options win; an empty modern default must not fall through to its legacy alias.
  const configuredPath = process.env.DOTENV_PATH ?? process.env.DOTENV_CONFIG_PATH;
  const encoding = (process.env.DOTENV_ENCODING ?? process.env.DOTENV_CONFIG_ENCODING) || 'utf8';
  const configuredOverride = process.env.DOTENV_OVERRIDE ?? process.env.DOTENV_CONFIG_OVERRIDE;
  const override = Object.prototype.hasOwnProperty.call(options, 'override')
    ? Boolean(options.override)
    : configuredOverride !== undefined &&
      !['false', '0', 'no', 'off', ''].includes(configuredOverride.toLowerCase());
  const files = paths ?? [configuredPath || path.resolve(process.cwd(), '.env')];
  const parsed: Record<string, string> = {};
  for (const file of files) {
    try {
      const resolved = file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : file;
      const values = parseEnvFile(fs.readFileSync(resolved, encoding as BufferEncoding));
      for (const key of Object.keys(values)) {
        if (override || !Object.prototype.hasOwnProperty.call(parsed, key)) {
          parsed[key] = values[key];
        }
      }
    } catch {
      // As before, absent/unreadable defaults are optional and an unreadable file
      // does not prevent the remaining files from loading.
    }
  }

  const destination = options.processEnv ?? process.env;
  for (const key of Object.keys(parsed)) {
    if (override || !Object.prototype.hasOwnProperty.call(destination, key)) {
      destination[key] = parsed[key];
    }
  }
}
