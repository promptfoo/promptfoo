import confirm from '@inquirer/confirm';
import select from '@inquirer/select';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { VERSION } from '../../constants';
import logger from '../../logger';
import { initializeProject } from '../../onboarding';
import telemetry from '../../telemetry';
import { isRunningUnderNpx } from '../../util';

const GITHUB_API_BASE = 'https://api.github.com';

export async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const content = await response.text();
  await fs.writeFile(filePath, content);
}

export async function downloadDirectory(dirPath: string, targetDir: string): Promise<void> {
  // First try with VERSION
  const url = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=${VERSION}`;
  let response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  // If VERSION fails, try with 'main'
  if (!response.ok) {
    const mainUrl = `${GITHUB_API_BASE}/repos/promptfoo/promptfoo/contents/examples/${dirPath}?ref=main`;
    response = await fetch(mainUrl, {
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

  const contents = (await response.json()) as Array<{
    name: string;
    type: string;
    download_url: string;
    path: string;
  }>;

  await fs.mkdir(targetDir, { recursive: true });

  for (const item of contents) {
    const itemPath = path.join(targetDir, item.name);
    if (item.type === 'file') {
      await downloadFile(item.download_url, itemPath);
    } else if (item.type === 'dir') {
      await downloadDirectory(item.path.replace('examples/', ''), itemPath);
    }
  }
}

export const EXAMPLES = [
  {
    name: 'summarization',
    description: 'Test summarization with different models',
    value: 'summarization',
  },
  { name: 'gpt-4o-vs-gpt-4o-mini', description: 'Compare GPT models', value: 'compare-gpt' },
  {
    name: 'self-grading',
    description: 'Create your own LLM grader for custom metrics',
    value: 'self-grading',
  },
  {
    name: 'rag',
    description: 'Evaluate a Retrieval-Augmented Generation (RAG) system',
    value: 'rag',
  },
  {
    name: 'agent',
    description: 'Evaluate a customer support agent with tool use',
    value: 'agent',
  },
  {
    name: 'python',
    description: 'Call a Python script as a custom provider',
    value: 'python-provider',
  },
  {
    name: 'javascript',
    description: 'Call a JavaScript as a custom provider',
    value: 'js-provider',
  },
  {
    name: 'multiple',
    description: 'Run multiple evaluations with different configurations',
    value: 'multiple-configs',
  },
  {
    name: 'cloudflare-ai',
    description: 'Use models from Cloudflare AI',
    value: 'cloudflare-ai',
  },
  {
    name: 'mistral-ai',
    description: 'Use models from Mistral AI',
    value: 'mistral-ai',
  },
  {
    name: 'langchain',
    description: 'Use Langchain as a provider',
    value: 'langchain',
  },
  {
    name: 'redteam',
    description: 'Red-team an LLM app for security, bias, and more',
    value: 'redteam',
  },
  {
    name: 'roadrunner-code-execution',
    description: 'Evaluate code execution on the RoadRunner dataset',
    value: 'roadrunner-code-execution',
  },
  {
    name: 'custom-prompt-functions',
    description: 'Build multi-turn conversations with custom prompt functions',
    value: 'custom-prompt-functions',
  },
] as const;

async function handleExampleDownload(
  directory: string | null,
  exampleOption: boolean | string | undefined,
): Promise<string | null> {
  // Handle --example without value
  if (exampleOption === true) {
    const selectedExample = await select({
      message: 'Select an example to download:',
      choices: EXAMPLES,
    });
    const targetDir = directory || selectedExample;
    await downloadDirectory(selectedExample, targetDir);
    logger.info(`Downloaded example "${selectedExample}" to ./${targetDir}`);
    logger.info(
      `Run ${chalk.greenBright(`cd ${targetDir} && ${isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo'} eval`)} to get started`,
    );
    return selectedExample;
  }

  // Handle --example with value
  if (typeof exampleOption === 'string') {
    const example = EXAMPLES.find((ex) => ex.value === exampleOption);
    if (!example) {
      logger.error(
        `Example "${exampleOption}" not found. Available examples: ${EXAMPLES.map((ex) => ex.value).join(', ')}`,
      );
      throw new Error(`Example "${exampleOption}" not found`);
    }
    const targetDir = directory || exampleOption;
    await downloadDirectory(exampleOption, targetDir);
    logger.info(`Downloaded example "${exampleOption}" to ./${targetDir}`);
    logger.info(
      `Run ${chalk.greenBright(`cd ${targetDir} && ${isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo'} eval`)} to get started`,
    );
    return exampleOption;
  }

  return null;
}

interface InitCommandOptions {
  interactive: boolean;
  example?: boolean | string;
}

export async function initAction(
  directory: string | null,
  cmdObj: InitCommandOptions,
): Promise<void> {
  telemetry.record('command_used', {
    name: 'init - started',
  });

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
}
