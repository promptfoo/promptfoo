import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findMissingRootTypeScriptFiles,
  getRootProjectFiles,
} from '../../scripts/checkTypeScriptCoverage';

describe('root TypeScript coverage', () => {
  it('keeps tracked root-owned TypeScript files inside a typechecked project', () => {
    expect(findMissingRootTypeScriptFiles()).toEqual([]);
  });
});

describe('package TypeScript coverage', () => {
  let repositoryRoot: string;

  beforeEach(() => {
    repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typescript-coverage-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repositoryRoot });
    write('src/index.ts', 'export {};');
    write('tsconfig.json', { include: ['src/**/*.ts'] });
  });

  afterEach(() => {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents: string | object): void {
    const absolutePath = path.join(repositoryRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(
      absolutePath,
      typeof contents === 'string' ? contents : JSON.stringify(contents),
    );
    execFileSync('git', ['add', '--', relativePath], { cwd: repositoryRoot });
  }

  it('requires new package sources to be covered even when they have a standalone tsconfig', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/tsconfig.json', { include: ['src'] });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([
      'packages/contracts/src/index.ts',
    ]);
  });

  it('accepts package sources included by the root compiler project', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('tsconfig.json', { include: ['src', 'packages'] });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([]);
  });

  it('accepts explicitly referenced package projects and checks their expanded include/exclude', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/test/index.test.mts', 'export {};');
    write('packages/contracts/tsconfig.json', { include: ['src'] });
    write('tsconfig.json', {
      include: ['src'],
      references: [{ path: './packages/contracts' }],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([
      'packages/contracts/test/index.test.mts',
    ]);

    write('packages/contracts/tsconfig.json', { include: ['src', 'test'] });
    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([]);
    expect(getRootProjectFiles(repositoryRoot)).toEqual(new Set(['src/index.ts']));
  });

  it('follows solution references and inherited config without looping on repeated references', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/src/with spaces.cts', 'export {};');
    write('packages/contracts/tsconfig.base.json', { include: ['src'] });
    write('packages/contracts/tsconfig.json', { extends: './tsconfig.base.json' });
    write('tsconfig.packages.json', {
      files: [],
      references: [{ path: './packages/contracts/tsconfig.json' }],
    });
    write('tsconfig.json', {
      include: ['src'],
      references: [
        { path: './tsconfig.packages.json' },
        { path: './packages/contracts/tsconfig.json' },
      ],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([]);
  });

  it('does not let a root or parent project mask omissions from a registered package project', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/test/index.test.ts', 'export {};');
    write('packages/contracts/tsconfig.json', {
      compilerOptions: { composite: true },
      include: ['src'],
    });
    write('packages/tsconfig.json', {
      include: ['**/*.ts'],
      references: [{ path: './contracts' }],
    });
    write('tsconfig.json', {
      include: ['src', 'packages'],
      references: [{ path: './packages' }],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([
      'packages/contracts/test/index.test.ts',
    ]);
  });

  it('combines explicitly referenced source and test projects in the same package directory', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/test/index.test.ts', 'export {};');
    write('packages/contracts/tsconfig.json', { include: ['src'] });
    write('packages/contracts/tsconfig.test.json', { include: ['test'] });
    write('tsconfig.json', {
      include: ['src'],
      references: [
        { path: './packages/contracts' },
        { path: './packages/contracts/tsconfig.test.json' },
      ],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([]);
  });

  it('keeps root-owned files in the root ratchet even if a package project includes them', () => {
    write('scripts/forgotten.ts', 'export {};');
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/tsconfig.json', { include: ['src', '../../scripts'] });
    write('tsconfig.json', {
      include: ['src'],
      references: [{ path: './packages/contracts' }],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual(['scripts/forgotten.ts']);
  });

  it('prevents one package project from claiming another package by a broad include', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/runtime/src/index.ts', 'export {};');
    write('packages/contracts/tsconfig.json', { include: ['../**/*.ts'] });
    write('tsconfig.json', {
      include: ['src'],
      references: [{ path: './packages/contracts' }],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([
      'packages/runtime/src/index.ts',
    ]);
  });

  it('does not use an external project reference to exempt package files', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('src/app/tsconfig.json', { include: ['../../packages'] });
    write('tsconfig.json', {
      include: ['src/index.ts'],
      references: [{ path: './src/app' }],
    });

    expect(findMissingRootTypeScriptFiles(repositoryRoot)).toEqual([
      'packages/contracts/src/index.ts',
    ]);
  });

  it('fails closed when a referenced package config is missing', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('tsconfig.json', {
      include: ['src'],
      references: [{ path: './packages/contracts' }],
    });

    expect(() => findMissingRootTypeScriptFiles(repositoryRoot)).toThrow(
      'packages/contracts/tsconfig.json',
    );
  });

  it('fails closed when a referenced package config has compiler option errors', () => {
    write('packages/contracts/src/index.ts', 'export {};');
    write('packages/contracts/tsconfig.json', {
      compilerOptions: { module: 'not-a-module-option' },
      include: ['src'],
    });
    write('tsconfig.json', {
      include: ['src'],
      references: [{ path: './packages/contracts' }],
    });

    expect(() => findMissingRootTypeScriptFiles(repositoryRoot)).toThrow(
      "Argument for '--module' option must be",
    );
  });
});
