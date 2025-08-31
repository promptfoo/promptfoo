import { defineConfig } from 'tsup';

export default defineConfig([
  // Build library entry points as dual-format with bundling
  {
    entry: {
      'index': 'src/index.ts',
      'assertions/index': 'src/assertions/index.ts',
      'providers/index': 'src/providers/index.ts', 
      'redteam/index': 'src/redteam/index.ts',
      'types/index': 'src/types/index.ts',
      'util/index': 'src/util/index.ts',
      'cache': 'src/cache.ts',
      'evaluator': 'src/evaluator.ts',
      'logger': 'src/logger.ts',
      'server/index': 'src/server/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: false, // Build types separately to avoid memory issues
    clean: true,
    outDir: 'dist',
    target: 'es2022',
    platform: 'node',
    sourcemap: false,
    minify: false,
    splitting: false,
    bundle: true, // Enable bundling to include all transitive dependencies
    noExternal: [], // Bundle everything except external packages
    external: [
      // Heavy dependencies
      'better-sqlite3', 'express',
      // Peer dependencies that should not be bundled
      'natural', 'sharp', 'playwright', 'pdf-parse', 'langfuse', 'fluent-ffmpeg',
      // AWS SDK packages
      '@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock-agent-runtime',
      '@aws-sdk/client-sagemaker-runtime', '@aws-sdk/credential-provider-sso',
      // Azure packages
      '@azure/identity', '@azure/openai-assistants',
      // Other optional/heavy packages
      'google-auth-library', '@fal-ai/client', 'ibm-cloud-sdk-core',
      'node-sql-parser', 'playwright-extra', 'puppeteer-extra-plugin-stealth'
    ], // Externalize heavy deps and peer deps for library builds
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
      };
    },
    esbuildOptions(options) {
      options.outbase = './src';
      // Explicitly configure external packages at esbuild level
      options.external = [
        // Heavy dependencies
        'better-sqlite3', 'express',
        // Peer dependencies that should not be bundled
        'natural', 'sharp', 'playwright', 'pdf-parse', 'langfuse', 'fluent-ffmpeg',
        // AWS SDK packages
        '@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock-agent-runtime',
        '@aws-sdk/client-sagemaker-runtime', '@aws-sdk/credential-provider-sso',
        // Azure packages
        '@azure/identity', '@azure/openai-assistants',
        // Other optional/heavy packages
        'google-auth-library', '@fal-ai/client', 'ibm-cloud-sdk-core',
        'node-sql-parser', 'playwright-extra', 'puppeteer-extra-plugin-stealth'
      ];
    },
  },
  // Build main CLI bundled with fixed isMainModule detection
  {
    entry: {
      'main': 'src/main.ts',
    },
    format: ['cjs'],
    dts: false,
    clean: false,
    outDir: 'dist',
    target: 'es2022',
    platform: 'node',
    sourcemap: false,
    minify: false,
    splitting: false,
    bundle: true, // Bundle to avoid dependency resolution issues
    skipNodeModulesBundle: true,
    shims: true, // Enable Node.js compatibility shims
    outExtension({ format }) {
      return {
        js: '.cjs',
      };
    },
    banner: {
      js: '// Set bundle flag immediately to prevent strategy test execution\nglobal.__PROMPTFOO_CLI_BUNDLE__ = true;',
    },
  },
  // Build types separately to avoid memory issues
  {
    entry: {
      'index': 'src/index.ts',
      'assertions/index': 'src/assertions/index.ts',
      'providers/index': 'src/providers/index.ts', 
      'redteam/index': 'src/redteam/index.ts',
      'types/index': 'src/types/index.ts',
      'util/index': 'src/util/index.ts',
      'cache': 'src/cache.ts',
      'evaluator': 'src/evaluator.ts',
      'logger': 'src/logger.ts',
      'server/index': 'src/server/index.ts',
    },
    format: ['esm'], // Only need types once
    dts: { only: true }, // Only generate types
    outDir: 'dist/types',
    target: 'es2022',
    esbuildOptions(options) {
      options.outbase = './src';
      // Explicitly configure external packages at esbuild level
      options.external = [
        // Heavy dependencies
        'better-sqlite3', 'express',
        // Peer dependencies that should not be bundled
        'natural', 'sharp', 'playwright', 'pdf-parse', 'langfuse', 'fluent-ffmpeg',
        // AWS SDK packages
        '@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock-agent-runtime',
        '@aws-sdk/client-sagemaker-runtime', '@aws-sdk/credential-provider-sso',
        // Azure packages
        '@azure/identity', '@azure/openai-assistants',
        // Other optional/heavy packages
        'google-auth-library', '@fal-ai/client', 'ibm-cloud-sdk-core',
        'node-sql-parser', 'playwright-extra', 'puppeteer-extra-plugin-stealth'
      ];
    },
  },
]);