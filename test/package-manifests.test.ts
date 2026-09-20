import fs from 'node:fs';
import path from 'node:path';

import { minVersion, satisfies, subset, validRange } from 'semver';
import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers, getPackageName } from '../scripts/architectureUtils';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type PackageLockManifest<T = PackageManifest & { version?: string; optional?: boolean }> = {
  packages: Record<string, T>;
};

function readPackageJson<T>(relativePath: string): T {
  const packageJsonPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as T;
}

type DockerShellWord = {
  raw: string;
  value: string;
  dynamic: boolean;
  substitution: boolean;
  shellSyntax: boolean;
};
type DockerAuditContext = { hasStages: boolean; workdir: string | null | undefined };
const DEFAULT_DOCKER_AUDIT_CONTEXT: DockerAuditContext = { hasStages: false, workdir: undefined };

function readDockerShellWord(raw: string): DockerShellWord {
  let quote = '';
  let value = '';
  let dynamic = false;
  let substitution = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '\\' && quote !== "'") {
      if (!quote || /[$`"\\]/.test(raw[i + 1] ?? '')) {
        value += raw[++i] ?? '';
        continue;
      }
    } else if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    } else if (quote !== "'" && (char === '$' || char === '`')) {
      dynamic = true;
      substitution ||= char === '`' || raw[i + 1] === '(';
    } else if (!quote && /^(?:[*?]|\[.*?\])/.test(raw.slice(i))) {
      dynamic = true;
    } else if (!quote && char === '<' && raw[i + 1] === '<') {
      throw new Error('Docker RUN heredocs need an explicit npm policy audit');
    }
    value += char;
  }
  expect(quote, `Unbalanced Docker RUN word: ${raw}`).toBe('');
  return { raw, value, dynamic, substitution, shellSyntax: true };
}

function dockerShellEscapesNext(input: string, index: number, quote: string): boolean {
  return (
    input[index] === '\\' && (!quote || (quote === '"' && /[$`"\\]/.test(input[index + 1] ?? '')))
  );
}

function findDockerQuotedSubstitutionEnd(input: string, start: number): number {
  let quote = '';
  for (let i = start; i < input.length; i++) {
    const char = input[i];
    if (dockerShellEscapesNext(input, i, quote)) {
      i++;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
    } else if (
      (quote !== "'" && (char === '`' || (char === '$' && input[i + 1] === '('))) ||
      (!quote && (char === '(' || char === '#'))
    ) {
      throw new Error(`Unsupported nested Docker RUN command substitution: ${input}`);
    } else if (!quote && char === ')') {
      return i;
    }
  }
  throw new Error(`Unbalanced Docker RUN command substitution: ${input}`);
}

function assertDockerShellSubstitutions(input: string, context: DockerAuditContext): void {
  let quote = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (dockerShellEscapesNext(input, i, quote)) {
      i++;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    }
    if (!quote && char === '#' && (i === 0 || /[\s;&|()]/.test(input[i - 1]))) {
      while (i < input.length && input[i] !== '\n') {
        i++;
      }
      continue;
    }
    if (quote === "'") {
      continue;
    }
    // The command splitter cannot retain unquoted or nested substitutions as words. Fail
    // closed before it loses their position; simple double-quoted arguments remain auditable.
    if (char === '`' || (char === '$' && input[i + 1] === '(' && quote !== '"')) {
      throw new Error(`Unsupported Docker RUN command substitution: ${input}`);
    }
    if (char === '$' && input[i + 1] === '(') {
      const end = findDockerQuotedSubstitutionEnd(input, i + 2);
      const body = input.slice(i + 2, end);
      expect(
        splitDockerShellCommands(body, context).flatMap((segment) =>
          findDockerNpmCommands(segment, [], context),
        ),
        `Use a separately auditable npm command instead of ${input}`,
      ).toEqual([]);
      i = end;
    }
  }
}

function splitDockerShellCommands(
  input: string,
  context = DEFAULT_DOCKER_AUDIT_CONTEXT,
): DockerShellWord[][] {
  assertDockerShellSubstitutions(input, context);
  const segments: DockerShellWord[][] = [[]];
  // Preserve quoted words while separating lists, pipes, and groups.
  const tokens = input.match(
    /#[^\n]*|(?:\\[\s\S]|"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[^\s;&|()`'"\\])+|[;&|()`\n]|[^\s]/g,
  );
  for (const [index, token] of (tokens ?? []).entries()) {
    if (token.startsWith('#')) {
      continue;
    }
    if (/^[;&|()`\n]$/.test(token)) {
      segments.push([]);
    } else {
      const word = readDockerShellWord(token);
      if (
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(word.value) &&
        tokens?.[index + 1] === '(' &&
        tokens?.[index + 2] === ')'
      ) {
        throw new Error(
          `Docker RUN shell functions are not supported by the npm audit: ${word.raw}`,
        );
      }
      segments[segments.length - 1].push(word);
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

function isDockerExecutionEnvironment(name: string): boolean {
  // PATH can replace an audited binary; the other settings load code before the audited
  // interpreter or native program starts, even for some syntax-check or version commands.
  return (
    /^(?:PATH|ENV|BASH_ENV|ZDOTDIR|NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|PYTHONPATH|PYTHONHOME|PYTHONSTARTUP|PYTHONUSERBASE|RUBYOPT|RUBYLIB|PERL5OPT|PERL5LIB|PERLLIB|PHPRC|PHP_INI_SCAN_DIR|LUA_(?:INIT|PATH|CPATH)(?:_\d+_\d+)?|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|DYLD_INSERT_LIBRARIES|DYLD_LIBRARY_PATH)$/.test(
      name,
    ) ||
    /^npm_config_(?:node_options|script_shell|prefix|local_prefix|workspace|workspaces|include_workspace_root|global|location|userconfig|globalconfig)$/i.test(
      name,
    )
  );
}

function dockerAssignmentName(value: string): string | undefined {
  return /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(value)?.[1];
}

function assertDockerExecutionAssignments(values: string[]): void {
  for (const value of values) {
    const name = dockerAssignmentName(value);
    expect(
      name && isDockerExecutionEnvironment(name),
      `Unaudited Docker execution environment: ${value}`,
    ).not.toBe(true);
  }
}

function readDockerDirectiveWords(input: string): DockerShellWord[] {
  const tokens = input.match(/(?:\\[\s\S]|"(?:\\[\s\S]|[^"\\])*"|'[^']*'|[^\s'"\\])+/g) ?? [];
  return tokens.map(readDockerShellWord);
}

function assertDockerEnvironmentDirective(line: string): void {
  const directive = /^\s*(ARG|ENV)\s+(.*)$/i.exec(line);
  if (!directive) {
    return;
  }
  const values = readDockerDirectiveWords(directive[2]).map(({ value }) => value);
  const first = values[0];
  if (first && !first.includes('=')) {
    expect(isDockerExecutionEnvironment(first), `Unaudited Docker ${directive[1]} ${first}`).toBe(
      false,
    );
  }
  assertDockerExecutionAssignments(
    directive[1].toUpperCase() === 'ARG' ? values.slice(0, 1) : values,
  );
}

function nextDockerWorkdir(raw: string, previous: DockerAuditContext['workdir']): string | null {
  const directory = readDockerShellWord(raw.trim());
  if (directory.dynamic) {
    return null;
  }
  if (path.posix.isAbsolute(directory.value)) {
    return path.posix.normalize(directory.value);
  }
  return previous ? path.posix.resolve(previous, directory.value) : null;
}

function assertDockerCopyInstruction(line: string, context: DockerAuditContext): void {
  const instruction = /^(COPY|ADD)\s+(.+)$/i.exec(line);
  if (!instruction) {
    return;
  }
  const [, verb, raw] = instruction;
  expect(verb.toUpperCase(), 'Docker ADD needs an explicit npm control-file audit').not.toBe('ADD');
  const canonical = `COPY ${raw.trim().replace(/\s+/g, ' ')}`;
  if (
    DOCKER_AUDITED_BUILD_COPIES.has(canonical) &&
    (context.workdir === '/app' || (!context.hasStages && context.workdir === undefined))
  ) {
    return;
  }
  const operands = raw.replace(/^(?:--[^\s]+\s+)*/, '');
  let destination: { value: string; dynamic: boolean } | undefined;
  if (operands.startsWith('[')) {
    const paths: unknown = JSON.parse(operands);
    expect(
      Array.isArray(paths) &&
        paths.length >= 2 &&
        paths.every((value) => typeof value === 'string'),
    ).toBe(true);
    const value = (paths as string[]).at(-1)!;
    destination = { value, dynamic: /[$`]/.test(value) };
  } else {
    const paths = readDockerDirectiveWords(operands);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    destination = paths.at(-1);
  }
  expect(
    !destination || destination.dynamic || isDockerProtectedWritePath(destination.value, context),
    `Unaudited Docker COPY can replace npm control files: ${line}`,
  ).toBe(false);
}

function extractDockerRunBody(line: string): string {
  let body = line.replace(/^RUN\b/i, '').trim();
  let cacheMount = false;
  while (body.startsWith('--')) {
    const option = /^--\S+/.exec(body)?.[0];
    expect(
      !cacheMount && option === '--mount=type=cache,target=/root/.npm',
      `Unaudited Docker RUN option can replace trusted execution inputs: ${option}`,
    ).toBe(true);
    cacheMount = true;
    body = body.slice(option!.length).trimStart();
  }
  expect(body.length, 'Docker RUN needs an auditable command').toBeGreaterThan(0);
  return body;
}

function extractRunBodies(dockerfile: string): { body: string; context: DockerAuditContext }[] {
  expect(
    dockerfile,
    'The Docker npm policy requires the default shell and escape directive',
  ).not.toMatch(/^\s*(?:SHELL\b|#\s*escape\s*=\s*`)/im);
  const normalized = dockerfile
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, '');
  const lines = normalized.split('\n');
  const hasStages = lines.some((line) => /^\s*FROM\b/i.test(line));
  const runs: { body: string; context: DockerAuditContext }[] = [];
  let workdir: DockerAuditContext['workdir'];
  for (const raw of lines) {
    const line = raw.trim();
    assertDockerEnvironmentDirective(line);
    expect(line, 'Docker ONBUILD triggers need an explicit npm policy audit').not.toMatch(
      /^ONBUILD\b/i,
    );
    if (/^FROM\b/i.test(line)) {
      workdir = undefined;
      continue;
    }
    const directory = /^WORKDIR\s+(.+)$/i.exec(line);
    if (directory) {
      workdir = nextDockerWorkdir(directory[1], workdir);
      continue;
    }
    const context = { hasStages, workdir };
    assertDockerCopyInstruction(line, context);
    if (/^RUN\b/i.test(line)) {
      runs.push({ body: extractDockerRunBody(line), context });
    }
  }
  return runs;
}

const DOCKER_SHELLS = new Set(['sh', 'ash', 'bash', 'csh', 'dash', 'fish', 'ksh', 'tcsh', 'zsh']);
const DOCKER_SHELL_CONTROL_WORDS = new Set([
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'select',
  'function',
  'coproc',
  'trap',
  'alias',
  'builtin',
  'begin',
  'end',
  'switch',
  'foreach',
  'endif',
  'endsw',
  'and',
  'or',
  'not',
  '!',
  '{',
  '}',
  '[[',
  ']]',
]);
const DOCKER_LAUNCHERS = new Set([
  'chroot',
  'find',
  'nice',
  'nohup',
  'setsid',
  'stdbuf',
  'su',
  'sudo',
  'time',
  'timeout',
]);
// Bare names may resolve to Docker-generated programs on the normal PATH. New commands need
// an explicit audit; dispatchers in this set have their arguments checked separately below.
const DOCKER_AUDITED_BARE_EXECUTABLES = new Set([
  '[',
  ':',
  'addgroup',
  'adduser',
  'apk',
  'busybox',
  'chmod',
  'chown',
  'command',
  'date',
  'echo',
  'env',
  'exec',
  'false',
  'find',
  'git',
  'ln',
  'mkdir',
  'npm',
  'npx',
  'printf',
  'tee',
  'test',
  'timeout',
  'true',
]);
// Only these absolute paths dispatch to commands or interpreters that this audit inspects.
// Arbitrary absolute or relative command paths can point at a script generated by an earlier RUN.
const DOCKER_AUDITED_EXECUTABLE_PATHS = new Set([
  '/bin/ash',
  '/bin/bash',
  '/bin/busybox',
  '/bin/dash',
  '/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/dash',
  '/usr/bin/env',
  '/usr/bin/git',
  '/usr/bin/node',
  '/usr/bin/nodejs',
  '/usr/bin/npx',
  '/usr/bin/python',
  '/usr/bin/python3',
  '/usr/bin/sh',
  '/usr/local/bin/node',
  '/usr/local/bin/npx',
  '/usr/local/bin/python',
  '/usr/local/bin/python3',
]);
const DOCKER_AUDITED_PATH_SYMLINKS = new Set([
  '-sf\npython3\n/usr/bin/python',
  '-s\n/app/dist/src/entrypoint.js\n/usr/local/bin/promptfoo',
  '-s\n/app/dist/src/entrypoint.js\n/usr/local/bin/pf',
]);
const DOCKER_AUDITED_BUILD_WRITES = new Set([
  'ln\n-s\n/app\n/app/node_modules/promptfoo',
  'chown\n-h\npromptfoo:promptfoo\n/app/node_modules/promptfoo',
]);
const DOCKER_AUDITED_BUILD_COPIES = new Set([
  'COPY package.json package-lock.json ./',
  'COPY src/app/package.json ./src/app/package.json',
  'COPY site/package.json ./site/package.json',
  'COPY . .',
  'COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules',
  'COPY --from=builder --chown=promptfoo:promptfoo /app/package.json ./package.json',
  'COPY --from=builder --chown=promptfoo:promptfoo /app/dist ./dist',
]);
const DOCKER_CODE_INTERPRETERS =
  /^(?:node(?:js)?|bun|deno|(?:python|pypy|ruby|perl|php|lua)(?:\d+(?:\.\d+)*)?|[gmn]?awk)$/;
const DOCKER_NODE_SYNTAX_CHECK_FILE = /^(?!-)(?!\/(?:dev|proc|sys)\/)[\w@./+-]+\.[cm]?[jt]sx?$/;

function isUnauditedDockerExecutablePath(value: string): boolean {
  return value.includes('/') && !DOCKER_AUDITED_EXECUTABLE_PATHS.has(value);
}

function isAuditedDockerExecutable(value: string): boolean {
  return value.includes('/')
    ? !isUnauditedDockerExecutablePath(value)
    : DOCKER_AUDITED_BARE_EXECUTABLES.has(value) ||
        DOCKER_SHELLS.has(value) ||
        DOCKER_CODE_INTERPRETERS.test(value);
}

function isDockerNpxInformational(args: DockerShellWord[]): boolean {
  return (
    args.length === 1 &&
    !args[0].dynamic &&
    ['--version', '-v', '--help', '-h'].includes(args[0].value)
  );
}

function isDockerGitInformational(args: DockerShellWord[]): boolean {
  if (args.some(({ dynamic }) => dynamic)) {
    return false;
  }
  const values = args.map(({ value }) => value);
  if (values[0] === '--no-pager') {
    values.shift();
  }
  return values.length === 1 && ['--version', '-v', 'version'].includes(values[0]);
}

function containsDockerExecutionPayload(value: string): boolean {
  const shellText = value.replace(/\\(.)/gs, '$1').replace(/['"]/g, '');
  return (
    /(?:^|[=:])\s*!(?!=)/.test(shellText) ||
    /(?:^|[=:;|&(!{\n])\s*(?:[.\w/-]*\/)?(?:npm|npx)(?=\s+\S)/i.test(shellText)
  );
}

function isDockerSystemExecutablePath(value: string): boolean {
  return (
    value.startsWith('/') &&
    /^\/(?:usr\/local\/(?:sbin|bin)|usr\/(?:sbin|bin)|sbin|bin)(?:\/|$)/.test(
      path.posix.normalize(value),
    )
  );
}

function isDockerProtectedWritePath(value: string, context: DockerAuditContext): boolean {
  // Normalizing away `..` can conceal traversal through a symlink created in an earlier RUN.
  if (value.split('/').includes('..')) {
    return true;
  }
  let absolute: string;
  if (path.posix.isAbsolute(value)) {
    absolute = path.posix.normalize(value);
  } else {
    if (context.workdir === null || (context.hasStages && context.workdir === undefined)) {
      return true;
    }
    absolute = path.posix.resolve(context.workdir ?? '/app', value);
  }
  return (
    isDockerSystemExecutablePath(absolute) ||
    /^\/app(?:\/|$)/.test(absolute) ||
    /^\/proc\/(?:self|thread-self|\d+)(?:\/task\/(?:self|thread-self|\d+))?\/(?:root|cwd|fd)(?:\/|$)/.test(
      absolute,
    ) ||
    /^\/dev\/(?:fd|stdin|stdout|stderr)(?:\/|$)/.test(absolute) ||
    // npm can climb from /app to the filesystem root, and Node can resolve its node_modules.
    // Protect the directory itself too: a COPY to / can populate any of these paths.
    absolute === '/' ||
    /^\/(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|\.npmrc)$/.test(absolute) ||
    /^\/node_modules(?:\/|$)/.test(absolute) ||
    /^(?:\/(?:root|home\/[^/]+)\/\.npmrc|\/(?:usr\/local\/etc|etc)\/npmrc)$/.test(absolute)
  );
}

function dockerOutputRedirects(raw: string): { before: number; after: number }[] {
  const positions: { before: number; after: number }[] = [];
  let quote = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (dockerShellEscapesNext(raw, i, quote)) {
      i++;
    } else if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
    } else if (!quote && char === '>') {
      const before = i;
      if (raw[i + 1] === '>') {
        i++;
      }
      positions.push({ before, after: i + 1 });
    }
  }
  return positions;
}

function dockerWriterTargetsProtectedPath(
  word: DockerShellWord,
  context: DockerAuditContext,
): boolean {
  let value = word.value;
  if (value.startsWith('-')) {
    const equals = value.indexOf('=');
    const slash = value.indexOf('/');
    value = equals >= 0 ? value.slice(equals + 1) : slash >= 0 ? value.slice(slash) : value;
  }
  return word.dynamic || isDockerProtectedWritePath(value, context);
}

function assertDockerRedirections(words: DockerShellWord[], context: DockerAuditContext): void {
  for (const [index, word] of words.entries()) {
    if (!word.shellSyntax) {
      continue;
    }
    const redirects = dockerOutputRedirects(word.raw);
    for (const [position, redirect] of redirects.entries()) {
      const targetRaw = word.raw.slice(redirect.after, redirects[position + 1]?.before);
      const target = targetRaw ? readDockerShellWord(targetRaw) : words[index + 1];
      expect(
        !target || target.dynamic || isDockerProtectedWritePath(target.value, context),
        `Unaudited Docker output redirection that can replace a command or npm control file: ${target?.raw}`,
      ).toBe(false);
    }
  }
}

function dockerDataWriterTargets(name: string, args: DockerShellWord[]): DockerShellWord[] {
  if (name === 'find') {
    return args.filter((_, index) =>
      ['-fprint', '-fprint0', '-fprintf', '-fls'].includes(args[index - 1]?.value),
    );
  }
  if (!['tee', 'chmod', 'chown', 'mkdir', 'ln'].includes(name)) {
    return [];
  }
  let skipDescriptor =
    ['chmod', 'chown'].includes(name) &&
    !args.some(({ value }) => value === '--reference' || value.startsWith('--reference='));
  return args.filter((word, index) => {
    if (word.value.startsWith('-')) {
      return word.value.includes('/') || word.value.includes('=') || word.dynamic;
    }
    if (name === 'mkdir' && ['-m', '--mode'].includes(args[index - 1]?.value)) {
      return false;
    }
    if (skipDescriptor) {
      skipDescriptor = false;
      return false;
    }
    return true;
  });
}

function assertDockerSystemPathWrites(
  name: string,
  args: DockerShellWord[],
  context: DockerAuditContext,
): void {
  const literal = !args.some(({ dynamic }) => dynamic);
  const signature = args.map(({ value }) => value).join('\n');
  if (
    literal &&
    ((name === 'ln' && DOCKER_AUDITED_PATH_SYMLINKS.has(signature)) ||
      DOCKER_AUDITED_BUILD_WRITES.has(`${name}\n${signature}`))
  ) {
    return;
  }
  if (name === 'ln') {
    // Relative symlink targets resolve from the link's directory, not the Docker WORKDIR.
    // Only audited links above may use relative operands; scratch links can use absolute paths.
    expect(
      args.some(
        ({ value, dynamic }) => dynamic || (!value.startsWith('-') && !value.startsWith('/')),
      ),
      'Unaudited Docker ln needs absolute operands',
    ).toBe(false);
  }
  const writesProtectedPath = dockerDataWriterTargets(name, args).some((word) =>
    dockerWriterTargetsProtectedPath(word, context),
  );
  expect(
    writesProtectedPath,
    `Unaudited Docker ${name} write that can replace a command or npm control file`,
  ).toBe(false);
}

function hasAuditableDockerInterpreterInput(name: string, args: DockerShellWord[]): boolean {
  const node = /^node(?:js)?$/.test(name);
  const python = /^(?:python|pypy)/.test(name);
  for (let i = 0; i < args.length; i++) {
    const value = args[i].value;
    const last = i === args.length - 1;
    if (
      last &&
      (['--version', '--help'].includes(value) ||
        (node && ['-v', '-h'].includes(value)) ||
        (python && ['-V', '-VV', '-h'].includes(value)))
    ) {
      return true;
    }
    if (node && ['--check', '-c'].includes(value)) {
      return (
        last || (i === args.length - 2 && DOCKER_NODE_SYNTAX_CHECK_FILE.test(args[i + 1].value))
      );
    }
    if (
      (node &&
        /^--(?:no-warnings|trace-warnings|enable-source-maps|no-deprecation|trace-deprecation|throw-deprecation|use-strict|input-type=(?:commonjs|module|commonjs-typescript|module-typescript))$/.test(
          value,
        )) ||
      (python && /^-[bBdEIOPqRsSuvx]+$/.test(value))
    ) {
      continue;
    }
    // No interpreter file is audited by this Docker policy. Even a repository-looking path
    // could be written or replaced in an earlier RUN; syntax-check-only mode above cannot run it.
    // An unrecognized option may also consume a positional-looking value or enable stdin again.
    return false;
  }
  return false;
}

function dockerInterpreterCanHideNpm(name: string, args: DockerShellWord[]): boolean {
  if (!DOCKER_CODE_INTERPRETERS.test(name)) {
    return false;
  }
  // Interpreter code is opaque: only terminal operations are auditable. Even ordinary runtime
  // flags can let stdin or a generated file construct an npm command for another shell.
  if (/^[gmn]?awk$/.test(name)) {
    return args.length !== 1 || !['--version', '--help'].includes(args[0].value);
  }
  return (
    !hasAuditableDockerInterpreterInput(name, args) ||
    args.some(
      ({ value, dynamic }) =>
        dynamic ||
        value === '-' ||
        /^--(?:eval|print|execute|command|require|import|(?:experimental-)?loader)(?:=|$)/.test(
          value,
        ) ||
        /^-[epr]/.test(value) ||
        (/^(?:python|pypy)/.test(name) && /^-[bBdEiIOqRsSuvx]*c/.test(value)) ||
        (/^node(?:js)?$/.test(name) && /^-i[ep]/.test(value)) ||
        (/^(?:ruby|perl)/.test(name) && /^-[anlp]*e/.test(value)) ||
        (/^php/.test(name) && /^-n*r/.test(value)) ||
        (['bun', 'deno'].includes(name) && value === 'eval'),
    )
  );
}

function dockerLauncherExecutesPath(name: string, args: DockerShellWord[], index: number): boolean {
  if (name === 'find') {
    return ['-exec', '-execdir', '-ok', '-okdir'].includes(args[index - 1]?.value);
  }
  // chroot's first positional argument is the directory, not the command.
  return name !== 'chroot' || index > 0;
}

function dockerWrapperCanHideNpm(name: string, args: DockerShellWord[]): boolean {
  return args.some((word, index) => {
    const argName = path.posix.basename(word.value);
    const remaining = args.slice(index + 1);
    const next = remaining[0]?.value ?? '';
    const canRunNpx = argName === 'npx' && !isDockerNpxInformational(remaining);
    const canRunGit = argName === 'git' && !isDockerGitInformational(remaining);
    return (
      (DOCKER_LAUNCHERS.has(name) &&
        (word.dynamic ||
          argName === 'npm' ||
          canRunNpx ||
          canRunGit ||
          DOCKER_SHELLS.has(argName) ||
          dockerInterpreterCanHideNpm(argName, remaining) ||
          (!word.value.startsWith('-') &&
            isUnauditedDockerExecutablePath(word.value) &&
            dockerLauncherExecutesPath(name, args, index)))) ||
      ((canRunNpx || canRunGit) && remaining.length > 0) ||
      (argName === 'npm' &&
        /^(?:-|ci$|clean-install$|i(?:nstall)?$|add$|rebuild$|rb$|run(?:-script)?$|exec$|x$|update$|prune$|pack$|publish$)/.test(
          next,
        )) ||
      (DOCKER_SHELLS.has(argName) && /^-[A-Za-z]*c[A-Za-z]*$/.test(next))
    );
  });
}

function findDockerShellNpmCommands(
  name: string,
  args: DockerShellWord[],
  assignments: string[],
  context: DockerAuditContext,
): string[][] {
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    expect(option.dynamic).toBe(false);
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(option.value)) {
      const script = args[i + 1];
      expect(script, `Missing Docker ${name} -c script`).toBeDefined();
      expect(script.dynamic, `Dynamic Docker ${name} -c script`).toBe(false);
      return splitDockerShellCommands(script.value, context).flatMap((segment) =>
        findDockerNpmCommands(segment, assignments, context),
      );
    }
    if (option.value === '-o' || option.value === '+o') {
      expect(args[++i]?.dynamic).toBe(false);
    } else if (
      !/^[-+][A-Za-z]+$/.test(option.value) &&
      !/^--(?:noprofile|norc)$/.test(option.value)
    ) {
      break;
    }
  }
  throw new Error(`Docker ${name} must use a literal -c script for the npm policy audit`);
}

function findDockerTimeoutNpmCommands(
  args: DockerShellWord[],
  assignments: string[],
  context: DockerAuditContext,
): string[][] {
  const [duration, ...command] = args;
  expect(
    duration && !duration.dynamic && /^(?:\d+(?:\.\d+)?|\.\d+)[smhd]?$/.test(duration.value),
    'Docker timeout must use a literal duration followed by an audited command',
  ).toBe(true);
  expect(command.length, 'Docker timeout must name an audited command').toBeGreaterThan(0);
  return findDockerNpmCommands(command, assignments, context);
}

const DOCKER_FIND_DATA_OPTIONS = new Set([
  '-name',
  '-iname',
  '-path',
  '-ipath',
  '-wholename',
  '-iwholename',
  '-regex',
  '-iregex',
  '-lname',
  '-ilname',
  '-type',
  '-xtype',
  '-maxdepth',
  '-mindepth',
  '-amin',
  '-atime',
  '-cmin',
  '-ctime',
  '-mmin',
  '-mtime',
  '-size',
  '-user',
  '-group',
  '-uid',
  '-gid',
  '-perm',
  '-newer',
  '-anewer',
  '-cnewer',
  '-samefile',
  '-inum',
  '-links',
  '-fstype',
  '-printf',
  '-fprint',
  '-fprint0',
  '-fls',
]);
const DOCKER_FIND_NO_DATA_OPTIONS = new Set([
  '--',
  '-H',
  '-L',
  '-P',
  '-a',
  '-and',
  '-o',
  '-or',
  '-not',
  '-follow',
  '-xdev',
  '-mount',
  '-depth',
  '-daystart',
  '-ignore_readdir_race',
  '-noignore_readdir_race',
  '-print',
  '-print0',
  '-ls',
  '-empty',
  '-executable',
  '-readable',
  '-writable',
  '-nouser',
  '-nogroup',
  '-prune',
  '-quit',
  '-false',
  '-true',
]);

function assertDockerFindCommands(
  args: DockerShellWord[],
  assignments: string[],
  context: DockerAuditContext,
): void {
  for (let i = 0; i < args.length; i++) {
    const { value } = args[i];
    expect(value, 'Destructive Docker find actions need an explicit audit').not.toBe('-delete');
    if (DOCKER_FIND_DATA_OPTIONS.has(value) || value === '-fprintf') {
      // These operands are data: a literal `-delete` used as a filename pattern is harmless.
      i += value === '-fprintf' ? 2 : 1;
      expect(i, `Docker find ${value} needs its literal operands`).toBeLessThan(args.length);
      continue;
    }
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(value)) {
      // Unknown options can change operand interpretation and hide a later destructive action.
      expect(
        !value.startsWith('-') || DOCKER_FIND_NO_DATA_OPTIONS.has(value),
        `Unaudited Docker find option: ${value}`,
      ).toBe(true);
      continue;
    }
    const end = args.findIndex((word, index) => index > i && [';', '+'].includes(word.value));
    expect(end, 'Docker find needs an explicit terminator for an audited command').toBeGreaterThan(
      i + 1,
    );
    const command = args.slice(i + 1, end).map((word) => ({
      ...word,
      // find replaces `{}` with a matched path, possibly outside the Docker WORKDIR.
      dynamic: word.dynamic || word.value.includes('{}'),
    }));
    // -execdir/-okdir also change the child's working directory without needing `{}`.
    const commandContext = value.endsWith('dir') ? { ...context, workdir: null } : context;
    // find can match no files; it cannot provide either mandatory npm command.
    expect(findDockerNpmCommands(command, assignments, commandContext)).toEqual([]);
    i = end;
  }
}

function findDockerNpmCommands(
  words: DockerShellWord[],
  assignments: string[] = [],
  context = DEFAULT_DOCKER_AUDIT_CONTEXT,
): string[][] {
  const firstCommand = words.findIndex(({ raw }) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw));
  const localAssignments = words
    .slice(0, firstCommand === -1 ? words.length : firstCommand)
    .map(({ value }) => value);
  assertDockerExecutionAssignments(localAssignments);
  if (firstCommand === -1) {
    return [];
  }
  assignments = [...assignments, ...localAssignments];
  const [executable, ...args] = words.slice(firstCommand);
  // The audit understands simple command lists, not branches, loops, or shell functions.
  expect(
    DOCKER_SHELL_CONTROL_WORDS.has(executable.value),
    `Unsupported Docker RUN shell control syntax: ${executable.raw}`,
  ).toBe(false);
  expect(executable.dynamic, `Dynamic Docker RUN executable: ${executable.raw}`).toBe(false);
  expect(
    /^(?:\d+)?[<>]/.test(executable.raw) || !isAuditedDockerExecutable(executable.value),
    `Unaudited Docker RUN executable or leading redirection: ${executable.raw}`,
  ).toBe(false);
  const name = path.posix.basename(executable.value);
  assertDockerRedirections(words, context);
  assertDockerSystemPathWrites(name, args, context);
  if (name === 'npm') {
    expect(executable.raw).toBe('npm');
    expect(assignments.some((assignment) => /^npm_config_ignore_scripts=/i.test(assignment))).toBe(
      false,
    );
    for (const word of args) {
      expect(word.dynamic || word.raw !== word.value, `Nonliteral npm argument: ${word.raw}`).toBe(
        false,
      );
    }
    return [args.map(({ value }) => value)];
  }
  if (name === 'npx') {
    // npx is npm exec: it can run shell text, package executables, or an interactive shell.
    expect(isDockerNpxInformational(args), 'Docker npx may only print help or its version').toBe(
      true,
    );
    return [];
  }
  if (name === 'git') {
    // Git can dispatch shell aliases or configured helpers even if the payload is in a prior RUN.
    expect(isDockerGitInformational(args), 'Docker git may only print its version').toBe(true);
    return [];
  }
  if (DOCKER_SHELLS.has(name)) {
    return findDockerShellNpmCommands(name, args, assignments, context);
  }
  if (name === 'timeout') {
    return findDockerTimeoutNpmCommands(args, assignments, context);
  }
  if (['env', 'command', 'exec', 'busybox'].includes(name)) {
    if (name === 'command' && ['-v', '-V'].includes(args[0]?.value)) {
      return [];
    }
    if (args[0]?.value === '--' || (name === 'command' && args[0]?.value === '-p')) {
      args.shift();
    }
    expect(args[0]?.value.startsWith('-') ?? false, `Unsupported Docker ${name} option`).toBe(
      false,
    );
    return findDockerNpmCommands(args, assignments, context);
  }
  if (['.', 'source', 'eval', 'xargs'].includes(name)) {
    throw new Error(`Docker ${name} can hide npm commands from the policy audit`);
  }
  expect(
    dockerInterpreterCanHideNpm(name, args),
    `Inline Docker ${name} can hide npm commands`,
  ).toBe(false);
  if (name === 'find') {
    assertDockerFindCommands(args, assignments, context);
  }
  if (!['echo', 'printf'].includes(name)) {
    // For other commands the argument could be an executable delegated to an unknown wrapper.
    expect(
      args.some(({ substitution }) => substitution),
      `Docker ${name} consumes command substitution`,
    ).toBe(false);
    expect(
      [...assignments, ...args.map(({ value }) => value)].some(containsDockerExecutionPayload),
      `Docker ${name} consumes an embedded shell execution payload`,
    ).toBe(false);
    expect(
      dockerWrapperCanHideNpm(name, args),
      `Unsupported Docker wrapper around npm: ${executable.raw}`,
    ).toBe(false);
  }
  return [];
}

function validateDockerInstallCommands(dockerfile: string): void {
  const commands = extractRunBodies(dockerfile).flatMap(({ body: runBody, context }) => {
    let runCommands: string[][];
    if (/^\[\s*"/.test(runBody)) {
      const args: unknown = JSON.parse(runBody);
      expect(Array.isArray(args) && args.every((arg) => typeof arg === 'string')).toBe(true);
      runCommands = findDockerNpmCommands(
        (args as string[]).map((arg) => ({
          raw: arg,
          value: arg,
          dynamic: false,
          substitution: false,
          shellSyntax: false,
        })),
        [],
        context,
      );
    } else {
      runCommands = splitDockerShellCommands(runBody, context).flatMap((segment) =>
        findDockerNpmCommands(segment, [], context),
      );
    }
    if (runCommands.length > 0 && (context.hasStages || context.workdir !== undefined)) {
      expect(context.workdir, 'Docker npm commands must use the explicitly audited /app root').toBe(
        '/app',
      );
    }
    return runCommands;
  });
  expect(commands.some(([command]) => command === 'ci')).toBe(true);
  expect(commands.some(([command]) => command === 'rebuild')).toBe(true);
  for (const [command, ...args] of commands) {
    // Keep Docker npm commands auditable: global options must follow the subcommand.
    // Reject unsupported shapes instead of silently skipping a hidden install.
    expect(['ci', 'rebuild', 'run']).toContain(command);
    if (command === 'ci') {
      expect(args).toContain('--ignore-scripts');
      // Explicitly list safe options so npm's negations, abbreviations, positional values,
      // or a -- terminator cannot override or disguise the lifecycle-script policy.
      for (const arg of args) {
        expect(arg).toMatch(
          /^--(?:(?:ignore-scripts|install-links|no-audit|no-fund|no-progress|prefer-offline|offline|silent|quiet|verbose)|(?:include|omit)=(?:dev|optional|peer|prod)|loglevel=(?:silent|error|warn|notice|http|info|verbose|silly))$/,
        );
      }
    } else if (command === 'rebuild') {
      // Package names and globs can rebuild untrusted nested dependencies.
      expect(args).toEqual(['./node_modules/esbuild', './node_modules/@swc/core']);
    } else if (command === 'run') {
      // Other scripts and even build with --prefix/-w can execute third-party lifecycle hooks.
      expect(args, 'Only the exact npm run build for the Docker root is audited').toEqual([
        'build',
      ]);
    }
  }
}

it('rejects textual npm mentions that are not executable commands', () => {
  const dockerfile = `
    FROM node:20
    RUN echo npm ci && echo npm rebuild ./node_modules/esbuild ./node_modules/@swc/core
  `;
  expect(() => validateDockerInstallCommands(dockerfile)).toThrow();
});

const SOURCE_FILE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const EXPECTED_SHARP_VERSION = '^0.35.4';
const PATCHED_JS_YAML_RANGE = '^3.15.1 || ^4.3.1 || >=5.2.3';
const PATCHED_UNDICI_RANGE = '^7.29.1 || >=8.10.2';
const OPENAI_PACKAGE_NAMES = ['@openai/agents', '@openai/codex-sdk', 'openai'] as const;
const SWC_PACKAGE_NAMES = [
  '@swc/core',
  '@swc/core-darwin-arm64',
  '@swc/core-darwin-x64',
  '@swc/core-linux-x64-gnu',
  '@swc/core-linux-x64-musl',
  '@swc/core-win32-x64-msvc',
] as const;
const TYPESCRIPT_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function collectSourceFiles(rootDir: string, excluded: Set<string>): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (excluded.has(full) || entry.name === 'node_modules') {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      } else if (SOURCE_FILE_EXTENSIONS.test(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(rootDir);
  return results;
}

function collectPackageJsonFiles(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'package.json') {
        results.push(full);
      }
    }
  };

  walk(rootDir);
  return results.sort();
}

function getDependencyRange(
  packageJson: PackageManifest,
  dependencyName: (typeof OPENAI_PACKAGE_NAMES)[number],
): string | undefined {
  return (
    packageJson.dependencies?.[dependencyName] ??
    packageJson.devDependencies?.[dependencyName] ??
    packageJson.optionalDependencies?.[dependencyName] ??
    packageJson.peerDependencies?.[dependencyName]
  );
}

function findExtensionUnsafeRelativeSpecifiers(sourceText: string, filePath: string): string[] {
  return extractModuleSpecifiers(sourceText, filePath).filter((specifier) => {
    if (!specifier.startsWith('.')) {
      return false;
    }

    const extension = path.posix.extname(specifier);
    return !extension || TYPESCRIPT_SOURCE_EXTENSIONS.has(extension);
  });
}

describe('package manifests', () => {
  it.each([
    ['src/app/package.json', ['dedent', 'fast-deep-equal', 'zod']],
    ['site/package.json', ['ajv']],
  ] as const)('declares shared imports in their owning workspace: %s', (manifest, dependencies) => {
    const root = readPackageJson<PackageManifest>('package.json');
    const workspace = readPackageJson<PackageManifest>(manifest);
    const lock = readPackageJson<PackageLockManifest>('package-lock.json');
    const workspacePath = path.posix.dirname(manifest);

    for (const dependency of dependencies) {
      const range = workspace.devDependencies?.[dependency];
      expect(range, `${manifest} must declare its direct ${dependency} import`).toBeDefined();
      expect(range).toBe(root.dependencies?.[dependency]);
      expect(lock.packages[workspacePath].devDependencies?.[dependency]).toBe(range);
      expect(satisfies(lock.packages[`node_modules/${dependency}`].version!, range!)).toBe(true);
    }
  });

  it('declares browser matcher types alongside the app browser test runner', () => {
    const app = readPackageJson<PackageManifest>('src/app/package.json');
    const lock = readPackageJson<PackageLockManifest>('package-lock.json');
    const range = app.devDependencies?.['@vitest/browser'];
    const browser = lock.packages['node_modules/@vitest/browser'];

    expect(range, 'browser smoke tests reference @vitest/browser/matchers types').toBeDefined();
    expect(range).toBe(app.devDependencies?.vitest);
    expect(range).toBe(app.devDependencies?.['@vitest/browser-playwright']);
    expect(lock.packages['src/app'].devDependencies?.['@vitest/browser']).toBe(range);
    expect(browser?.version).toBeDefined();
    expect(satisfies(browser.version!, range!)).toBe(true);
    expect(browser.version).toBe(lock.packages['node_modules/vitest'].version);
  });

  it('declares concrete Docusaurus type and theme imports alongside the docs build', () => {
    const site = readPackageJson<PackageManifest>('site/package.json');
    const lock = readPackageJson<PackageLockManifest>('package-lock.json');
    const coreRange = site.devDependencies?.['@docusaurus/core'];
    const coreVersion = lock.packages['node_modules/@docusaurus/core'].version;

    for (const dependency of [
      '@docusaurus/plugin-content-blog',
      '@docusaurus/theme-common',
      '@docusaurus/types',
    ]) {
      const range = site.devDependencies?.[dependency];
      expect(range, `${dependency} is a package import, not a virtual alias`).toBeDefined();
      expect(range).toBe(coreRange);
      expect(lock.packages.site.devDependencies?.[dependency]).toBe(range);
      expect(lock.packages[`node_modules/${dependency}`].version).toBe(coreVersion);
      expect(satisfies(coreVersion!, range!)).toBe(true);
    }
  });

  it('publishes the lightweight contracts subpath', () => {
    const packageJson = readPackageJson<{
      exports?: Record<string, unknown>;
      typesVersions?: Record<string, Record<string, string[]>>;
    }>('package.json');

    expect(packageJson.exports?.['./contracts']).toEqual({
      import: {
        types: './dist/src/contracts.d.ts',
        default: './dist/src/contracts.js',
      },
      require: {
        types: './dist/src/contracts.d.cts',
        default: './dist/src/contracts.cjs',
      },
    });
    expect(packageJson.typesVersions?.['*']?.contracts).toEqual(['dist/src/contracts.d.ts']);
  });

  it('keeps the contracts subpath extension-safe for emitted ESM', () => {
    const contractsDir = path.join(process.cwd(), 'src', 'contracts');
    const files = [
      path.join(process.cwd(), 'src', 'contracts.ts'),
      ...collectSourceFiles(contractsDir, new Set()),
    ];
    const offenders = files.flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8');
      return findExtensionUnsafeRelativeSpecifiers(contents, file).map(
        (specifier) => `${path.relative(process.cwd(), file)}: ${specifier}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('detects extension-unsafe relative specifiers across module syntax', () => {
    // The contracts files are dominated by type-only imports/exports, so the detector that the
    // extension-safety guard relies on MUST catch those forms, not just runtime imports.
    expect(
      findExtensionUnsafeRelativeSpecifiers(
        `
          import './side-effect';
          export { value } from './exported';
          import('./dynamic');
          import type { A } from './type-import';
          export type { B } from './type-export';
          import { type C, D } from './inline-type';
          import type Default from './default-type';
          export { schema } from './schema.json';
        `,
        'fixture.ts',
      ),
    ).toEqual([
      './side-effect',
      './exported',
      './dynamic',
      './type-import',
      './type-export',
      './inline-type',
      './default-type',
    ]);
  });

  it('pins root TypeScript compilation to noEmit', () => {
    const tsconfig = readPackageJson<{
      compilerOptions?: {
        noEmit?: boolean;
      };
    }>('tsconfig.json');

    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
  });

  it('keeps the pull-request code scan on its known-good Node release', () => {
    const workflowPath = '.github/workflows/promptfoo-code-scan.yml';
    const workflow = fs.readFileSync(path.join(process.cwd(), workflowPath), 'utf8');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchFileNames?: string[];
        matchManagers?: string[];
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');

    expect(workflow).toMatch(/node-version:\s*['"]24\.15\.0['"]/);
    expect(
      renovateConfig.packageRules?.some(
        (rule) =>
          rule.enabled === false &&
          rule.matchManagers?.includes('github-actions') &&
          rule.matchPackageNames?.includes('node') &&
          rule.matchPackageNames?.includes('actions/node-versions') &&
          rule.matchFileNames?.includes(workflowPath),
      ),
    ).toBe(true);
  });

  it('keeps Renovate on the npm major used by CI', () => {
    const renovateConfig = readPackageJson<{
      constraints?: {
        npm?: string;
      };
      packageRules?: Array<{
        enabled?: boolean;
        matchFileNames?: string[];
        matchPackageNames?: string[];
        matchUpdateTypes?: string[];
      }>;
    }>('renovate.json');
    const npmConstraint = renovateConfig.constraints?.npm;

    expect(npmConstraint, 'Renovate must constrain its npm version').toBeDefined();
    expect(validRange(npmConstraint)).not.toBeNull();
    expect(satisfies('11.17.0', npmConstraint as string)).toBe(false);
    expect(satisfies('11.18.0', npmConstraint as string)).toBe(true);
    expect(satisfies('12.0.0', npmConstraint as string)).toBe(false);
    expect(
      renovateConfig.packageRules?.some(
        (rule) =>
          rule.enabled === false &&
          rule.matchFileNames?.includes('renovate.json') &&
          rule.matchPackageNames?.includes('npm') &&
          rule.matchUpdateTypes?.includes('major'),
      ),
    ).toBe(true);
  });

  it('applies the npm release-age policy to Renovate lockfile maintenance', () => {
    const renovateConfig = readPackageJson<{
      npmrc?: string;
      packageRules?: Array<{
        matchDatasources?: string[];
        minimumReleaseAge?: string;
      }>;
    }>('renovate.json');
    const npmReleaseAgeRule = renovateConfig.packageRules?.find((rule) =>
      rule.matchDatasources?.includes('npm'),
    );

    expect(npmReleaseAgeRule?.minimumReleaseAge).toBe('10 days');
    expect(renovateConfig.npmrc).toMatch(/^min-release-age=10$/m);
  });

  it('keeps private npm registry endpoints out of the published lockfile', () => {
    const packageLock =
      readPackageJson<PackageLockManifest<{ resolved?: string }>>('package-lock.json');
    const privateRegistryPackages = Object.entries(packageLock.packages)
      .filter(([, packageInfo]) => {
        if (!packageInfo.resolved || !URL.canParse(packageInfo.resolved)) {
          return false;
        }

        const hostname = new URL(packageInfo.resolved).hostname;
        return (
          hostname === 'internal.api.openai.org' || hostname.endsWith('.internal.api.openai.org')
        );
      })
      .map(([packagePath]) => packagePath);

    expect(privateRegistryPackages).toEqual([]);
  });

  it('holds Knip below the incompatible public re-export audit', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ version?: string }>>('package-lock.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const knipRange = packageJson.devDependencies?.knip;
    const knipVersion = packageLock.packages['node_modules/knip']?.version;
    const knipCap = renovateConfig.packageRules?.find(
      (rule) => rule.matchPackageNames?.includes('knip') && rule.allowedVersions,
    )?.allowedVersions;

    expect(knipRange, 'the root manifest must constrain Knip').toBeDefined();
    expect(satisfies('6.27.0', knipRange as string)).toBe(true);
    expect(satisfies('6.28.0', knipRange as string)).toBe(false);
    expect(knipCap).toBe('<6.28.0');
    expect(knipVersion, 'the root lockfile must resolve Knip').toBeDefined();
    expect(satisfies(knipVersion as string, knipRange as string)).toBe(true);
  });

  it('holds TanStack Table below v9 until the shared table migration is complete', () => {
    const appPackageJson = readPackageJson<PackageManifest>('src/app/package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ version?: string }>>('package-lock.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const tablePackages = ['@tanstack/react-table', '@tanstack/table-core'];
    const tableVersionCap = renovateConfig.packageRules?.find(
      (rule) =>
        rule.allowedVersions &&
        tablePackages.every((packageName) => rule.matchPackageNames?.includes(packageName)),
    )?.allowedVersions;

    expect(tableVersionCap, 'Renovate must keep the TanStack Table packages on v8').toBe('<9');

    for (const packageName of tablePackages) {
      const packageRange = appPackageJson.devDependencies?.[packageName];
      const packageVersion = packageLock.packages[`node_modules/${packageName}`]?.version;

      expect(packageRange, `${packageName} must be declared in the app workspace`).toBeDefined();
      expect(satisfies('9.0.0', packageRange as string), `${packageName} must exclude v9`).toBe(
        false,
      );
      expect(packageVersion, `${packageName} must be present in the lockfile`).toBeDefined();
      expect(satisfies(packageVersion as string, packageRange as string)).toBe(true);
      expect(satisfies(packageVersion as string, tableVersionCap as string)).toBe(true);
    }
  });

  it('keeps jsdom on a release the supported Node floor can install', () => {
    const rootPackageJson = readPackageJson<
      PackageManifest & {
        engines?: Record<string, string>;
        overrides?: Record<string, Record<string, string> | string>;
      }
    >('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ engines?: Record<string, string>; version?: string }>>(
        'package-lock.json',
      );
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    // jsdom 30 requires node ^22.22.2 || ^24.15.0 || >=26.0.0. With engine-strict=true and a
    // published floor of >=22.22.0, `npm ci` fails EBADENGINE on the Node 22.22.0 lanes that
    // exist to test that floor. jsdom is a dev-only Vitest environment, so the cap moves only
    // after engines.node does.
    const nodeFloor = minVersion(rootPackageJson.engines?.node as string);
    const jsdomCap = renovateConfig.packageRules?.find((rule) =>
      rule.matchPackageNames?.includes('jsdom'),
    )?.allowedVersions;
    const cssColorCap = renovateConfig.packageRules?.find((rule) =>
      rule.matchPackageNames?.includes('@asamuzakjp/css-color'),
    )?.allowedVersions;
    const jsdomOverrides = rootPackageJson.overrides?.jsdom;
    const cssColorOverride =
      typeof jsdomOverrides === 'object' ? jsdomOverrides['@asamuzakjp/css-color'] : undefined;
    const lockedCssColor = packageLock.packages['node_modules/@asamuzakjp/css-color'];

    expect(nodeFloor, 'the root manifest must declare a Node floor').toBeDefined();
    expect(cssColorOverride, 'jsdom must pin its CSS color parser').toBeDefined();
    expect(
      lockedCssColor,
      'the jsdom CSS color parser must be present in the lockfile',
    ).toBeDefined();
    expect(lockedCssColor?.version, 'the parser override and lockfile must agree').toBe(
      cssColorOverride,
    );
    expect(
      lockedCssColor?.engines?.node,
      'the parser must declare its supported Node range',
    ).toBeDefined();
    expect(
      satisfies(nodeFloor!.version, lockedCssColor!.engines!.node!),
      'the jsdom CSS color parser must install on the minimum supported Node version',
    ).toBe(true);

    if (nodeFloor!.compare('22.22.2') < 0) {
      expect(
        jsdomCap,
        'Renovate must hold jsdom below 30 while the Node floor is below 22.22.2',
      ).toBe('<30');
      expect(
        cssColorCap,
        'Renovate must hold the jsdom CSS color parser below 7 while the Node floor is below 22.22.2',
      ).toBe('<7');
      expect(satisfies(cssColorOverride!, cssColorCap!)).toBe(true);

      for (const manifestPath of ['src/app/package.json', 'site/package.json']) {
        const range = readPackageJson<PackageManifest>(manifestPath).devDependencies?.jsdom;

        expect(range, `${manifestPath} must declare jsdom`).toBeDefined();
        expect(
          satisfies('30.0.0', range as string),
          `${manifestPath} resolves a jsdom the Node floor cannot install`,
        ).toBe(false);
      }
    }
  });

  it('keeps CLI smoke tests on the real unsupported and minimum-supported Node releases', () => {
    const workflowPath = '.github/workflows/main.yml';
    const workflow = fs.readFileSync(path.join(process.cwd(), workflowPath), 'utf8');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchCurrentValue?: string;
        matchFileNames?: string[];
        matchManagers?: string[];
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');

    const unsupportedNodeVersion = workflow.match(
      /name:\s*Set up unsupported Node 20[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];
    const minimumSupportedNodeVersion = workflow.match(
      /name:\s*Set up minimum supported Node[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];

    expect(unsupportedNodeVersion).toBe('20.20.0');
    expect(minimumSupportedNodeVersion).toBe('22.22.0');

    const protectedRuntimeRule = renovateConfig.packageRules?.find(
      (rule) =>
        rule.enabled === false &&
        rule.matchManagers?.includes('github-actions') &&
        rule.matchPackageNames?.includes('node') &&
        rule.matchPackageNames?.includes('actions/node-versions') &&
        rule.matchFileNames?.includes(workflowPath) &&
        rule.matchCurrentValue,
    );

    expect(
      protectedRuntimeRule,
      'Renovate must not replace intentionally unsupported or minimum-supported smoke-test runtimes',
    ).toBeDefined();

    const protectedRuntimePattern = new RegExp(
      protectedRuntimeRule!.matchCurrentValue!.slice(1, -1),
    );

    expect(protectedRuntimePattern.test(unsupportedNodeVersion!)).toBe(true);
    expect(protectedRuntimePattern.test(minimumSupportedNodeVersion!)).toBe(true);
    expect(protectedRuntimePattern.test(fs.readFileSync('.nvmrc', 'utf8').trim())).toBe(false);
  });

  it('keeps the Docker runtime on the patched Node release', () => {
    const expectedVersion = fs.readFileSync(path.join(process.cwd(), '.nvmrc'), 'utf8').trim();
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    const baseImageVersion = dockerfile.match(/^FROM node:([\d.]+)-alpine\b/m)?.[1];

    expect(baseImageVersion).toBeDefined();

    if (minVersion(baseImageVersion!)!.compare(expectedVersion) < 0) {
      const alpineNodeVersion = dockerfile.match(/apk add[^\n]*['"]nodejs>=([\d.]+)['"]/)?.[1];

      expect(alpineNodeVersion).toBeDefined();
      expect(minVersion(alpineNodeVersion!)!.compare(expectedVersion)).toBeGreaterThanOrEqual(0);
      expect(dockerfile).toMatch(/apk add[^\n]*['"]nodejs>=[\d.]+['"][^\n]*icu-data-full/);
      expect(dockerfile).toMatch(/ln -sf \/usr\/bin\/node \/usr\/local\/bin\/node/);
    }
  });

  it('blocks dependency install scripts in the Docker build', () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');

    expect(() => validateDockerInstallCommands(dockerfile)).not.toThrow();
  });

  it('audits literal shell wrappers, chains, continuations, and exec-form commands', () => {
    const dockerfile = [
      'RUN apk add npm',
      'RUN sh -c \'echo npm ci; printf "%s" "npm rebuild bad"\'',
      'RUN echo "$(date)" | tee /tmp/build-date',
      'RUN echo "$(echo npm ci)"; echo "$(date) npm ci"',
      'RUN [ -f /tmp/build-date ] || echo none',
      'RUN --mount=type=cache,target=/root/.npm npm ci \\',
      '# Docker ignores full-line comments within an instruction continuation',
      '    --ignore-scripts --include=peer --no-audit && \\',
      '    /bin/sh -ec \'printf "%s" setup; npm run build\'',
      'RUN ["env", "sh", "-c", "npm rebuild ./node_modules/esbuild ./node_modules/@swc/core"]',
      'RUN ["npm", "ci", "--ignore-scripts"]',
    ].join('\n');

    expect(() => validateDockerInstallCommands(dockerfile)).not.toThrow();
  });

  it.each([
    'echo npm ci --ignore-scripts; echo npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
    'sh -c \'echo "npm ci --ignore-scripts"; printf "%s" "npm rebuild ./node_modules/esbuild ./node_modules/@swc/core"\'',
    'echo npm ci --ignore-scripts; npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
    'npm ci --ignore-scripts; printf "%s" "npm rebuild ./node_modules/esbuild ./node_modules/@swc/core"',
  ])('does not count echoed npm commands as an installation or rebuild: %s', (script) => {
    expect(() => validateDockerInstallCommands(`RUN ${script}`)).toThrow();
  });

  it.each([
    'RUN npm ci',
    'RUN npm install',
    'RUN n*m ci',
    'RUN np? ci',
    String.raw`RUN n\pm ci`,
    `RUN n'p'm ci`,
    'RUN n""pm rebuild esbuild',
    'RUN (npm ci)',
    'RUN (npm rebuild esbuild)',
    'RUN /usr/bin/npm ci',
    'RUN "npm" ci',
    'RUN npm --silent ci',
    'RUN npm "ci"',
    'RUN npm --prefix /app ci',
    'RUN npm --silent rebuild esbuild',
    'RUN npm ci --ignore-scripts=false',
    'RUN npm ci --ignore-scripts --ignore-scripts=false',
    'RUN npm ci --ignore-scripts --no-ignore-scripts',
    'RUN npm ci --ignore-scripts --no-ignore-script',
    'RUN npm ci --ignore-scripts --ig=false',
    'RUN npm ci --ignore-scripts false',
    'RUN npm ci -- --ignore-scripts',
    'RUN npm ci --ignore-scripts $NPM_FLAGS',
    'RUN NPM_CONFIG_IGNORE_SCRIPTS=false npm ci --ignore-scripts',
    'RUN npm rebuild esbuild',
    'RUN npm rebuild ./node_modules/*',
    'RUN npm rebuild ./node_modules/esbuild ./node_modules/@swc/core ./node_modules/evil',
    "RUN sh -c 'npm ci --ignore-scripts=false'",
    'RUN /bin/sh -ec "npm ci"',
    'RUN bash -o pipefail -c "true && npm ci --ignore-scripts --no-ignore-scripts"',
    'RUN /bin/bash -lc "npm rebuild esbuild"',
    'RUN fish -c "npm ci"',
    'RUN sh -c \'sh -c "npm install"\'',
    'RUN env FOO=1 sh -c "npm ci"',
    'RUN command sh -c "npm ci"',
    'RUN busybox sh -c "npm ci"',
    'RUN timeout 10 /bin/sh -c "npm ci"',
    'RUN sh -c "$NPM_SCRIPT"',
    'RUN sh ./install-dependencies.sh',
    'RUN printf "%s" "npm ci" | sh',
    'RUN eval "npm ci"',
    'RUN echo "$(npm ci)"',
    'RUN echo $(npm ci)',
    'RUN echo `npm ci`',
    'RUN true | npm ci',
    'RUN true & npm ci',
    'RUN false || npm ci',
  ])('rejects an additional unsafe Docker command: %s', (unsafeCommand) => {
    const safeCommands =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safeCommands}\n${unsafeCommand}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safeCommands} && ${unsafeCommand.replace('RUN ', '')}`),
    ).toThrow();
  });

  it.each([
    '["/bin/sh", "-c", "npm ci --ignore-scripts=false"]',
    '["bash", "-lc", "echo ready; npm rebuild esbuild"]',
    '["env", "sh", "-c", "npm ci"]',
    '["npm", "ci", "--ignore-scripts", "--no-ignore-scripts"]',
  ])('rejects an additional unsafe Docker exec command: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
  });

  it.each([
    "npx -c 'npm ci'",
    "npx --call 'npm ci'",
    "npx --call='npm ci'",
    "npx -c'npm ci'",
    "npx --offline --package npm -c 'npm ci'",
    'npx npm ci',
    'npx -- npm ci',
    'npx --offline npm ci',
    'npx local-installer',
    'npx',
    'npx --version local-installer',
    "n'p'x --call 'npm ci'",
    "/usr/local/bin/npx --call 'npm ci'",
    "env FOO=1 npx --call 'npm ci'",
    "command npx -c 'npm ci'",
    "exec npx --call 'npm ci'",
    "timeout 5 npx -c 'npm ci'",
    "custom-wrapper npx --call 'npm ci'",
    `sh -c "npx --call 'npm ci'"`,
    `echo "$(npx --call 'npm ci')"`,
    "npm exec -c 'npm ci'",
    "npm exec --call 'npm ci'",
    "npm x --call='npm ci'",
    'npm x -- npm ci',
    'npm exe -- npm ci',
    'npm --offline exec -- npm ci',
    'timeout 5 npm exec -- npm ci',
  ])('rejects opaque npm package runners in Docker shell commands: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(['sh', '-c', command])}`),
    ).toThrow();
  });

  it.each([
    { command: ['npx', '-c', 'npm ci'] },
    { command: ['npx', '--call', 'npm ci'] },
    { command: ['npx', '--call=npm ci'] },
    { command: ['/usr/local/bin/npx', '--call', 'npm ci'] },
    { command: ['npx', '--', 'npm', 'ci'] },
    { command: ['npx', 'local-installer'] },
    { command: ['env', 'npx', '--call', 'npm ci'] },
    { command: ['timeout', '5', 'npx', '--call', 'npm ci'] },
    { command: ['custom-wrapper', 'npx', '--call', 'npm ci'] },
    { command: ['npm', 'exec', '--call', 'npm ci'] },
    { command: ['npm', 'x', '--', 'npm', 'ci'] },
  ])('rejects opaque npm package runners in Docker exec form: $command', ({ command }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it('allows Docker npx informational controls and ordinary package runner text', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN npm run build',
      'RUN npx --version && npx -v && npx --help && npx -h',
      'RUN /usr/local/bin/npx --version',
      'RUN env npx --version && timeout 5 npx --version && command -v npx',
      "RUN echo npx -c 'npm ci' && printf %s 'npx --call npm ci'",
      'RUN apk add npx',
      `RUN ${JSON.stringify(['npx', '--version'])}`,
      `RUN ${JSON.stringify(['echo', 'npx', '--call', 'npm ci'])}`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    'npm run postinstall --prefix ./node_modules/unapproved',
    'npm run install --prefix ./node_modules/unapproved',
    'npm run build --prefix ./node_modules/unapproved',
    'npm run build --prefix=./node_modules/unapproved',
    'npm run --prefix ./node_modules/unapproved build',
    'npm --prefix ./node_modules/unapproved run build',
    'npm run build -C ./node_modules/unapproved',
    'npm run build --workspace src/app',
    'npm run build --workspace=src/app',
    'npm run build -w src/app',
    'npm run build --workspaces',
    'npm run build --include-workspace-root',
    'npm run build -- --prefix ./node_modules/unapproved',
    'npm run build --if-present',
    'npm run build --silent',
    'npm run prebuild',
    'npm run postbuild',
    'npm run prepare',
    'npm run test',
    'npm run build:app',
    'npm run',
    'npm run-script build',
    'env NODE_ENV=production npm run postinstall --prefix ./node_modules/unapproved',
    'command npm run build --workspace src/app',
    'timeout 5 npm run install --prefix ./node_modules/unapproved',
    `sh -c 'npm run build --prefix ./node_modules/unapproved'`,
  ])('rejects Docker npm run scripts and flags outside the exact root build: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(['sh', '-c', command])}`),
    ).toThrow();
  });

  it.each([
    { command: ['npm', 'run', 'postinstall', '--prefix', './node_modules/unapproved'] },
    { command: ['npm', 'run', 'install', '--prefix', './node_modules/unapproved'] },
    { command: ['npm', 'run', 'build', '--prefix=./node_modules/unapproved'] },
    { command: ['npm', 'run', 'build', '--workspace', 'src/app'] },
    { command: ['npm', 'run', 'prebuild'] },
    { command: ['timeout', '5', 'npm', 'run', 'build', '--workspaces'] },
    { command: ['env', 'npm_config_prefix=/tmp/unapproved', 'npm', 'run', 'build'] },
    { command: ['env', 'NPM_CONFIG_WORKSPACE=src/app', 'npm', 'run', 'build'] },
  ])('rejects Docker npm run package selection in exec form: $command', ({ command }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it.each([
    'RUN npm_config_prefix=./node_modules/unapproved npm run build',
    'RUN NPM_CONFIG_PREFIX=/tmp/unapproved npm run build',
    'RUN npm_config_workspace=src/app npm run build',
    'RUN NPM_CONFIG_WORKSPACE=src/app npm run build',
    'RUN npm_config_workspaces=true npm run build',
    'RUN npm_config_include_workspace_root=true npm run build',
    'RUN npm_config_global=true npm run build',
    'RUN npm_config_location=global npm run build',
    'RUN npm_config_userconfig=/tmp/unsafe.npmrc npm run build',
    'RUN NPM_CONFIG_GLOBALCONFIG=/tmp/unsafe.npmrc npm run build',
    'RUN env npm_config_prefix=/tmp/unapproved npm run build',
    'ENV npm_config_prefix=/tmp/unapproved\nRUN npm run build',
    'ENV NPM_CONFIG_WORKSPACES=true\nRUN npm run build',
    'ARG npm_config_prefix\nRUN npm run build',
  ])('rejects Docker npm environment that redirects the root package build: %s', (override) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\n${override}`)).toThrow();
  });

  it.each([
    'WORKDIR /app/node_modules/unapproved\nRUN npm run build',
    'WORKDIR /tmp/unapproved\nRUN npm run build',
    'WORKDIR node_modules/unapproved\nRUN npm run build',
    'WORKDIR $UNAPPROVED_DIRECTORY\nRUN npm run build',
    `WORKDIR /app/node_modules/unapproved\nRUN ${JSON.stringify(['npm', 'run', 'build'])}`,
    'FROM node:24-alpine AS other\nRUN npm run build',
  ])('rejects Docker npm builds run outside the declared root directory: %s', (override) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`FROM node:24-alpine\nWORKDIR /app\n${safe}\n${override}`),
    ).toThrow();
  });

  it('allows only the exact Docker npm root build with benign environments and wrappers', () => {
    const commands = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN npm run build',
      'RUN NODE_ENV=production npm run build',
      'RUN env NPM_CONFIG_LOGLEVEL=silent npm run build',
      `RUN sh -c 'npm run build'`,
      `RUN ${JSON.stringify(['npm', 'run', 'build'])}`,
      'WORKDIR /tmp',
      'RUN echo ready',
      'WORKDIR /app',
      'RUN timeout 5 npm run build',
      `RUN echo 'npm run postinstall --prefix ./node_modules/unapproved'`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    `printf '%s' '{"scripts":{"build":"npm ci"}}' > package.json`,
    `printf '%s' '{"scripts":{"build":"npm ci"}}' > ./package.json`,
    `printf '%s' '{"scripts":{"build":"npm ci"}}'>/app/package.json`,
    `printf '%s' '{"scripts":{"build":"npm ci"}}' >> /tmp/../app/package.json`,
    `echo '{"scripts":{"build":"npm ci"}}' | tee package.json`,
    `ln -sf /tmp/evil.json /app/package.json`,
    `chmod +x package.json`,
    `find /tmp -fprintf /app/package.json replacement`,
    `printf '%s' replacement > package-lock.json`,
    `printf '%s' replacement > npm-shrinkwrap.json`,
    `printf '%s' replacement > .npmrc`,
    `printf '%s' replacement > /root/.npmrc`,
    `printf '%s' replacement > /usr/local/etc/npmrc`,
    `printf '%s' replacement > ./scripts/postbuild.ts`,
    `printf '%s' replacement > tsdown.config.ts`,
    `printf '%s' replacement > src/app/package.json`,
    `printf '%s' replacement > src/app/vite.config.ts`,
    `printf '%s' replacement > ./node_modules/esbuild/install.js`,
    `printf '%s' replacement > ./node_modules/@swc/core/postinstall.js`,
    `printf '%s' replacement > ./node_modules/.bin/concurrently`,
  ])('rejects unaudited Docker writers that can replace npm build control files: %s', (write) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${write}\nRUN npm run build`),
    ).toThrow();
  });

  it.each([
    './node_modules/esbuild/package.json',
    './node_modules/@swc/core/package.json',
    '/app/node_modules/esbuild/package.json',
  ])('rejects a rewritten allowlisted Docker rebuild package: %s', (manifest) => {
    const ci = 'RUN npm ci --ignore-scripts';
    const rewrite = `RUN printf '%s' '{"name":"esbuild","version":"1.0.0","scripts":{"postinstall":"npm ci --prefix /app"}}' > ${manifest}`;
    const rebuild = 'RUN npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${ci}\n${rewrite}\n${rebuild}`)).toThrow();
  });

  it.each([
    'COPY generated.json ./package.json',
    'COPY --from=unapproved /app/package.json /app/package.json',
    'COPY ./generated/ .',
    `COPY ${JSON.stringify(['generated.json', '/app/package.json'])}`,
    'COPY generated $DESTINATION',
    'ADD https://example.invalid/package.json /app/package.json',
  ])('rejects unaudited Docker copy sources for npm build control files: %s', (copy) => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      copy,
      'RUN npm run build',
    ].join('\n');
    expect(() => validateDockerInstallCommands(dockerfile)).toThrow();
  });

  it('rejects exec-form writers and relative writes outside /app that resolve into npm controls', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const write = `RUN ${JSON.stringify(['tee', 'package.json'])}`;
    expect(() => validateDockerInstallCommands(`${safe}\n${write}\nRUN npm run build`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(
        `FROM node:24-alpine\nWORKDIR /app\n${safe}\nWORKDIR /tmp\nRUN printf %s replacement > ../app/package.json\nWORKDIR /app\nRUN npm run build`,
      ),
    ).toThrow();
    expect(() =>
      validateDockerInstallCommands(
        `FROM node:24-alpine\nWORKDIR /app\n${safe}\nWORKDIR /app/node_modules/esbuild\nCOPY package.json package-lock.json ./\nWORKDIR /app\nRUN npm run build`,
      ),
    ).toThrow();
  });

  it('allows audited Docker source copies, runtime symlink maintenance, and scratch data writes', () => {
    const commands = [
      'FROM node:24-alpine AS builder',
      'WORKDIR /app',
      'COPY package.json package-lock.json ./',
      'COPY src/app/package.json ./src/app/package.json',
      'COPY site/package.json ./site/package.json',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'COPY . .',
      'RUN npm run build',
      'FROM node:24-alpine AS server',
      'WORKDIR /app',
      'COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules',
      'COPY --from=builder --chown=promptfoo:promptfoo /app/package.json ./package.json',
      'COPY --from=builder --chown=promptfoo:promptfoo /app/dist ./dist',
      'COPY scratch.txt /tmp/scratch.txt',
      'RUN ln -s /app /app/node_modules/promptfoo && chown -h promptfoo:promptfoo /app/node_modules/promptfoo',
      `RUN echo package.json && printf %s ./node_modules/esbuild/package.json`,
      'WORKDIR /tmp',
      'RUN printf %s harmless > scratch.txt && chmod +x scratch.txt',
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it('rejects Docker npm ancestor fallback after find removes the local project boundary', () => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      `RUN printf '%s' '{"scripts":{"build":"npm run postinstall --prefix /tmp/unapproved"}}' > /package.json`,
      'RUN find /app/node_modules -delete',
      'RUN find /app -maxdepth 1 -name package.json -delete',
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).toThrow();
  });

  it.each([
    '/package.json',
    '/package-lock.json',
    '/npm-shrinkwrap.json',
    '/.npmrc',
    '/node_modules',
    '/node_modules/.package-lock.json',
    '/node_modules/npm/package.json',
    '/tmp/../package.json',
    '../package.json',
    '../node_modules/npm/package.json',
  ])('rejects Docker writes to npm control paths above the audited project: %s', (target) => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      `RUN printf '%s' replacement > ${target}`,
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).toThrow();
  });

  it.each([
    'RUN echo replacement | tee /package.json',
    'RUN ln -sf /tmp/replacement /package-lock.json',
    'RUN chmod +w /npm-shrinkwrap.json',
    'RUN chown root /node_modules',
    'RUN mkdir -p /node_modules/npm',
    'RUN find /tmp -fprintf /package.json replacement',
    'COPY replacement.json /package.json',
    'COPY dependencies /node_modules',
    'COPY ancestor-controls/ /',
    `RUN ${JSON.stringify(['tee', '/package.json'])}`,
  ])('rejects other Docker writers targeting npm ancestor controls: %s', (instruction) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const dockerfile = `FROM node:24-alpine\nWORKDIR /app\n${safe}\n${instruction}\nRUN npm run build`;
    expect(() => validateDockerInstallCommands(dockerfile)).toThrow();
  });

  it.each([
    'find /app/node_modules -delete',
    'find /app -maxdepth 1 -name package.json -delete',
    `find /app '-delete'`,
    String.raw`find /app -de\lete`,
    'find /tmp -name package.json -delete',
    `find /tmp -name '-delete' -o -delete`,
    'busybox find /app -delete',
    'command find /app -delete',
    'timeout 5 find /app -delete',
    String.raw`find /app -exec rm -rf {} \;`,
  ])('rejects destructive Docker find actions independently of ancestor writes: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const dockerfile = `FROM node:24-alpine\nWORKDIR /app\n${safe}\nRUN ${command}\nRUN npm run build`;
    expect(() => validateDockerInstallCommands(dockerfile)).toThrow();
  });

  it('rejects destructive Docker find in exec form', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const command = ['find', '/app', '-maxdepth', '1', '-name', 'package.json', '-delete'];
    expect(() =>
      validateDockerInstallCommands(
        `FROM node:24-alpine\nWORKDIR /app\n${safe}\nRUN ${JSON.stringify(command)}`,
      ),
    ).toThrow();
  });

  it('keeps read-only Docker find operations and unrelated root or scratch files auditable', () => {
    const commands = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN find /app -maxdepth 1 -name package.json -print',
      `RUN find /tmp -name '-delete' -print`,
      'RUN find /tmp -depth -name scratch -print',
      'RUN printf %s harmless > /scratch-control && chmod +x /scratch-control',
      'RUN printf %s harmless > /tmp/scratch-control',
      `RUN echo '/package.json' '/node_modules' '-delete'`,
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    '/proc/self/root/package.json',
    '/proc/self/root/app/package.json',
    '/proc/self/cwd/package.json',
    '/proc/self/cwd/../package.json',
    '/proc/thread-self/root/package-lock.json',
    '/proc/1/root/npm-shrinkwrap.json',
    '/proc/self/task/1/root/node_modules/npm/package.json',
    '/dev/fd/3',
    '/dev/fd/../root/package.json',
  ])('rejects Docker writes through process-root and descriptor aliases: %s', (target) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(
        `FROM node:24-alpine\nWORKDIR /app\n${safe}\nRUN printf %s replacement > ${target}\nRUN npm run build`,
      ),
    ).toThrow();
  });

  it.each([
    ['ln -s .. /tmp/ancestor', '/tmp/ancestor/package.json'],
    ['ln -s app /scratch-alias', '/scratch-alias/package.json'],
    ['ln -s /tmp /tmp/scratch/alias', '/tmp/scratch/alias/../package.json'],
  ])('rejects Docker scratch symlink escapes via %s', (link, destination) => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN mkdir -p /tmp/scratch',
      'WORKDIR /tmp/scratch',
      `RUN ${link}`,
      'WORKDIR /app',
      `RUN printf %s replacement > ${destination}`,
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).toThrow();
  });

  it.each([
    String.raw`find /app -maxdepth 1 -name package.json -exec ln -sf /tmp/unsafe.json '{}' \;`,
    String.raw`find /app -maxdepth 1 -name package.json -exec tee '{}' \;`,
    String.raw`find /app -maxdepth 1 -name package.json -execdir chmod +w '{}' \;`,
    String.raw`find /app -maxdepth 1 -name package.json -ok chown root '{}' \;`,
    String.raw`find /app -maxdepth 1 -name package.json -okdir command tee '{}' \;`,
    String.raw`find / -maxdepth 1 -name app -exec tee '{}/package.json' \;`,
    String.raw`find /app -exec printf %s harmless \; -delete`,
    'find /app -unsupported-with-unknown-arity -name -delete',
  ])(
    'rejects Docker find commands with dynamic writer targets or disguised actions: %s',
    (command) => {
      const dockerfile = [
        'FROM node:24-alpine',
        'WORKDIR /app',
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
        'WORKDIR /tmp',
        `RUN ${command}`,
        'WORKDIR /app',
        'RUN npm run build',
      ];
      expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).toThrow();
    },
  );

  it('allows Docker find placeholders and action-looking operands only as harmless data', () => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      String.raw`RUN find /tmp -exec echo '{}' \;`,
      String.raw`RUN find /tmp -exec printf %s '-delete' \;`,
      `RUN find /tmp -iname '-delete' -print`,
      `RUN find /tmp -path '-delete' -print`,
      `RUN find /tmp -printf '-delete'`,
      'WORKDIR /tmp',
      'RUN printf %s scratch > ./scratch-data && printf %s discarded > /dev/null',
      'RUN ln -s /tmp/scratch-data /tmp/scratch-alias',
      'WORKDIR /app',
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).not.toThrow();
  });

  it.each([
    String.raw`find /app -maxdepth 1 -name package.json -execdir tee package.json \;`,
    String.raw`find /app -maxdepth 1 -name package.json -execdir chmod +w package.json \;`,
    String.raw`find /app -maxdepth 1 -name package.json -okdir command tee package.json \;`,
    String.raw`find /app -maxdepth 1 -name package.json -execdir sh -c 'printf %s replacement > package.json' \;`,
    JSON.stringify([
      'find',
      '/app',
      '-name',
      'package.json',
      '-execdir',
      'tee',
      'package.json',
      ';',
    ]),
  ])('rejects Docker find working-directory changes for relative writers: %s', (command) => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'WORKDIR /tmp',
      `RUN ${command}`,
      'WORKDIR /app',
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).toThrow();
  });

  it('allows Docker find directory delegation for read-only or absolute scratch operations', () => {
    const dockerfile = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      String.raw`RUN find /app -maxdepth 1 -name package.json -execdir echo package.json \;`,
      String.raw`RUN find /app -maxdepth 1 -name package.json -execdir tee /tmp/scratch-output \;`,
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(dockerfile.join('\n'))).not.toThrow();
  });

  it.each([
    'ONBUILD RUN npm ci',
    `ONBUILD RUN ${JSON.stringify(['npm', 'ci'])}`,
    'ONBUILD RUN npm run build --prefix ./node_modules/unapproved',
    'ONBUILD ENV NODE_OPTIONS=--require=/tmp/preload.cjs',
    'ONBUILD COPY generated.json /app/package.json',
  ])('rejects unaudited Docker ONBUILD triggers: %s', (trigger) => {
    const dockerfile = [
      'FROM node:24-alpine AS base',
      'WORKDIR /app',
      'COPY . .',
      trigger,
      'FROM base AS child',
      'WORKDIR /app',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
    ].join('\n');
    expect(() => validateDockerInstallCommands(dockerfile)).toThrow();
  });

  it.each([
    '--mount=type=bind,source=script,target=/usr/local/bin/node node --version',
    '--mount=type=bind,from=payload,source=/tmp/launcher,target=/usr/local/bin/npx /usr/local/bin/npx --version',
    '--mount=type=bind,from=payload,source=/tmp/manifest.json,target=/app/package.json npm run build',
    '--mount=type=bind,source=.,target=/app npm run build',
    '--mount=type=tmpfs,target=/app npm run build',
    '--mount=type=secret,id=manifest,target=/app/package.json npm run build',
    '--mount=type=cache,target=/app/node_modules npm run build',
    '--mount=type=cache,target=/root/.npm,from=payload npm ci --ignore-scripts',
    '--mount=target=/root/.npm,type=cache npm ci --ignore-scripts',
    '--mount=type=cache,target=/root/.npm --mount=type=bind,source=.,target=/app npm run build',
    '--mount=type=bind,source=.,target=/app --mount=type=cache,target=/root/.npm npm run build',
    '--mount=type=cache,target=/root/.npm --mount=type=cache,target=/root/.npm npm ci --ignore-scripts',
    '--network=host npm run build',
    '--security=insecure npm run build',
    `--mount=type=bind,source=script,target=/usr/local/bin/node ${JSON.stringify(['node', '--version'])}`,
  ])(
    'rejects Docker RUN options and mounts that can replace trusted execution inputs: %s',
    (body) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      expect(() =>
        validateDockerInstallCommands(`FROM node:24-alpine\nWORKDIR /app\n${safe}\nRUN ${body}`),
      ).toThrow();
    },
  );

  it('allows only the existing Docker npm cache mount in shell and exec form', () => {
    const commands = [
      'FROM node:24-alpine',
      'WORKDIR /app',
      'RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts',
      `RUN --mount=type=cache,target=/root/.npm ${JSON.stringify(['npm', 'ci', '--ignore-scripts'])}`,
      'RUN npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN npm run build',
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    `git -c alias.install='!npm ci' install`,
    `git -c 'alias.install=!npm ci' install`,
    `git -calias.install='!npm ci' install`,
    `git -c alias.install='!n'p'm ci' install`,
    `git -c alias.install='!f() { npm ci; }; f' install`,
    `git -c alias.install='!date' install`,
    `git -c alias.first=second -c alias.second='!npm ci' first`,
    `ALIAS_BODY='!npm ci' git --config-env=alias.install=ALIAS_BODY install`,
    `git --config-env=alias.install=ALIAS_FROM_IMAGE install`,
    `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.install GIT_CONFIG_VALUE_0='!npm ci' git install`,
    `env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.install GIT_CONFIG_VALUE_0='!npm ci' git install`,
    `GIT_CONFIG_PARAMETERS="'alias.install=!npm ci'" git install`,
    'GIT_CONFIG_GLOBAL=/tmp/unsafe-gitconfig git install',
    'GIT_CONFIG_SYSTEM=/tmp/unsafe-gitconfig git install',
    'git -c include.path=/tmp/unsafe-gitconfig install',
    'git install',
    `git config --global alias.install '!npm ci'`,
    `git config --file /tmp/unsafe-gitconfig alias.install '!npm ci'`,
    `command git -c alias.install='!npm ci' install`,
    `timeout 5 git -c alias.install='!npm ci' install`,
    `custom-wrapper git -c alias.install='!npm ci' install`,
    'custom-wrapper git install',
    `sh -c "git -c alias.install='!npm ci' install"`,
    `echo "$(git -c alias.install='!npm ci' install)"`,
  ])('rejects executable Docker Git aliases and sourced configuration: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(['sh', '-c', command])}`),
    ).toThrow();
  });

  it('rejects Docker Git aliases sourced from an earlier RUN or Docker environment', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const config = String.raw`RUN printf '%s\n' '[alias]' 'install = !npm ci' > /tmp/unsafe-gitconfig`;
    for (const source of [
      'RUN git -c include.path=/tmp/unsafe-gitconfig install',
      'RUN GIT_CONFIG_GLOBAL=/tmp/unsafe-gitconfig git install',
      'ENV GIT_CONFIG_GLOBAL=/tmp/unsafe-gitconfig\nRUN git install',
    ]) {
      expect(() => validateDockerInstallCommands(`${safe}\n${config}\n${source}`)).toThrow();
    }
  });

  it.each([
    { command: ['git', '-c', 'alias.install=!npm ci', 'install'] },
    { command: ['git', '--config-env=alias.install=ALIAS_FROM_IMAGE', 'install'] },
    { command: ['git', 'install'] },
    { command: ['git', 'config', '--global', 'alias.install', '!npm ci'] },
    {
      command: [
        'env',
        'GIT_CONFIG_COUNT=1',
        'GIT_CONFIG_KEY_0=alias.install',
        'GIT_CONFIG_VALUE_0=!npm ci',
        'git',
        'install',
      ],
    },
    { command: ['timeout', '5', 'git', '-c', 'alias.install=!npm ci', 'install'] },
    { command: ['custom-wrapper', 'git', 'install'] },
    { command: ['custom-wrapper', '--config', 'handler=!npm ci'] },
    { command: ['custom-wrapper', '--payload', 'echo ready && npm ci'] },
  ])('rejects embedded Docker execution payloads in exec form: $command', ({ command }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it.each([
    `custom-wrapper --config='handler=!npm ci'`,
    `custom-wrapper --handler '!npm ci'`,
    `custom-wrapper --handler '!date'`,
    `custom-wrapper --payload 'npm ci'`,
    `custom-wrapper --payload 'npm --silent ci'`,
    `custom-wrapper --payload 'echo ready && npm ci'`,
    `custom-wrapper --payload 'echo ready; /usr/bin/npm ci'`,
    `custom-wrapper --payload 'handler=!n'p'm ci'`,
    `custom-wrapper --payload 'handler=!npx -c npm'`,
    `custom-wrapper --exec='npm rebuild esbuild'`,
  ])('rejects recognized Docker shell payloads under an arbitrary consumer: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
  });

  it.each([
    `test 'handler=!npm ci'`,
    `date --date='npm ci'`,
    `apk --command='echo ready && npm ci'`,
  ])('checks embedded Docker execution payloads in audited non-data consumers: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow(
      /embedded shell execution payload/,
    );
  });

  it('allows Docker Git version controls and direct shell-payload data', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN git --version && git -v && git version && git --no-pager --version',
      'RUN env git --version && timeout 5 git --version && command -v git',
      'RUN apk add git',
      `RUN echo 'alias.install=!npm ci' '!npm ci' 'npm ci'`,
      `RUN printf '%s' '!date' 'npm --silent ci' 'echo ready && npm ci'`,
      `RUN ${JSON.stringify(['git', '--version'])}`,
      `RUN ${JSON.stringify(['echo', 'handler=!npm ci'])}`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    'builddeps',
    'BUILD_FLAG=1 builddeps',
    'env BUILD_FLAG=1 builddeps',
    'command builddeps',
    'exec builddeps',
    'timeout 5 builddeps',
    String.raw`find /tmp -exec builddeps \;`,
    "sh -c 'builddeps'",
  ])('rejects an unaudited generated Docker executable found through PATH: %s', (execute) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const write = String.raw`printf '%s\n' '#!/bin/sh' 'npm ci' > /usr/local/bin/builddeps && chmod +x /usr/local/bin/builddeps`;
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write} && ${execute}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write}\nRUN ${execute}`)).toThrow();
  });

  it.each([
    { command: ['builddeps'] },
    { command: ['env', 'BUILD_FLAG=1', 'builddeps'] },
    { command: ['timeout', '5', 'builddeps'] },
    { command: ['find', '/tmp', '-exec', 'builddeps', ';'] },
    { command: ['sh', '-c', 'builddeps'] },
    { command: ['env', 'PATH=/tmp:/usr/bin', 'npm', 'ci', '--ignore-scripts'] },
  ])('rejects unaudited Docker PATH dispatch in exec form: $command', ({ command }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it.each([
    'RUN PATH=/tmp:$PATH npm ci --ignore-scripts',
    'RUN PATH=/tmp:$PATH; npm ci --ignore-scripts',
    'RUN env PATH=/tmp:/usr/bin npm ci --ignore-scripts',
    `RUN env 'PATH=/tmp:/usr/bin' npm ci --ignore-scripts`,
    'RUN export PATH=/tmp:$PATH; npm ci --ignore-scripts',
    'RUN readonly PATH=/tmp:$PATH; npm ci --ignore-scripts',
    `RUN sh -c 'PATH=/tmp:$PATH; npm ci --ignore-scripts'`,
    'ENV PATH=/tmp:$PATH\nRUN npm ci --ignore-scripts',
    'ENV PATH /tmp:/usr/bin\nRUN npm ci --ignore-scripts',
    'ENV OTHER=1 PATH=/tmp:/usr/bin\nRUN npm ci --ignore-scripts',
    'ENV OTHER=1 \\\n    PATH=/tmp:/usr/bin\nRUN npm ci --ignore-scripts',
    'ARG PATH=/tmp:/usr/bin\nRUN npm ci --ignore-scripts',
  ])('rejects Docker PATH overrides that can shadow audited commands: %s', (override) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\n${override}`)).toThrow();
  });

  it('allows audited Docker utilities, terminal dispatch, and textual PATH values', () => {
    const commands = [
      'ENV MESSAGE="note PATH=/tmp" OTHER=1',
      'ARG MESSAGE=PATH=/tmp',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN apk add npm && addgroup -S app && adduser -S app -G app',
      'RUN ln -s /tmp/a /tmp/b && chmod +x /tmp/b && chown app /tmp/b && mkdir -p /tmp/c',
      'RUN date | tee /tmp/date && [ -f /tmp/date ] && true || false',
      'RUN timeout 5 node --version && find /tmp -name builddeps',
      'RUN command -v builddeps',
      `RUN echo 'PATH=/tmp' builddeps && printf '%s' 'PATH=/tmp:$PATH'`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    `printf '%s' 'npm ci' > /usr/local/bin/date && date`,
    `printf '%s' 'npm ci' >/usr/local/bin/date && date`,
    `printf '%s' 'npm ci'>/usr/local/bin/date && date`,
    `printf '%s' 'npm ci' >> /usr/local/bin/date && date`,
    `printf '%s' 'npm ci' > /tmp/../usr/local/bin/date && date`,
    `printf '%s' 'npm ci' > "$UNKNOWN_DESTINATION" && date`,
    `echo 'npm ci' | tee /usr/local/bin/date && date`,
    `ln -sf /tmp/payload /usr/local/bin/date && date`,
    `ln -t /usr/local/bin /tmp/date && date`,
    `chmod +x /usr/local/bin/date && date`,
    `chown app /usr/local/bin/date && date`,
    `mkdir -p /usr/local/bin/date && date`,
    `find /tmp -fprintf /usr/local/bin/date 'npm ci' && date`,
  ])(
    'rejects Docker writes that can shadow an audited binary on the default PATH: %s',
    (command) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    },
  );

  it('rejects Docker exec-form filesystem writers aimed at the system PATH', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const command = ['tee', '/usr/local/bin/date'];
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it('allows the Dockerfile symlinks and system executable path text used as data', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN ln -sf python3 /usr/bin/python',
      'RUN ln -s /app/dist/src/entrypoint.js /usr/local/bin/promptfoo',
      'RUN ln -s /app/dist/src/entrypoint.js /usr/local/bin/pf',
      `RUN echo '>/usr/local/bin/date' && printf '%s' /usr/local/bin/date`,
      `RUN ${JSON.stringify(['echo', '>/usr/local/bin/date'])}`,
      `RUN printf '%s' harmless > /tmp/date && chmod +x /tmp/date`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    `'trap' 'npm ci' EXIT`,
    `"trap" 'npm ci' EXIT`,
    String.raw`tr\ap 'npm ci' EXIT`,
    `t'r'ap 'npm ci' EXIT`,
    `'trap' 'date' EXIT`,
    `sh -c "'trap' 'npm ci' EXIT"`,
    `'alias' 'install=npm ci'`,
    `'builtin' eval 'npm ci'`,
  ])(
    'rejects quoted and escaped Docker shell builtins capable of delayed execution: %s',
    (command) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
      expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
      expect(() =>
        validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(['sh', '-c', command])}`),
      ).toThrow();
    },
  );

  it.each([
    'RUN NODE_OPTIONS=--require=/tmp/preload.cjs node --check scripts/update-changelog-version.cjs',
    'RUN env NODE_OPTIONS=--require=/tmp/preload.cjs node --check scripts/update-changelog-version.cjs',
    'RUN export NODE_OPTIONS=--require=/tmp/preload.cjs; node --check scripts/update-changelog-version.cjs',
    'ENV NODE_OPTIONS=--require=/tmp/preload.cjs\nRUN node --check scripts/update-changelog-version.cjs',
    'ENV NODE_ENV=production NODE_OPTIONS=--import=/tmp/preload.mjs\nRUN node --version',
    'ARG NODE_OPTIONS\nRUN node --check scripts/update-changelog-version.cjs',
    'RUN BASH_ENV=/tmp/bash-hook bash -c true',
    'ENV BASH_ENV=/tmp/bash-hook\nRUN bash -c true',
    'RUN ENV=/tmp/shell-hook sh -c true',
    'ENV ENV=/tmp/shell-hook\nRUN sh -c true',
    'RUN ZDOTDIR=/tmp/zsh-config zsh -c true',
    'RUN PYTHONPATH=/tmp/python-hook python3 --help',
    'ENV PYTHONSTARTUP=/tmp/python-hook\nRUN python3 --help',
    'RUN RUBYOPT=-r/tmp/ruby-hook ruby --version',
    'ENV PERL5OPT=-MInjected\nRUN perl --version',
    'RUN PHPRC=/tmp/php.ini php --version',
    'ENV LUA_INIT_5_4=@/tmp/lua-hook\nRUN lua --version',
    'RUN LD_PRELOAD=/tmp/hook.so node --version',
    'ENV LD_LIBRARY_PATH=/tmp\nRUN node --version',
    'RUN npm_config_script_shell=/tmp/hook npm run build',
  ])(
    'rejects Docker environment variables that can execute interpreter startup code: %s',
    (override) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      const preload = `RUN printf '%s' 'require("node:child_process").execSync("npm ci")' > /tmp/preload.cjs`;
      expect(() => validateDockerInstallCommands(`${safe}\n${preload}\n${override}`)).toThrow();
    },
  );

  it('rejects Docker exec-form interpreter preload environments', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const command = [
      'env',
      'NODE_OPTIONS=--require=/tmp/preload.cjs',
      'node',
      '--check',
      'index.js',
    ];
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it('allows benign Docker interpreter environments and direct builtin or preload text', () => {
    const commands = [
      'ENV NODE_ENV=production MESSAGE="example NODE_OPTIONS=--require=/tmp/example"',
      'ARG PYTHON_VERSION=3',
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN NODE_ENV=production node --check scripts/update-changelog-version.cjs',
      'RUN env NODE_ENV=production node --version',
      `RUN echo 'trap npm ci EXIT' 'NODE_OPTIONS=--require=/tmp/example'`,
      `RUN printf '%s' 'BASH_ENV=/tmp/example' 'PYTHONPATH=/tmp/example'`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    { target: '/tmp/install', execute: '/tmp/install' },
    { target: '/tmp/install', execute: '"/tmp/install"' },
    { target: '/tmp/install', execute: 'FLAG=1 /tmp/install' },
    { target: '/tmp/install', execute: '(/tmp/install)' },
    { target: '/tmp/install', execute: '> /dev/null /tmp/install' },
    { target: '/tmp/install', execute: '2>/dev/null /tmp/install' },
    { target: '/tmp/install', execute: 'env FLAG=1 /tmp/install' },
    { target: '/tmp/install', execute: 'command /tmp/install' },
    { target: '/tmp/install', execute: 'exec /tmp/install' },
    { target: '/tmp/install', execute: 'timeout 5 /tmp/install' },
    { target: '/tmp/install', execute: 'setsid /tmp/install' },
    { target: '/tmp/install', execute: String.raw`find /tmp -exec /tmp/install \;` },
    { target: '/tmp/install', execute: "sh -c '/tmp/install'" },
    { target: './install', execute: './install' },
    { target: 'scripts/install', execute: 'scripts/install' },
    { target: './node_modules/.bin/install', execute: './node_modules/.bin/install' },
    { target: '/tmp/sh', execute: '/tmp/sh -c true' },
    { target: '/tmp/node', execute: '/tmp/node --version' },
  ])('rejects an unaudited generated Docker executable: $execute', ({ target, execute }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const write = `printf '%s\\n' '#!/bin/sh' 'npm ci' > ${target} && chmod +x ${target}`;
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write} && ${execute}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${write} && ${execute}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write}\nRUN ${execute}`)).toThrow();
  });

  it.each([
    { command: ['/tmp/install'] },
    { command: ['./install'] },
    { command: ['scripts/install'] },
    { command: ['/tmp/sh', '-c', 'true'] },
    { command: ['/tmp/node', '--version'] },
    { command: ['env', 'FLAG=1', '/tmp/install'] },
    { command: ['timeout', '5', '/tmp/install'] },
    { command: ['sh', '-c', '/tmp/install'] },
  ])('rejects an unaudited Docker executable in exec form: $command', ({ command }) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it('allows audited Docker shell and interpreter paths and path arguments used as data', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      "RUN /bin/sh -c 'echo ready' && /bin/bash -c 'printf %s ready'",
      'RUN /usr/local/bin/node --version && /usr/bin/python3 --version',
      'RUN timeout 5 /usr/local/bin/node --version',
      'RUN chmod +x /tmp/install && ln -s /tmp/install /tmp/link && echo /tmp/install',
      'RUN find /tmp -name install',
      'RUN [ -f /tmp/install ] || printf %s /tmp/install',
      `RUN ${JSON.stringify(['/bin/sh', '-c', 'echo ready'])}`,
      `RUN ${JSON.stringify(['echo', '/tmp/install'])}`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    `$(printf '%s' npm ) ci`,
    '$(printf %s n p m) ci',
    'n$(printf %s p)m ci',
    `FOO=1 $(printf '%s' npm) ci`,
    '$(echo $(printf %s npm)) ci',
    '$(printf %s "$(printf %s npm)") ci',
    '"$(printf %s npm)" ci',
    'env "$(printf %s n p m)" ci',
    'setsid "$(printf %s n p m)" ci',
    'custom-wrapper "$(printf %s n p m)" ci',
    'echo "$(env $INSTALLER ci)"',
    'echo "$( $(printf %s n p m) ci)"',
    "`printf '%s' npm` ci",
    '`printf %s n p m` ci',
    '`echo $(printf %s npm)` ci',
    '`echo \\`printf %s npm\\`` ci',
    'echo "`$(printf %s n p m) ci`"',
    `sh -c '$(printf %s npm) ci'`,
    `timeout 5 sh -c '$(printf %s npm) ci'`,
  ])('rejects Docker command substitutions that can supply an executable: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(['sh', '-c', command])}`),
    ).toThrow();
  });

  it('allows auditable quoted Docker substitution arguments and literal substitution text', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN echo "$(date)" "$(echo npm ci)" "$(date) npm ci"',
      `RUN printf %s "$(printf '%s' npm)"`,
      "RUN echo '$(npm ci)' '`npm ci`'",
      String.raw`RUN echo "\$(npm ci)"`,
      'RUN echo ready # $(npm ci)',
      `RUN ${JSON.stringify(['echo', '$(npm ci)', '`npm ci`'])}`,
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    String.raw`node -e "require(\"node:child_process\").execSync(\"npm ci\")"`,
    String.raw`/usr/local/bin/node --eval 'require("node:child_process").execFileSync("npm", ["ci"])'`,
    String.raw`node -p 'require("node:child_process").execSync(["n","p","m"].join("")+" ci")'`,
    String.raw`python3 -c 'import os; os.system("npm ci")'`,
    String.raw`python3 -Ic 'import subprocess; subprocess.run(["sh", "-c", "npm ci"], check=True)'`,
    String.raw`sh -c 'node -e "require(\"child_process\").execSync(\"npm ci\")"'`,
    String.raw`printf '%s' 'require("node:child_process").execSync("npm ci")' | node`,
    String.raw`env FOO=bar python -c 'import os; os.system("npm ci")'`,
    String.raw`timeout 5 node -e 'require("child_process").execSync("npm ci")'`,
    String.raw`time node -e 'require("child_process").execSync("npm ci")'`,
    String.raw`awk 'BEGIN { system("npm ci") }'`,
    String.raw`ruby -ne 'system("npm ci")'`,
    String.raw`php -nr 'system("npm ci");'`,
  ])('rejects inline Docker interpreter code that can execute npm: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
  });

  it.each([
    ['node', '-e', 'require("node:child_process").execSync("npm ci")'],
    ['python3', '-c', 'import subprocess; subprocess.run(["npm", "ci"], check=True)'],
  ])('rejects inline Docker exec-form interpreter code: %s', (interpreter, flag, program) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify([interpreter, flag, program])}`),
    ).toThrow();
  });

  it.each([
    String.raw`printf %s "require(\"node:child_process\").execSync(\"npm ci\")" | node --input-type=commonjs`,
    String.raw`printf %s "import os; os.system(\"npm ci\")" | python3 -B`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | node --no-warnings`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | node --input-type commonjs`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | node --env-file ./config.js`,
    String.raw`printf %s 'import os; os.system("npm ci")' | python3 -I`,
    String.raw`printf %s 'import os; os.system("npm ci")' | python3 -v`,
    String.raw`printf %s 'import os; os.system("npm ci")' | python3 -W ./warnings.py`,
    String.raw`printf %s 'import os; os.system("npm ci")' | env python3 -B`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | timeout 5 node --no-warnings`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | node /dev/stdin`,
    String.raw`printf %s 'import os; os.system("npm ci")' | python3 /dev/stdin`,
    String.raw`printf %s 'require("child_process").execSync("npm ci")' | node --interactive ./script.js`,
    String.raw`printf %s 'import os; os.system("npm ci")' | python3 -i ./script.py`,
  ])('rejects implicit Docker interpreter stdin despite ordinary flags: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
  });

  it.each([
    [`printf '%s' 'import os; os.system("npm ci")' > /tmp/install.py`, 'python3 /tmp/install.py'],
    [
      `printf '%s' 'require("node:child_process").execSync("npm ci")' > /tmp/install.cjs`,
      'node /tmp/install.cjs',
    ],
    [
      `printf '%s' 'require("node:child_process").execSync("npm ci")' > ./scripts/check.js`,
      'node --no-warnings ./scripts/check.js',
    ],
    [
      `printf '%s' 'import os; os.system("npm ci")' > ./scripts/check.py`,
      'env python3 -B ./scripts/check.py',
    ],
    [
      `printf '%s' 'require("node:child_process").execSync("npm ci")' > ./scripts/update-changelog-version.cjs`,
      'node ./scripts/update-changelog-version.cjs',
    ],
    [
      `printf '%s' 'require("node:child_process").execSync("npm ci")' > /tmp/install.mjs`,
      'timeout 5 node -- /tmp/install.mjs',
    ],
    [`printf '%s' 'import os; os.system("npm ci")' > /tmp/install`, 'setsid python3 /tmp/install'],
    [
      `printf '%s' 'require("node:child_process").execSync("npm ci")' > /tmp/install.cjs`,
      'stdbuf -oL node /tmp/install.cjs',
    ],
  ])('rejects generated Docker interpreter files: %s; %s', (write, execute) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write} && ${execute}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${write} && ${execute}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${write}\nRUN ${execute}`)).toThrow();
  });

  it.each([
    ['node', '/tmp/install.cjs'],
    ['node', '--no-warnings', './scripts/check.js'],
    ['node', '--', './scripts/update-changelog-version.cjs'],
    ['python3', '/tmp/install.py'],
    ['python3', '-B', './scripts/check.py'],
    ['env', 'python3', './scripts/check.py'],
    ['timeout', '5', 'node', '/tmp/install.cjs'],
    ['ruby', '/tmp/install.rb'],
  ])('rejects an unaudited Docker exec-form interpreter file: %s', (...command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() =>
      validateDockerInstallCommands(`${safe}\nRUN ${JSON.stringify(command)}`),
    ).toThrow();
  });

  it.each([
    'node --version',
    'node -v',
    'node --help',
    'node --check index.js',
    'node -c ./scripts/check.cjs',
    'node --no-warnings --check ./scripts/check.mjs',
    'node --check /tmp/install.cjs',
    `printf '%s' 'require("node:child_process").execSync("npm ci")' > /tmp/install.cjs && node --check /tmp/install.cjs`,
    'printf %s ready | node --version',
    'printf %s ready | node --check',
    'python3 --version',
    'python3 -V',
    'python3 --help',
    'printf %s ready | python3 --version',
  ])(
    'allows terminal Docker interpreter controls and nonexecuting syntax checks: %s',
    (command) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).not.toThrow();
    },
  );

  it('allows ordinary Docker echo and printf arguments with interpreter or npm text', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      String.raw`RUN echo 'require("node:child_process").execSync("npm ci")'`,
      String.raw`RUN printf '%s' 'import os; os.system("npm ci")'`,
      String.raw`RUN printf '%s' 'sh -c "npm ci"'`,
      'RUN node --version && python3 --version && node --check index.js && timeout 5 node --version',
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it.each([
    'NPM_ARGS=ci; if true; then npm $NPM_ARGS; fi',
    'for n in npm; do "$n" ci; done',
    'NPM_ARGS=ci; if false; then :; elif true; then npm $NPM_ARGS; else :; fi',
    'NPM_ARGS=ci; while true; do npm $NPM_ARGS; break; done',
    'NPM_ARGS=ci; until false; do npm $NPM_ARGS; break; done',
    'NPM_ARGS=ci; case x in x) npm $NPM_ARGS;; esac',
    String.raw`sh -c 'NPM_ARGS=ci; if true; then npm $NPM_ARGS; fi'`,
    String.raw`bash -c 'for n in npm; do "$n" ci; done'`,
    'install() { "$1" ci; }; install npm',
    'install() ( "$1" ci ); install npm',
    'function install { "$1" ci; }; install npm',
    'NPM_ARGS=ci; ! npm "$NPM_ARGS"',
    'NPM_ARGS=ci; { true; npm "$NPM_ARGS"; }',
    'if true; then echo npm; fi',
    'for item in safe; do echo "$item"; done',
    'noop() { echo fine; }; noop',
    'noop() ( echo fine ); noop',
    'coproc worker echo fine',
    String.raw`trap 'npm ci' EXIT`,
    String.raw`alias install='npm ci'`,
    String.raw`bash -c 'builtin eval "npm ci"'`,
    '{ echo fine; }',
    '[[ -n x ]] && echo fine',
  ])('rejects unsupported Docker shell control syntax: %s', (command) => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safe}\nRUN ${command}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe} && ${command}`)).toThrow();
  });

  it('allows Docker control keywords and function-shaped text as ordinary arguments', () => {
    const commands = [
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core',
      'RUN echo if then elif else fi for while until do done case esac function trap alias builtin',
      String.raw`RUN printf %s 'if true; then npm ci; fi'`,
      String.raw`RUN echo 'noop() { npm ci; }'`,
      String.raw`RUN sh -c 'printf %s "for n in npm; do true; done"'`,
      'RUN [ -f /tmp/file ] || echo none',
    ];
    expect(() => validateDockerInstallCommands(commands.join('\n'))).not.toThrow();
  });

  it('does not skip an unsafe command continued in the middle of the executable or hidden in a heredoc', () => {
    const safe =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    const continued = ['RUN n\\', 'pm ci --ignore-scripts=false'].join('\n');
    const heredoc = ['RUN <<EOF', 'npm ci', 'EOF'].join('\n');
    expect(() => validateDockerInstallCommands(`${safe}\n${continued}`)).toThrow();
    expect(() => validateDockerInstallCommands(`${safe}\n${heredoc}`)).toThrow();
  });

  it.each(['# escape=`', 'SHELL ["sh", "-c"]'])(
    'requires an explicit npm audit before changing Docker shell parsing: %s',
    (directive) => {
      const safe =
        'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
      expect(() => validateDockerInstallCommands(`${directive}\n${safe}`)).toThrow();
    },
  );

  it('keeps sharp out of the root install path', () => {
    const packageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');

    expect(packageJson.devDependencies?.sharp).toBeUndefined();
    expect(packageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
    expect(packageLock.packages[''].dependencies?.sharp).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps the Slack SDK optional and aligned with the lockfile', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const sdkName = '@slack/web-api';
    const sdkRange = packageJson.optionalDependencies?.[sdkName];

    expect(sdkRange).toBe('^8.1.1');
    expect(packageJson.dependencies?.[sdkName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[sdkName]).toBe(sdkRange);
    expect(packageLock.packages[`node_modules/${sdkName}`].optional).toBe(true);
    expect(satisfies(packageLock.packages[`node_modules/${sdkName}`].version!, sdkRange!)).toBe(
      true,
    );
  });

  it('publishes the release-age-safe ANSI tokenizer pin for optional Codex Security installs', () => {
    const packageJson = readPackageJson<
      PackageManifest & { overrides?: Record<string, string | Record<string, string>> }
    >('package.json');
    const packageLock =
      readPackageJson<
        PackageLockManifest<PackageManifest & { version?: string; optional?: boolean }>
      >('package-lock.json');
    const dependencyName = '@alcalzone/ansi-tokenize';
    const pinnedVersion = packageJson.optionalDependencies?.[dependencyName];
    const tokenizerPackage = packageLock.packages[`node_modules/${dependencyName}`];
    const inkPackage = packageLock.packages['node_modules/ink'];

    expect(pinnedVersion).toBe('0.3.0');
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageJson.overrides?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(pinnedVersion);
    expect(tokenizerPackage.version).toBe(pinnedVersion);
    expect(tokenizerPackage.optional).toBe(true);
    expect(inkPackage.dependencies?.[dependencyName]).toBeDefined();
    expect(satisfies(pinnedVersion!, inkPackage.dependencies![dependencyName])).toBe(true);
  });

  it('includes every browser loader in the optional production profile', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<PackageManifest & { version?: string; dev?: boolean }>>(
        'package-lock.json',
      );
    const browserSource = fs.readFileSync('src/providers/browser.ts', 'utf8');
    const browserPackages = extractModuleSpecifiers(browserSource, 'src/providers/browser.ts')
      .map(getPackageName)
      .filter((name): name is string => name !== undefined);

    expect(browserPackages).toContain('puppeteer-extra-plugin-stealth');
    for (const dependency of new Set(browserPackages)) {
      const range = packageJson.optionalDependencies?.[dependency];
      expect(
        range,
        `${dependency} must be available to production browser consumers`,
      ).toBeDefined();
      // npm treats a same-root dev + optional declaration as dev-only during
      // `npm ci --omit=dev`, even though packed consumers resolve it as optional.
      expect(packageJson.devDependencies?.[dependency]).toBeUndefined();
      expect(packageLock.packages[''].optionalDependencies?.[dependency]).toBe(range);
      const installed = packageLock.packages[`node_modules/${dependency}`];
      expect(installed?.dev, `${dependency} must survive --omit=dev`).not.toBe(true);
      expect(installed?.version, `${dependency} must have a locked version`).toBeDefined();
      expect(satisfies(installed.version!, range!)).toBe(true);
    }
  });

  it('keeps the Linux Rollup binary optional and aligned with the lockfile', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const binaryName = '@rollup/rollup-linux-x64-gnu';
    const binaryRange = packageJson.optionalDependencies?.[binaryName];
    const binaryPackage = packageLock.packages[`node_modules/${binaryName}`];

    expect(binaryRange).toBeDefined();
    expect(minVersion(binaryRange!)?.compare('4.63.1')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[binaryName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[binaryName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[binaryName]).toBe(binaryRange);
    expect(binaryPackage.optional).toBe(true);
    expect(satisfies(binaryPackage.version!, binaryRange!)).toBe(true);
  });

  it('keeps Anthropic SDK manifests, lock entries, and optional binaries aligned', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const sdkName = '@anthropic-ai/sdk';
    const agentName = '@anthropic-ai/claude-agent-sdk';
    const sdkVersion = packageJson.dependencies?.[sdkName];
    const agentVersion = packageJson.devDependencies?.[agentName];
    const sdkPackage = packageLock.packages[`node_modules/${sdkName}`];
    const agentPackage = packageLock.packages[`node_modules/${agentName}`];

    expect(sdkVersion).toBeDefined();
    expect(agentVersion).toBeDefined();
    expect(sdkPackage, 'the Anthropic SDK must have a lockfile entry').toBeDefined();
    expect(agentPackage, 'the Anthropic agent SDK must have a lockfile entry').toBeDefined();
    expect(minVersion(agentVersion!)?.compare('0.3.233')).toBeGreaterThanOrEqual(0);
    expect(packageJson.optionalDependencies?.[agentName]).toBe(agentVersion);
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBe(sdkVersion);
    expect(packageLock.packages[''].devDependencies?.[agentName]).toBe(agentVersion);
    expect(packageLock.packages[''].optionalDependencies?.[agentName]).toBe(agentVersion);
    expect(sdkPackage.version, 'the Anthropic SDK must have a resolved version').toBeDefined();
    expect(
      satisfies(sdkPackage.version as string, sdkVersion as string),
      'the resolved Anthropic SDK must satisfy its declared dependency range',
    ).toBe(true);
    expect(
      agentPackage.version,
      'the Anthropic agent SDK must have a resolved version',
    ).toBeDefined();
    expect(
      satisfies(agentPackage.version as string, agentVersion as string),
      'the resolved Anthropic agent SDK must satisfy its declared dependency range',
    ).toBe(true);

    for (const [binaryName, binaryVersion] of Object.entries(
      agentPackage.optionalDependencies ?? {},
    )) {
      const binaryPackage = packageLock.packages[`node_modules/${binaryName}`];

      expect(binaryVersion).toBe(agentPackage.version);
      expect(binaryPackage, `${binaryName} must have a lockfile entry`).toBeDefined();
      expect(binaryPackage.version).toBe(agentPackage.version);
    }
  });

  it('keeps the Langfuse client optional and its SDK packages on the supported floor', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const dependencyName = '@langfuse/client';
    const developmentRange = packageJson.devDependencies?.[dependencyName];
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];
    const clientVersion = packageLock.packages[`node_modules/${dependencyName}`].version;

    expect(developmentRange).toBeDefined();
    expect(optionalRange).toBe(developmentRange);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(minVersion(developmentRange!)?.compare('5.11.1')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(clientVersion).toBeDefined();
    expect(satisfies(clientVersion!, developmentRange!)).toBe(true);

    for (const packageName of ['@langfuse/core', '@langfuse/tracing']) {
      expect(packageLock.packages[`node_modules/${packageName}`].version).toBe(clientVersion);
    }
  });

  it('keeps the WatsonX authentication SDK manifest and lockfile on the supported floor', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const dependencyName = 'ibm-cloud-sdk-core';
    const developmentRange = packageJson.devDependencies?.[dependencyName];
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(optionalRange).toBe(developmentRange);
    expect(minVersion(developmentRange!)?.compare('5.6.1')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('5.6.1'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the protobuf runtime aligned with OTLP numeric and UTF-8 fixes', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const protobufRange = packageJson.dependencies?.protobufjs;

    expect(protobufRange).toBeDefined();
    expect(minVersion(protobufRange!)?.compare('8.7.2')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].dependencies?.protobufjs).toBe(protobufRange);
    expect(packageLock.packages['node_modules/protobufjs'].version).toBeDefined();
    expect(
      minVersion(packageLock.packages['node_modules/protobufjs'].version!)?.compare('8.7.2'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps Google Cloud metadata dependencies on the supported Node 22 floor', () => {
    const packageJson = readPackageJson<
      PackageManifest & { overrides?: { mongoose?: Record<string, string> } }
    >('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const dependencyName = 'gcp-metadata';
    const dependencyRange = packageJson.dependencies?.[dependencyName];

    expect(dependencyRange).toBeDefined();
    expect(minVersion(dependencyRange!)?.compare('9.0.2')).toBeGreaterThanOrEqual(0);
    expect(packageJson.overrides?.mongoose?.[dependencyName]).toBe(dependencyRange);
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBe(dependencyRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('9.0.2'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the Excel parser aligned with Strict OpenXML and inline-string support', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = 'read-excel-file';
    const developmentRange = packageJson.devDependencies?.[dependencyName];
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(optionalRange).toBe(developmentRange);
    expect(minVersion(developmentRange!)?.compare('9.3.9')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('9.3.9'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps native SWC packages optional and aligned across root and docs manifests', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const sitePackageJson = readPackageJson<PackageManifest>('site/package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');

    for (const dependencyName of SWC_PACKAGE_NAMES) {
      const optionalRange = rootPackageJson.optionalDependencies?.[dependencyName];

      expect(optionalRange, `${dependencyName} must stay optional`).toBeDefined();
      expect(minVersion(optionalRange!)?.compare('1.16.1')).toBeGreaterThanOrEqual(0);
      expect(rootPackageJson.dependencies?.[dependencyName]).toBeUndefined();
      expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
      expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
      expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
      expect(
        minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare(
          '1.16.1',
        ),
      ).toBeGreaterThanOrEqual(0);
    }

    expect(sitePackageJson.devDependencies?.['@swc/core']).toBe(
      rootPackageJson.optionalDependencies?.['@swc/core'],
    );
    expect(packageLock.packages.site.devDependencies?.['@swc/core']).toBe(
      sitePackageJson.devDependencies?.['@swc/core'],
    );

    const swcCore = packageLock.packages['node_modules/@swc/core'];
    const nativeBindings = Object.entries(swcCore.optionalDependencies ?? {});
    expect(nativeBindings.length).toBeGreaterThan(0);
    for (const [dependencyName, version] of nativeBindings) {
      expect(version, `${dependencyName} must match SWC core`).toBe(swcCore.version);
      expect(
        packageLock.packages[`node_modules/${dependencyName}`]?.version,
        `${dependencyName} must be present at the required version`,
      ).toBe(version);
    }
  });

  it('keeps the patched Hono request parser optional and aligned across manifests', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = 'hono';
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(optionalRange).toBeDefined();
    expect(minVersion(optionalRange!)?.compare('4.13.7')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare(
        '4.13.7',
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the OpenAPI generator manifest and lockfile on the supported floor', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = '@asteasolutions/zod-to-openapi';
    const developmentRange = packageJson.devDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(minVersion(developmentRange!)?.compare('9.1.0')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('9.1.0'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the OpenCode SDK optional at the upgraded release', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
          optional?: boolean;
        }
      >;
    }>('package-lock.json');
    const dependencyName = '@opencode-ai/sdk';
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];
    const installedVersion = packageLock.packages[`node_modules/${dependencyName}`].version;

    expect(optionalRange).toBeDefined();
    expect(minVersion(optionalRange!)?.compare('1.18.23')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(installedVersion).toBeDefined();
    expect(minVersion(installedVersion!)?.compare('1.18.23')).toBeGreaterThanOrEqual(0);
    expect(satisfies(installedVersion!, optionalRange!)).toBe(true);
    expect(packageLock.packages[`node_modules/${dependencyName}`].optional).toBe(true);
  });

  it('keeps Codex Security optional at the locked release', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const dependencyName = '@openai/codex-security';
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];
    const lockedPackage = packageLock.packages[`node_modules/${dependencyName}`];

    expect(optionalRange).toBeDefined();
    expect(minVersion(optionalRange!)?.compare('0.1.28')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(lockedPackage.version).toBeDefined();
    expect(satisfies(lockedPackage.version!, optionalRange!)).toBe(true);
    expect(lockedPackage.optional).toBe(true);
  });

  it('keeps MCP optional while locking its Node adapter to a patched release', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
          engines?: Record<string, string>;
        }
      >;
    }>('package-lock.json');
    const sdkName = '@modelcontextprotocol/sdk';
    const adapterName = '@hono/node-server';
    const sdkRange = packageJson.optionalDependencies?.[sdkName];
    const adapterVersion = packageJson.dependencies?.[adapterName];
    const lockedSdk = packageLock.packages[`node_modules/${sdkName}`];
    const lockedAdapter = packageLock.packages[`node_modules/${adapterName}`];

    expect(sdkRange).toBeDefined();
    expect(adapterVersion).toBeDefined();
    expect(minVersion(sdkRange!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[sdkName]).toBeUndefined();
    expect(minVersion(adapterVersion!)?.compare('2.1.1')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].dependencies?.[adapterName]).toBe(adapterVersion);
    expect(packageJson.optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[sdkName]).toBe(sdkRange);
    expect(minVersion(lockedSdk.version!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(minVersion(lockedAdapter.version!)?.compare('2.1.1')).toBeGreaterThanOrEqual(0);
    expect(lockedAdapter.engines?.node).toBe('>=20');

    for (const manifestPath of [
      'examples/redteam-mcp-agent/package.json',
      'examples/simple-mcp/package.json',
    ]) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      expect(manifest.dependencies?.[sdkName], manifestPath).toBe(sdkRange);
      expect(manifest.dependencies?.[adapterName], manifestPath).toBe(adapterVersion);
    }
  });

  it('keeps the Langium parser override present and reproducible in the lockfile', () => {
    const dependencyName = 'chevrotain-allstar';
    const packageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          integrity?: string;
          resolved?: string;
          version?: string;
        }
      >;
    }>('package-lock.json');
    const parserOverride = packageJson.overrides?.[dependencyName];
    const langiumOverride = packageJson.overrides?.langium;
    const chevrotainOverride = packageJson.overrides?.chevrotain as
      | Record<string, string>
      | undefined;
    const parserVersion = chevrotainOverride?.['.'];

    expect(parserVersion, 'Chevrotain must have a pinned parser version').toBeDefined();

    expect(parserOverride).toEqual(
      expect.objectContaining({
        '.': expect.any(String),
        chevrotain: parserVersion,
      }),
    );
    const allstarVersion = (parserOverride as Record<string, string>)['.'];

    expect(minVersion(allstarVersion)?.compare('0.5.0')).toBeGreaterThanOrEqual(0);
    expect(langiumOverride).toEqual(
      expect.objectContaining({
        [dependencyName]: allstarVersion,
        '@chevrotain/regexp-to-ast': parserVersion,
        chevrotain: parserVersion,
      }),
    );
    expect(packageLock.packages[`node_modules/${dependencyName}`]).toEqual(
      expect.objectContaining({
        integrity: expect.stringMatching(/^sha512-/),
        resolved: `https://registry.npmjs.org/${dependencyName}/-/${dependencyName}-${allstarVersion}.tgz`,
        version: allstarVersion,
      }),
    );
    expect(
      satisfies(
        parserVersion!,
        packageLock.packages[`node_modules/${dependencyName}`].peerDependencies?.chevrotain ?? '',
      ),
      `${dependencyName} must accept the pinned Chevrotain version`,
    ).toBe(true);

    const langiumPackage = packageLock.packages['node_modules/langium'];
    expect(satisfies(parserVersion!, langiumPackage.dependencies?.chevrotain ?? '')).toBe(true);
    expect(
      satisfies(parserVersion!, langiumPackage.dependencies?.['@chevrotain/regexp-to-ast'] ?? ''),
    ).toBe(true);
    expect(satisfies(allstarVersion, langiumPackage.dependencies?.[dependencyName] ?? '')).toBe(
      true,
    );
  });

  it('keeps the Chevrotain CST generator aligned with its parser grammar', () => {
    const packageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          integrity?: string;
          resolved?: string;
          version?: string;
        }
      >;
    }>('package-lock.json');
    const generatorName = '@chevrotain/cst-dts-gen';
    const generatorOverride = packageJson.overrides?.[generatorName] as
      | Record<string, string>
      | undefined;
    const chevrotainOverride = packageJson.overrides?.chevrotain as
      | Record<string, string>
      | undefined;
    const generatorVersion = generatorOverride?.['.'];

    expect(generatorVersion, `${generatorName} must have an override`).toBeDefined();
    expect(chevrotainOverride?.[generatorName]).toBe(generatorVersion);
    expect(packageLock.packages[`node_modules/${generatorName}`]).toEqual(
      expect.objectContaining({
        integrity: expect.stringMatching(/^sha512-/),
        resolved: `https://registry.npmjs.org/${generatorName}/-/cst-dts-gen-${generatorVersion}.tgz`,
        version: generatorVersion,
      }),
    );

    const parserVersion = chevrotainOverride?.['.'];
    expect(parserVersion, 'Chevrotain must have a pinned parser version').toBeDefined();
    expect(generatorVersion, `${generatorName} must match the pinned parser version`).toBe(
      parserVersion,
    );
    expect(packageLock.packages['node_modules/chevrotain']?.dependencies?.[generatorName]).toBe(
      parserVersion,
    );

    for (const dependencyName of ['@chevrotain/gast', '@chevrotain/types']) {
      expect(
        generatorOverride?.[dependencyName],
        `${generatorName} must share the parser's ${dependencyName} version`,
      ).toBe(parserVersion);
      expect(packageLock.packages[`node_modules/${dependencyName}`]?.version).toBe(parserVersion);
      expect(
        packageLock.packages[`node_modules/${generatorName}`]?.dependencies?.[dependencyName],
      ).toBe(parserVersion);
      expect(
        packageLock.packages[`node_modules/${generatorName}/node_modules/${dependencyName}`],
      ).toBeUndefined();
    }
  });

  it('pins the Chevrotain parser family together and blocks independent Renovate updates', () => {
    const packageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const chevrotainOverride = packageJson.overrides?.chevrotain as
      | Record<string, string>
      | undefined;
    const parserVersion = chevrotainOverride?.['.'];
    // chevrotain@X declares every @chevrotain/* sub-package at exactly X and all six reach npm
    // within about a minute of each other, so Renovate must not move any of them alone.
    const pinnedGrammarPackages = [
      '@chevrotain/cst-dts-gen',
      '@chevrotain/gast',
      '@chevrotain/types',
      '@chevrotain/regexp-to-ast',
      '@chevrotain/utils',
    ];
    const pinnedParserPackages = ['chevrotain', 'chevrotain-allstar', ...pinnedGrammarPackages];

    expect(parserVersion, 'Chevrotain must have a pinned parser version').toBeDefined();

    for (const dependencyName of pinnedGrammarPackages) {
      expect(
        chevrotainOverride?.[dependencyName],
        `${dependencyName} must stay on the pinned parser version`,
      ).toBe(parserVersion);
    }

    for (const packageName of pinnedParserPackages) {
      expect(
        renovateConfig.packageRules?.some(
          (rule) => rule.enabled === false && rule.matchPackageNames?.includes(packageName),
        ),
        `Renovate must not independently update the pinned ${packageName} package`,
      ).toBe(true);
    }
  });

  it('keeps Playwright packages optional and their declared and locked versions aligned', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const browserName = '@playwright/browser-chromium';
    const optionalRange = packageJson.optionalDependencies?.[browserName];

    expect(optionalRange).toBeDefined();
    for (const name of ['playwright', browserName]) {
      expect(packageJson.optionalDependencies?.[name]).toBe(optionalRange);
      expect(packageJson.dependencies?.[name]).toBeUndefined();
      expect(packageLock.packages[''].dependencies?.[name]).toBeUndefined();
      expect(packageLock.packages[''].optionalDependencies?.[name]).toBe(optionalRange);
    }

    const versions = ['playwright', 'playwright-core', browserName].map((name) => {
      const version = packageLock.packages[`node_modules/${name}`]?.version;
      expect(version, `${name} must be present in the lockfile`).toBeDefined();
      return version;
    });
    expect(new Set(versions).size, 'Playwright browser versions must stay aligned').toBe(1);
  });

  it('keeps jsdom out of root runtime dependencies', () => {
    const packageJson = readPackageJson<{
      dependencies?: Record<string, string>;
    }>('package.json');

    // The intent of this guard is "jsdom must stay gone and parse5 must exist
    // as its replacement" — not "parse5 must be exactly version X". Accept any
    // semver range so future major bumps don't re-fail this regression test.
    const parse5Range = packageJson.dependencies?.parse5;
    expect(packageJson.dependencies?.jsdom).toBeUndefined();
    expect(parse5Range).toBeDefined();
    expect(validRange(parse5Range as string)).not.toBeNull();
  });

  it('keeps the streaming OpenAI example aligned with supported Node versions', () => {
    const rootManifest = readPackageJson<PackageManifest & { engines?: { node?: string } }>(
      'package.json',
    );
    const exampleManifest = readPackageJson<PackageManifest & { engines?: { node?: string } }>(
      'examples/config-websockets/streaming/server/package.json',
    );
    const lockfile =
      readPackageJson<PackageLockManifest<{ engines?: { node?: string } }>>('package-lock.json');
    const readme = fs.readFileSync(
      path.join(process.cwd(), 'examples/config-websockets/streaming/server/README.md'),
      'utf8',
    );
    const exampleNodeMinimum = minVersion(exampleManifest.engines?.node ?? '');
    const rootNodeMinimum = minVersion(rootManifest.engines?.node ?? '');
    const openAiNodeMinimum = minVersion(
      lockfile.packages['node_modules/openai']?.engines?.node ?? '',
    );

    expect(exampleNodeMinimum).not.toBeNull();
    expect(rootNodeMinimum).not.toBeNull();
    expect(openAiNodeMinimum).not.toBeNull();
    expect(exampleNodeMinimum?.compare(rootNodeMinimum!)).toBeGreaterThanOrEqual(0);
    expect(exampleNodeMinimum?.compare(openAiNodeMinimum!)).toBeGreaterThanOrEqual(0);
    expect(readme).toContain(`Node.js >= ${exampleNodeMinimum?.version}`);
  });

  it('requires patched WebSocket fragment limits and compression negotiation in manifests', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const lockfile = readPackageJson<{
      packages?: Record<string, PackageManifest>;
    }>('package-lock.json');
    const websocketManifests = [
      'package.json',
      'examples/config-websockets/basic/test-server/package.json',
      'examples/config-websockets/streaming/server/package.json',
    ];

    for (const manifestPath of websocketManifests) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      const websocketRange = manifest.dependencies?.ws;

      expect(websocketRange, `${manifestPath} must depend on ws`).toBeDefined();
      expect(minVersion(websocketRange as string)?.compare('8.21.3')).toBeGreaterThanOrEqual(0);
    }

    expect(lockfile.packages?.['']?.dependencies?.ws).toBe(rootPackageJson.dependencies?.ws);
  });

  it('keeps every direct and transitive js-yaml installation patched', () => {
    const packageLock = readPackageJson<PackageLockManifest>('package-lock.json');
    const workspaceManifests = [
      { path: 'package.json', lockPath: '', field: 'dependencies' },
      { path: 'site/package.json', lockPath: 'site', field: 'dependencies' },
      { path: 'src/app/package.json', lockPath: 'src/app', field: 'devDependencies' },
    ] as const;
    const directVersions: string[] = [];

    for (const { path: manifestPath, lockPath, field } of workspaceManifests) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      const declaredVersion = manifest[field]?.['js-yaml'];

      expect(declaredVersion, `${manifestPath} must declare js-yaml`).toBeDefined();
      expect(packageLock.packages[lockPath]?.[field]?.['js-yaml']).toBe(declaredVersion);
      expect(
        validRange(declaredVersion as string),
        `${manifestPath} must declare a valid js-yaml semver range`,
      ).not.toBeNull();
      expect(
        minVersion(declaredVersion as string)?.compare('5.3.0'),
        `${manifestPath} must include the aliased-merge validation fix`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        subset(declaredVersion as string, PATCHED_JS_YAML_RANGE),
        `${manifestPath} must not allow vulnerable js-yaml ${declaredVersion}`,
      ).toBe(true);
      directVersions.push(declaredVersion as string);
    }

    expect(new Set(directVersions).size, 'direct js-yaml versions must stay aligned').toBe(1);

    const installations = Object.entries(packageLock.packages).filter(
      ([packagePath]) =>
        packagePath === 'node_modules/js-yaml' || packagePath.endsWith('/node_modules/js-yaml'),
    );

    expect(installations, 'the root lockfile must resolve js-yaml').not.toHaveLength(0);
    for (const [packagePath, installation] of installations) {
      expect(installation.version, `${packagePath} must have a version`).toBeDefined();
      expect(
        satisfies(installation.version as string, PATCHED_JS_YAML_RANGE),
        `${packagePath} resolves vulnerable js-yaml ${installation.version}`,
      ).toBe(true);
    }
  });

  it('keeps the JSON Schema ref parser and its HTTP transport on patched versions', () => {
    const packageJson = readPackageJson<
      PackageManifest & {
        engines?: { node?: string };
      }
    >('package.json');
    const packageLock =
      readPackageJson<
        PackageLockManifest<PackageManifest & { engines?: { node?: string }; version?: string }>
      >('package-lock.json');
    const parserRange = packageJson.dependencies?.['@apidevtools/json-schema-ref-parser'];
    const parser = packageLock.packages['node_modules/@apidevtools/json-schema-ref-parser'];
    // Published dependencies do not inherit this repository's npm overrides.
    const parserTransportRange = parser?.dependencies?.undici;
    const parserTransport =
      packageLock.packages['node_modules/@apidevtools/json-schema-ref-parser/node_modules/undici'];

    expect(
      parserRange,
      'the JSON Schema ref parser must remain a runtime dependency',
    ).toBeDefined();
    expect(minVersion(parserRange as string)?.compare('16.0.2')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].dependencies?.['@apidevtools/json-schema-ref-parser']).toBe(
      parserRange,
    );
    expect(parser?.version, 'the parser must resolve in the root lockfile').toBeDefined();
    expect(satisfies(parser.version as string, parserRange as string)).toBe(true);
    expect(
      packageJson.engines?.node,
      'the root must declare its supported Node range',
    ).toBeDefined();
    expect(parser.engines?.node, 'the parser must declare its supported Node range').toBeDefined();
    expect(subset(packageJson.engines?.node as string, parser.engines?.node as string)).toBe(true);
    expect(parserTransportRange, 'the parser must pin its HTTP transport').toBeDefined();
    expect(
      validRange(parserTransportRange as string),
      'the parser transport dependency must declare a valid semver range',
    ).not.toBeNull();
    expect(minVersion(parserTransportRange as string)?.compare('8.10.2')).toBeGreaterThanOrEqual(0);
    expect(
      parserTransport?.version,
      'the parser must resolve its private HTTP transport',
    ).toBeDefined();
    expect(satisfies(parserTransport.version as string, parserTransportRange as string)).toBe(true);
    expect(
      parserTransport.engines?.node,
      'the HTTP transport must declare its supported Node range',
    ).toBeDefined();
    expect(
      subset(packageJson.engines?.node as string, parserTransport.engines?.node as string),
    ).toBe(true);
    expect(
      subset(parserTransportRange as string, PATCHED_UNDICI_RANGE),
      `the parser transport dependency must not allow vulnerable undici ${parserTransportRange}`,
    ).toBe(true);
  });

  it('keeps undici patched and aligned across the root and code-scan-action manifests', () => {
    // Keep the September 2026 transport fixes in both independent install graphs.
    const PATCHED_UNDICI_FLOOR = '7.29.1';
    const rootPackageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const providerUtilsOverride = rootPackageJson.overrides?.['@ai-sdk/provider-utils'];

    expect(providerUtilsOverride).toMatchObject({ undici: '$undici' });

    const projects = [
      // The root declares undici directly; code-scan-action only pins it through an
      // override, since it arrives transitively via @actions/github.
      { manifest: 'package.json', lockfile: 'package-lock.json', field: 'dependencies' },
      {
        manifest: 'code-scan-action/package.json',
        lockfile: 'code-scan-action/package-lock.json',
        field: 'overrides',
      },
    ] as const;

    const minimumVersions: string[] = [];
    const directResolvedVersions: string[] = [];

    for (const { manifest, lockfile, field } of projects) {
      const packageJson =
        readPackageJson<Record<string, Record<string, string> | undefined>>(manifest);
      const pinnedRange = packageJson[field]?.undici;

      expect(pinnedRange, `${manifest} must pin undici under "${field}"`).toBeDefined();
      expect(validRange(pinnedRange as string)).not.toBeNull();

      const minimum = minVersion(pinnedRange as string);
      expect(
        minimum?.compare(PATCHED_UNDICI_FLOOR),
        `${manifest} must not allow undici below ${PATCHED_UNDICI_FLOOR}`,
      ).toBeGreaterThanOrEqual(0);
      minimumVersions.push(minimum?.version ?? '');

      const packageLock = readPackageJson<PackageLockManifest<{ version?: string }>>(lockfile);
      const installations = Object.entries(packageLock.packages).filter(
        ([packagePath]) =>
          packagePath === 'node_modules/undici' || packagePath.endsWith('/node_modules/undici'),
      );

      expect(installations, `${lockfile} must resolve undici`).not.toHaveLength(0);
      for (const [packagePath, installation] of installations) {
        expect(
          installation.version,
          `${lockfile}:${packagePath} must have a version`,
        ).toBeDefined();
        expect(
          satisfies(installation.version as string, PATCHED_UNDICI_RANGE),
          `${lockfile}:${packagePath} resolves vulnerable undici ${installation.version}`,
        ).toBe(true);
      }

      const resolved = packageLock.packages['node_modules/undici']?.version;
      expect(resolved, `${lockfile} must resolve a top-level undici installation`).toBeDefined();
      directResolvedVersions.push(resolved as string);
    }

    expect(new Set(minimumVersions).size, 'undici minimum versions must stay aligned').toBe(1);
    expect(new Set(directResolvedVersions).size, 'resolved undici versions must stay aligned').toBe(
      1,
    );
  });

  it('keeps the Shai-Hulud compromised package versions unreachable', () => {
    // 2026-08-04: jaredwray's GitHub account was compromised and malicious releases
    // were cut for the keyv/cacheable family. Each carried a `preinstall` credential
    // stealer. npm has since removed them, but the ranges we shipped could reach two
    // of them, so the floors below are what stop a lockfile refresh from wandering
    // back in if those versions ever reappear.
    const COMPROMISED = {
      keyv: '6.0.0',
      'cache-manager': '7.2.10',
      '@cacheable/utils': '2.5.1',
      'cacheable-request': '13.0.20',
    } as const;

    const packageJson = readPackageJson<
      PackageManifest & { overrides?: Record<string, string | Record<string, string>> }
    >('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ version?: string }>>('package-lock.json');

    // No installation anywhere in the tree — including nested copies — may sit on a
    // compromised version.
    for (const [packagePath, installation] of Object.entries(packageLock.packages)) {
      const name = packagePath.split(/(?:^|\/)node_modules\//).at(-1) ?? packagePath;
      const bad = COMPROMISED[name as keyof typeof COMPROMISED];
      if (!bad || !installation.version) {
        continue;
      }
      expect(
        installation.version,
        `${packagePath} resolves the compromised ${name}@${bad}`,
      ).not.toBe(bad);
    }

    // The declared ranges must not be *able* to reach them either. cache-manager is a
    // shipped runtime dependency, so its range is what protects consumers — npm ignores
    // a dependency's own `overrides` when it is not the root project.
    const declaredRanges: Array<[string, string | undefined]> = [
      ['cache-manager', packageJson.dependencies?.['cache-manager']],
      ['keyv', packageJson.dependencies?.keyv],
      ['@cacheable/utils', packageJson.overrides?.['@cacheable/utils'] as string | undefined],
    ];

    for (const [name, range] of declaredRanges) {
      expect(range, `${name} must declare a range`).toBeDefined();
      expect(
        satisfies(COMPROMISED[name as keyof typeof COMPROMISED], range as string),
        `${name} range "${range}" can still resolve the compromised ${COMPROMISED[name as keyof typeof COMPROMISED]}`,
      ).toBe(false);
    }
  });

  it('does not import jsdom from root src/', () => {
    // Guards against re-introducing jsdom into the CLI startup graph, which
    // previously broke `npx promptfoo` on Node 24 via ERR_REQUIRE_ASYNC_MODULE.
    // The src/app workspace is excluded because it legitimately uses jsdom
    // as a browser test environment.
    const srcDir = path.join(process.cwd(), 'src');
    const files = collectSourceFiles(srcDir, new Set([path.join(srcDir, 'app')]));
    // Match static `from 'jsdom'`, CJS `require('jsdom')`, and dynamic
    // `import('jsdom')` — including whitespace around the parenthesis.
    const jsdomImportPattern = /(?:\bfrom|\brequire\s*\(|\bimport\s*\()\s*['"]jsdom['"]/;
    const offenders = files.filter((file) =>
      jsdomImportPattern.test(fs.readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the supported Node.js range aligned across workspace manifests', () => {
    // These three drifted apart before (root allowed Node 20.20 while site and
    // code-scan-action pinned >=20.20.1), so an engine bump that misses one is a real
    // failure mode. Assert they agree rather than restating the value.
    const rootEngines = readPackageJson<{ engines?: { node?: string } }>('package.json').engines
      ?.node;

    expect(validRange(rootEngines ?? '')).toBeTruthy();

    for (const manifestPath of ['site/package.json', 'code-scan-action/package.json']) {
      const engines = readPackageJson<{ engines?: { node?: string } }>(manifestPath).engines?.node;
      expect(engines, `${manifestPath} must declare the root engines.node range`).toBe(rootEngines);
    }
  });

  it('keeps sharp optional for the docs workspace', () => {
    const sitePackageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('site/package.json');

    expect(sitePackageJson.devDependencies?.sharp).toBeUndefined();
    expect(sitePackageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps OpenAI example dependency ranges aligned with the root manifest', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const rootRanges = new Map(
      OPENAI_PACKAGE_NAMES.map((dependencyName) => [
        dependencyName,
        getDependencyRange(rootPackageJson, dependencyName),
      ]),
    );
    const examplesDir = path.join(process.cwd(), 'examples');
    const mismatches = collectPackageJsonFiles(examplesDir).flatMap((packageJsonPath) => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
      const relativePath = path.relative(process.cwd(), packageJsonPath);

      return OPENAI_PACKAGE_NAMES.flatMap((dependencyName) => {
        const exampleRange = getDependencyRange(packageJson, dependencyName);
        if (!exampleRange) {
          return [];
        }

        const rootRange = rootRanges.get(dependencyName);
        if (exampleRange === rootRange) {
          return [];
        }

        return [`${relativePath}: ${dependencyName}=${exampleRange} (root: ${rootRange})`];
      });
    });

    expect(mismatches).toEqual([]);
  });
});
