import { lstatSync, mkdirSync, readlinkSync, realpathSync } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const MAX_SYMLINK_HOPS = 40;
const isWindows = path.sep === '\\';
const pathSeparatorPattern = isWindows ? /[\\/]+/ : /\/+/;

type JsonlOutputPathPlan = {
  targetPath: string;
  parentDirectories: string[];
};

type PathOperation = { kind: 'lstat' | 'readlink'; path: string };
type PathOperationResult = Awaited<ReturnType<typeof fsPromises.lstat>> | string;

function isFileNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function splitComponents(value: string): string[] {
  return value.split(pathSeparatorPattern).filter(Boolean);
}

function getPathRootAndComponents(value: string): { root: string; components: string[] } {
  const parsedRoot = path.parse(value).root;
  const components = splitComponents(value.slice(parsedRoot.length));
  const normalizedRoot = path.normalize(parsedRoot);
  const extendedUncPrefix = `${path.sep}${path.sep}?${path.sep}UNC${path.sep}`;
  if (isWindows && normalizedRoot.toLowerCase() === extendedUncPrefix.toLowerCase()) {
    const [server, share, ...remainingComponents] = components;
    if (server && share) {
      return {
        root: `${normalizedRoot}${server}${path.sep}${share}${path.sep}`,
        components: remainingComponents,
      };
    }
  }

  return { root: parsedRoot, components };
}

function hasTrailingSeparator(value: string): boolean {
  return isWindows ? /[\\/]$/.test(value) : value.endsWith(path.sep);
}

function isDirectoryPath(value: string): boolean {
  const components = splitComponents(value);
  const lastComponent = components[components.length - 1];
  return hasTrailingSeparator(value) || lastComponent === '.' || lastComponent === '..';
}

function getAbsolutePathParts(
  value: string,
  relativeTo: string,
): { root: string; components: string[] } {
  const parsed = path.parse(value);
  const valueParts = getPathRootAndComponents(value);
  if (path.isAbsolute(value)) {
    const root =
      isWindows && parsed.root === '\\'
        ? getPathRootAndComponents(relativeTo).root
        : valueParts.root;
    return { root, components: valueParts.components };
  }

  if (isWindows && /^[A-Za-z]:$/.test(parsed.root)) {
    const driveCwd = process.env[`=${parsed.root}`];
    const relativeRoot = getPathRootAndComponents(relativeTo).root;
    const basePath =
      driveCwd ??
      (relativeRoot.slice(0, 2).toLowerCase() === parsed.root.toLowerCase()
        ? relativeTo
        : `${parsed.root}${path.sep}`);
    const baseParts = getPathRootAndComponents(basePath);
    return {
      root: baseParts.root,
      components: [...baseParts.components, ...valueParts.components],
    };
  }

  const baseParts = getPathRootAndComponents(relativeTo);
  return {
    root: baseParts.root,
    components: [...baseParts.components, ...valueParts.components],
  };
}

function isDriveRelativePath(value: string): boolean {
  return isWindows && /^[A-Za-z]:/.test(value) && !path.isAbsolute(value);
}

function tooManySymlinksError(outputPath: string): NodeJS.ErrnoException {
  const error = new Error(
    `ELOOP: too many symbolic links encountered, realpath '${outputPath}'`,
  ) as NodeJS.ErrnoException;
  error.code = 'ELOOP';
  error.path = outputPath;
  error.syscall = 'realpath';
  return error;
}

function notDirectoryError(outputPath: string): NodeJS.ErrnoException {
  const error = new Error(
    `ENOTDIR: not a directory, stat '${outputPath}'`,
  ) as NodeJS.ErrnoException;
  error.code = 'ENOTDIR';
  error.path = outputPath;
  error.syscall = 'stat';
  return error;
}

function resolveDotComponent(
  component: string,
  currentPath: string,
  currentIsDirectory: boolean,
  root: string,
): { currentPath: string; currentIsDirectory: boolean } {
  if (!currentIsDirectory) {
    throw notDirectoryError(currentPath);
  }
  if (!isWindows && !path.isAbsolute(currentPath)) {
    return { currentPath: path.join(currentPath, component), currentIsDirectory: true };
  }
  const isAtRoot = isWindows
    ? currentPath.replace(/[\\/]+$/, '').toLowerCase() === root.replace(/[\\/]+$/, '').toLowerCase()
    : currentPath === root;
  return {
    currentPath: component === '..' && !isAtRoot ? path.dirname(currentPath) : currentPath,
    currentIsDirectory: true,
  };
}

function* expandSymlinkPath(
  symlinkPath: string,
  currentPath: string,
  currentRoot: string,
  remainingComponents: string[],
  mustBeDirectory: boolean,
): Generator<
  PathOperation,
  { root: string; currentPath: string; components: string[]; mustBeDirectory: boolean },
  PathOperationResult
> {
  const symlinkTarget = (yield { kind: 'readlink', path: symlinkPath }) as string;
  const targetParts = getAbsolutePathParts(symlinkTarget, currentPath);
  const targetIsRooted = path.isAbsolute(symlinkTarget) || isDriveRelativePath(symlinkTarget);
  const targetRequiresDirectory =
    remainingComponents.length === 0 && isDirectoryPath(symlinkTarget);

  return {
    root: targetIsRooted ? targetParts.root : currentRoot,
    currentPath: targetIsRooted ? targetParts.root : currentPath,
    components: [
      ...(targetIsRooted ? targetParts.components : splitComponents(symlinkTarget)),
      ...remainingComponents,
    ],
    mustBeDirectory: mustBeDirectory || targetRequiresDirectory,
  };
}

function recordMissingComponent(
  candidatePath: string,
  hasRemainingComponents: boolean,
  mustBeDirectory: boolean,
  parentDirectories: string[],
  recordedDirectories: Set<string>,
): boolean {
  if (!hasRemainingComponents) {
    return mustBeDirectory;
  }
  if (!recordedDirectories.has(candidatePath)) {
    recordedDirectories.add(candidatePath);
    parentDirectories.push(candidatePath);
  }
  return true;
}

function assertDirectoryWhenRequired(
  candidatePath: string,
  isDirectory: boolean,
  hasRemainingComponents: boolean,
  mustBeDirectory: boolean,
): void {
  if ((hasRemainingComponents || mustBeDirectory) && !isDirectory) {
    throw notDirectoryError(candidatePath);
  }
}

function planForResolvedPath(outputPath: string, resolvedPath: string): JsonlOutputPathPlan {
  const targetPath =
    isDirectoryPath(outputPath) && !hasTrailingSeparator(resolvedPath)
      ? `${resolvedPath}${path.sep}`
      : resolvedPath;
  return { targetPath, parentDirectories: [] };
}

function* walkJsonlOutputPath(
  outputPath: string,
): Generator<PathOperation, JsonlOutputPathPlan, PathOperationResult> {
  // POSIX relative lookups must start at the open cwd. Its ancestors might
  // no longer be searchable even though files below it are still writable.
  const { root, components } =
    !isWindows && !path.isAbsolute(outputPath)
      ? { root: '.', components: splitComponents(outputPath) }
      : getAbsolutePathParts(outputPath, process.cwd());
  let currentPath = root;
  let currentRoot = root;
  let currentIsDirectory = true;
  let mustBeDirectory = isDirectoryPath(outputPath);
  let symlinkHops = 0;
  let followedSymlink = false;
  let componentIndex = 0;
  let pendingComponents = components;
  const parentDirectories: string[] = [];
  const recordedDirectories = new Set<string>();

  while (componentIndex < pendingComponents.length) {
    const component = pendingComponents[componentIndex++];

    if (component === '.' || component === '..') {
      ({ currentPath, currentIsDirectory } = resolveDotComponent(
        component,
        currentPath,
        currentIsDirectory,
        currentRoot,
      ));
      continue;
    }

    const candidatePath = path.join(currentPath, component);
    let stats: Awaited<ReturnType<typeof fsPromises.lstat>>;
    try {
      stats = (yield { kind: 'lstat', path: candidatePath }) as Awaited<
        ReturnType<typeof fsPromises.lstat>
      >;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }

      currentIsDirectory = recordMissingComponent(
        candidatePath,
        componentIndex < pendingComponents.length,
        mustBeDirectory,
        parentDirectories,
        recordedDirectories,
      );
      currentPath = candidatePath;
      continue;
    }

    if (stats.isSymbolicLink()) {
      followedSymlink = true;
      if (++symlinkHops > MAX_SYMLINK_HOPS) {
        throw tooManySymlinksError(outputPath);
      }

      const remainingComponents = pendingComponents.slice(componentIndex);
      const expansion = yield* expandSymlinkPath(
        candidatePath,
        currentPath,
        currentRoot,
        remainingComponents,
        mustBeDirectory,
      );
      currentRoot = expansion.root;
      currentPath = expansion.currentPath;
      currentIsDirectory = true;
      pendingComponents = expansion.components;
      mustBeDirectory = expansion.mustBeDirectory;
      componentIndex = 0;
      continue;
    }

    const hasRemainingComponents = componentIndex < pendingComponents.length;
    assertDirectoryWhenRequired(
      candidatePath,
      stats.isDirectory(),
      hasRemainingComponents,
      mustBeDirectory,
    );

    currentPath = candidatePath;
    currentIsDirectory = stats.isDirectory();
  }

  if (mustBeDirectory && !currentIsDirectory) {
    throw notDirectoryError(currentPath);
  }

  const resolvedPath = followedSymlink ? currentPath : outputPath;
  const targetPath =
    mustBeDirectory && !hasTrailingSeparator(resolvedPath)
      ? `${resolvedPath}${path.sep}`
      : resolvedPath;
  return { targetPath, parentDirectories };
}

function runPathWalkSync(outputPath: string): JsonlOutputPathPlan {
  const walker = walkJsonlOutputPath(outputPath);
  let step = walker.next();

  while (!step.done) {
    try {
      const value =
        step.value.kind === 'lstat' ? lstatSync(step.value.path) : readlinkSync(step.value.path);
      step = walker.next(value);
    } catch (error) {
      step = walker.throw(error);
    }
  }

  return step.value;
}

async function runPathWalk(outputPath: string): Promise<JsonlOutputPathPlan> {
  const walker = walkJsonlOutputPath(outputPath);
  let step = walker.next();

  while (!step.done) {
    try {
      const value =
        step.value.kind === 'lstat'
          ? await fsPromises.lstat(step.value.path)
          : await fsPromises.readlink(step.value.path);
      step = walker.next(value);
    } catch (error) {
      step = walker.throw(error);
    }
  }

  return step.value;
}

export async function resolveJsonlOutputPath(outputPath: string): Promise<JsonlOutputPathPlan> {
  if (!isWindows && !path.isAbsolute(outputPath)) {
    return runPathWalk(outputPath);
  }
  try {
    return planForResolvedPath(outputPath, await fsPromises.realpath(outputPath));
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  return runPathWalk(outputPath);
}

export function resolveJsonlOutputPathSync(outputPath: string): JsonlOutputPathPlan {
  if (!isWindows && !path.isAbsolute(outputPath)) {
    return runPathWalkSync(outputPath);
  }
  try {
    return planForResolvedPath(outputPath, realpathSync.native(outputPath));
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  return runPathWalkSync(outputPath);
}

export function createJsonlOutputDirectoriesSync(plan: JsonlOutputPathPlan): void {
  for (const directory of plan.parentDirectories) {
    mkdirSync(directory, { recursive: true });
  }
}

export async function createJsonlOutputDirectories(plan: JsonlOutputPathPlan): Promise<void> {
  for (const directory of plan.parentDirectories) {
    await fsPromises.mkdir(directory, { recursive: true });
  }
}
