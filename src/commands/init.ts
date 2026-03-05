import fs from 'fs/promises';
import path from 'path';

import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import chalk from 'chalk';
import dedent from 'dedent';
import { VERSION } from '../constants';
import logger from '../logger';
import { initializeProject } from '../onboarding';
import telemetry from '../telemetry';
import { fetchWithProxy } from '../util/fetch/index';
import { promptfooCommand } from '../util/promptfooCommand';
import type { Command } from 'commander';

const GITHUB_API_BASE = 'https://api.github.com';

// Maps old example names to their new names after the category prefix reorganization.
// This ensures `npx promptfoo init --example <old-name>` still works.
const EXAMPLE_ALIASES: Record<string, string> = {
  'agentic-sdk-comparison': 'compare-agentic-sdks',
  'amazon-sagemaker': 'provider-amazon-sagemaker',
  'assertion-scoring-override': 'eval-assertion-scoring-override',
  'assertions-generate': 'eval-assertions-generate',
  'bedrock-agents': 'amazon-bedrock',
  'bedrock-video': 'amazon-bedrock',
  'bert-score': 'eval-bert-score',
  'browser-existing-session': 'integration-browser',
  cerebras: 'provider-cerebras',
  'claude-vs-gpt': 'compare-claude-vs-gpt',
  'claude-vs-gpt-image': 'compare-claude-vs-gpt-image',
  'cloudflare-ai': 'provider-cloudflare',
  'cloudflare-gateway': 'provider-cloudflare',
  cohere: 'provider-cohere',
  'cohere-benchmark': 'provider-cohere-benchmark',
  cometapi: 'provider-cometapi',
  'conversation-relevance': 'eval-conversation-relevance',
  crewai: 'integration-crewai',
  'csv-metadata': 'config-csv-metadata',
  'custom-grader-csv': 'eval-custom-grader-csv',
  'custom-grading-prompt': 'eval-custom-grading-prompt',
  'custom-prompt-function': 'config-custom-prompt-function',
  'custom-provider': 'provider-custom',
  'custom-provider-embeddings': 'provider-custom',
  'custom-provider-mjs': 'provider-custom',
  'custom-provider-typescript': 'provider-custom',
  cyberseceval: 'redteam-cyberseceval',
  databricks: 'provider-databricks',
  'deepseek-r1-vs-openai-o1': 'compare-deepseek-r1-vs-openai-o1',
  docker: 'integration-docker',
  'docker-code-generation-sandbox': 'integration-docker',
  donotanswer: 'redteam-donotanswer',
  'dynamic-var': 'config-dynamic-var',
  'e2b-code-eval': 'integration-e2b',
  'elevenlabs-agents': 'provider-elevenlabs',
  'elevenlabs-alignment': 'provider-elevenlabs',
  'elevenlabs-isolation': 'provider-elevenlabs',
  'elevenlabs-stt': 'provider-elevenlabs',
  'elevenlabs-tts': 'provider-elevenlabs',
  'elevenlabs-tts-advanced': 'provider-elevenlabs',
  'errors-vs-failures': 'eval-errors-vs-failures',
  'executable-prompts': 'config-executable-prompts',
  'extension-api': 'config-extension-api',
  'external-defaulttest': 'config-external-defaulttest',
  'external-provider-config': 'config-external-provider-config',
  'f-score': 'eval-f-score',
  'fal-image-generation': 'provider-fal',
  'function-tools-callback': 'eval-function-tools-callback',
  'g-eval': 'eval-g-eval',
  'github-action': 'integration-github-action',
  'github-models': 'provider-github-models',
  'golang-provider': 'provider-golang',
  'google-adk-example': 'integration-google-adk',
  'google-sheets': 'integration-google-sheets',
  'gpt-4o-temperature-comparison': 'compare-gpt-temperature',
  'gpt-4o-vs-4o-mini': 'compare-gpt-4o-vs-4o-mini',
  'grok-4-political-bias': 'redteam-grok-4-political-bias',
  groq: 'provider-groq',
  harmbench: 'redteam-harmbench',
  'headless-browser': 'integration-browser',
  helicone: 'integration-helicone',
  'http-provider': 'provider-http',
  'http-provider-auth-signature': 'provider-http',
  'http-provider-auth-signature-jks': 'provider-http',
  'http-provider-auth-signature-pfx': 'provider-http',
  'http-provider-streaming': 'provider-http',
  'http-provider-tls': 'provider-http',
  'huggingface-chat': 'huggingface',
  'huggingface-dataset': 'huggingface',
  'huggingface-dataset-factuality': 'huggingface',
  'huggingface-hate-speech-detection': 'huggingface',
  'huggingface-hle': 'huggingface',
  'huggingface-inference-endpoint': 'huggingface',
  'huggingface-pii': 'huggingface',
  'huggingface-similarity': 'huggingface',
  hyperbolic: 'provider-hyperbolic',
  'image-classification': 'eval-image-classification',
  'javascript-assert-external': 'eval-javascript-assert-external',
  'javascript-test-cases': 'config-javascript-test-cases',
  'jest-integration': 'integration-jest',
  'js-config': 'config-js',
  'json-output': 'eval-json-output',
  'jsonl-test-cases': 'config-jsonl-test-cases',
  'langchain-python': 'integration-langchain',
  'langfuse-labels': 'integration-langfuse',
  langgraph: 'integration-langgraph',
  litellm: 'provider-litellm',
  'llama-cpp': 'provider-llama-cpp',
  'llama-gpt-comparison': 'compare-llama-vs-gpt',
  'lm-studio': 'provider-lm-studio',
  'max-score-selection': 'eval-max-score-selection',
  'mistral-llama-comparison': 'compare-mistral-vs-llama',
  'model-armor': 'provider-model-armor',
  'modelslab-image-generation': 'provider-modelslab',
  moderation: 'eval-moderation',
  'multiple-configs': 'config-multiple-configs',
  'multiple-translations': 'config-multiple-translations',
  'multiple-turn-conversation': 'config-multi-turn',
  multishot: 'config-multishot',
  'named-metrics': 'eval-named-metrics',
  'node-module-package': 'config-node-module-package',
  'node-package': 'config-node-package',
  'node-package-typescript': 'config-node-package-typescript',
  nscale: 'provider-nscale',
  'nunjucks-custom-filters': 'config-nunjucks-custom-filters',
  'openai-gpt-5-vs-gpt-5-mini-mmlu': 'compare-gpt-5-vs-gpt-5-mini-mmlu',
  'openai-model-comparison': 'compare-openai-models',
  openclaw: 'provider-openclaw',
  'opencode-sdk': 'provider-opencode-sdk',
  'opentelemetry-tracing': 'integration-opentelemetry',
  'opentelemetry-tracing-python': 'integration-opentelemetry',
  'otel-tracing': 'integration-opentelemetry',
  'pdf-files': 'config-pdf-files',
  'pdf-variables': 'config-pdf-variables',
  'perplexity.ai-example': 'provider-perplexity',
  'phi-vs-llama': 'compare-phi-vs-llama',
  'portkey-test': 'provider-portkey',
  'prompt-labels': 'config-prompt-labels',
  'prompts-per-model': 'config-prompts-per-model',
  'pydantic-ai': 'integration-pydantic-ai',
  'python-assert': 'eval-python-assert',
  'python-provider': 'provider-python',
  'python-test-cases': 'config-python-test-cases',
  quiverai: 'provider-quiverai',
  'rag-eval': 'eval-rag',
  'rag-full': 'eval-rag-full',
  'replicate-comprehensive': 'provider-replicate',
  'replicate-image-generation': 'provider-replicate',
  'replicate-lifeboat': 'provider-replicate',
  'replicate-llama-guard-moderation': 'provider-replicate',
  'replicate-llama4-scout': 'provider-replicate',
  'replicate-quickstart': 'provider-replicate',
  'result-hooks': 'config-result-hooks',
  'retry-testing': 'config-retry-testing',
  'ruby-provider': 'provider-ruby',
  'search-rubric': 'eval-search-rubric',
  'select-best-example': 'eval-select-best',
  'self-grading': 'eval-self-grading',
  'separate-test-configs': 'config-separate-test-configs',
  'sharepoint-integration': 'integration-sharepoint',
  'slack-human-feedback': 'integration-slack',
  'sql-validation': 'eval-sql-validation',
  'standalone-assertions': 'eval-standalone-assertions',
  'stateful-session-management': 'config-stateful-session-management',
  'store-and-reuse-outputs': 'config-store-and-reuse-outputs',
  'strands-agents': 'integration-strands-agents',
  'structured-outputs-config': 'config-structured-outputs',
  summarization: 'eval-summarization',
  'tau-simulated-user': 'integration-tau',
  'test-markdown': 'eval-markdown-rendering',
  'tests-per-prompt': 'config-tests-per-prompt',
  'tests-per-provider': 'config-tests-per-provider',
  'tool-use': 'eval-tool-use',
  'transform-file': 'config-transform-file',
  'transformers-local': 'provider-transformers-local',
  truefoundry: 'provider-truefoundry',
  'ts-config': 'config-ts',
  'vars-referencing-vars': 'config-vars-referencing-vars',
  'vercel-ai-gateway': 'integration-vercel',
  'vercel-ai-sdk': 'integration-vercel',
  'voyage-embeddings': 'provider-voyage-embeddings',
  watsonx: 'provider-watsonx',
  websockets: 'config-websockets',
  'websockets-streaming': 'config-websockets',
  'xai-video': 'xai',
  'xai-voice': 'xai',
  xstest: 'redteam-xstest',
};

export async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetchWithProxy(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

export async function downloadDirectory(dirPath: string, targetDir: string): Promise<void> {
  // First try with VERSION
  const url = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=${VERSION}`;
  let response = await fetchWithProxy(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  // If VERSION fails, try with 'main'
  if (!response.ok) {
    const mainUrl = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=main`;
    response = await fetchWithProxy(mainUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'promptfoo-cli',
      },
    });

    // If both attempts fail, throw an error
    if (!response.ok) {
      throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
    }
  }

  const contents = await response.json();

  for (const item of contents) {
    const itemPath = path.join(targetDir, item.name);
    if (item.type === 'file') {
      await downloadFile(item.download_url, itemPath);
    } else if (item.type === 'dir') {
      await fs.mkdir(itemPath, { recursive: true });
      await downloadDirectory(`${dirPath}/${item.name}`, itemPath);
    }
  }
}

export async function downloadExample(exampleName: string, targetDir: string): Promise<void> {
  let dirAlreadyExists = false;
  try {
    await fs.access(targetDir);
    dirAlreadyExists = true;
  } catch {
    // Directory doesn't exist, continue
  }
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await downloadDirectory(exampleName, targetDir);
  } catch (error) {
    if (!dirAlreadyExists) {
      try {
        await fs.rm(targetDir, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to remove directory: ${error}`);
      }
    }
    throw new Error(
      `Failed to download example: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export async function getExamplesList(): Promise<string[]> {
  try {
    const response = await fetchWithProxy(
      `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples?ref=${VERSION}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'promptfoo-cli',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Array<{ name: string; type: string }>;

    // Filter for directories only
    return data.filter((item) => item.type === 'dir').map((item) => item.name);
  } catch (error) {
    logger.error(
      `Failed to fetch examples list: ${error instanceof Error ? error.message : error}`,
    );
    return []; // Return an empty array if fetching fails
  }
}

async function selectExample(): Promise<string> {
  const examples = await getExamplesList();
  const choices = [
    { name: 'None (initialize with dummy files)', value: '' },
    ...examples.map((ex) => ({ name: ex, value: ex })),
  ];

  const selectedExample = await select({
    message: 'Choose an example to download:',
    choices,
  });
  return selectedExample;
}

export async function handleExampleDownload(
  directory: string | null,
  example: string | boolean | undefined,
): Promise<string | undefined> {
  let exampleName: string | undefined;

  if (example === true) {
    exampleName = await selectExample();
  } else if (typeof example === 'string') {
    const resolved = EXAMPLE_ALIASES[example];
    if (resolved) {
      logger.info(chalk.yellow(`Example '${example}' has been renamed to '${resolved}'.`));
      exampleName = resolved;
    } else {
      exampleName = example;
    }
  }

  let attemptDownload = true;
  while (attemptDownload && exampleName) {
    const targetDir = path.join(directory || '.', exampleName);
    try {
      await downloadExample(exampleName, targetDir);
      logger.info(chalk.green(`✅ Example project '${exampleName}' written to: ${targetDir}`));
      attemptDownload = false;
    } catch (error) {
      logger.error(`Failed to download example: ${error instanceof Error ? error.message : error}`);
      attemptDownload = await confirm({
        message: 'Would you like to try downloading a different example?',
        default: true,
      });
      if (attemptDownload) {
        exampleName = await selectExample();
      } else {
        // User declined to try downloading a different example
        logger.info(
          dedent`

          No example downloaded. To get started, try:

            ${chalk.bold('promptfoo init --example')}    (browse and select an example)
            ${chalk.bold('promptfoo init')}              (create a basic project)

           `,
        );
        return exampleName;
      }
    }
  }

  if (!exampleName) {
    return;
  }

  const basePath = directory && directory !== '.' ? `${directory}/` : '';
  const readmePath = path.join(basePath, exampleName, 'README.md');
  const cdCommand = `cd ${path.join(basePath, exampleName)}`;

  if (exampleName.includes('redteam')) {
    logger.info(
      dedent`

      View the README file at ${chalk.bold(readmePath)} to get started!
      `,
    );
  } else {
    const runCommand = promptfooCommand('eval');
    logger.info(
      dedent`

      View the README at ${chalk.bold(readmePath)} or run:

      \`${chalk.bold(`${cdCommand} && ${runCommand}`)}\`

      to get started!
      `,
    );
  }

  return exampleName;
}

interface InitCommandOptions {
  interactive: boolean;
  example: string | boolean | undefined;
}

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Set up a new promptfoo project with prompts, providers, and test cases')
    .option('--no-interactive', 'Do not run in interactive mode')
    .option('--example [name]', 'Download an example from the promptfoo repo')
    .action(async (directory: string | null, cmdObj: InitCommandOptions) => {
      if (directory === 'redteam' && cmdObj.interactive) {
        const useRedteam = await confirm({
          message:
            'You specified "redteam" as the directory. Did you mean to write "promptfoo redteam init" instead?',
          default: false,
        });
        if (useRedteam) {
          logger.warn('Please use "promptfoo redteam init" to initialize a red teaming project.');
          return;
        }
      }

      const exampleName = await handleExampleDownload(directory, cmdObj.example);

      if (exampleName) {
        telemetry.record('command_used', {
          example: exampleName,
          name: 'init',
        });
      } else {
        const details = await initializeProject(directory, cmdObj.interactive);
        telemetry.record('command_used', {
          ...details,
          name: 'init',
        });
      }
    });
}
