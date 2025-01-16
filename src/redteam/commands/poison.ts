import chalk from 'chalk';
import type { Command } from 'commander';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getRemoteGenerationUrl } from '../remoteGeneration';

interface PoisonOptions {
  documents: string[];
  goal?: string;
  output?: string;
  outputDir?: string;
  envPath?: string;
}

interface PoisonResponse {
  poisonedDocument: string;
  intendedResult: string;
  task: string;
  originalPath?: string;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function generatePoisonedDocument(document: string, goal?: string): Promise<PoisonResponse> {
  const response = await fetch(getRemoteGenerationUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: 'poison-document',
      document,
      goal,
      email: getUserEmail(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to generate poisoned document, ${response.status} ${response.statusText}: ${await response.text()}`,
    );
  }

  return await response.json();
}

async function doPoisonDocuments(options: PoisonOptions) {
  const results: Partial<PoisonResponse>[] = [];
  const outputPath = options.output || 'poisoned-config.yaml';
  const outputDir = options.outputDir || 'poisoned-documents';

  // Always create output directory since we're always using it
  fs.mkdirSync(outputDir, { recursive: true });

  logger.info(chalk.blue('Generating poisoned documents...'));

  // Collect all document paths, including from directories
  const documentPaths: string[] = [];
  for (const doc of options.documents) {
    if (fs.existsSync(doc)) {
      const stat = fs.statSync(doc);
      if (stat.isDirectory()) {
        documentPaths.push(...getAllFiles(doc));
      } else {
        documentPaths.push(doc);
      }
    } else {
      // Treat as direct content
      documentPaths.push(doc);
    }
  }

  for (const docPath of documentPaths) {
    try {
      let documentContent: string;
      let isFile = false;

      if (fs.existsSync(docPath)) {
        documentContent = fs.readFileSync(docPath, 'utf-8');
        isFile = true;
      } else {
        documentContent = docPath;
      }

      const result = await generatePoisonedDocument(documentContent, options.goal);

      if (isFile) {
        result.originalPath = docPath;
      }

      results.push({
        originalPath: result.originalPath,
        poisonedDocument: result.poisonedDocument,
        intendedResult: result.intendedResult,
      });

      // Always write individual poisoned documents since we have a default outputDir
      let outputFilePath: string;
      if (isFile) {
        // Maintain directory structure relative to current directory
        const relativePath = path.relative(process.cwd(), docPath);
        outputFilePath = path.join(outputDir, relativePath);

        // Create necessary subdirectories
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      } else {
        // Generate a filename for direct content
        const hash = Buffer.from(documentContent).toString('base64').slice(0, 8);
        outputFilePath = path.join(outputDir, `poisoned-${hash}.txt`);
      }

      fs.writeFileSync(outputFilePath, result.poisonedDocument);
      logger.debug(`Wrote poisoned document to ${outputFilePath}`);

      logger.info(chalk.green(`✓ Successfully poisoned ${isFile ? docPath : 'document'}`));
    } catch (error) {
      logger.error(`Failed to poison ${docPath}: ${error}`);
    }
  }

  // Write summary YAML file
  fs.writeFileSync(outputPath, yaml.dump({ documents: results }));
  logger.info(chalk.green(`\nWrote ${results.length} poisoned documents summary to ${outputPath}`));
}

export function poisonCommand(program: Command) {
  program
    .command('poison')
    .description('Generate poisoned documents for RAG testing')
    .argument('<documents...>', 'Documents, directories, or text content to poison')
    .option('-g, --goal <goal>', 'Goal/intended result of the poisoning')
    .option('-o, --output <path>', 'Output YAML file path', 'poisoned-config.yaml')
    .option(
      '-d, --output-dir <path>',
      'Directory to write individual poisoned documents',
      'poisoned-documents',
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (documents: string[], opts: Omit<PoisonOptions, 'documents'>) => {
      setupEnv(opts.envPath);
      telemetry.record('command_used', {
        name: 'redteam poison',
      });
      await telemetry.send();

      try {
        await doPoisonDocuments({
          documents,
          ...opts,
        });
      } catch (error) {
        logger.error(`An unexpected error occurred: ${error}`);
        process.exit(1);
      }
    });
}
