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
  verbose?: boolean;
}

interface PoisonResponse {
  poisonedDocument: string;
  intendedResult: string;
  task: string;
  originalPath?: string;
}

type FilePath = string;
type DirectoryPath = string;
type DocumentContent = string;

type DocumentLike = FilePath | DirectoryPath | DocumentContent;

type Document = {
  docLike: FilePath | DocumentContent;
  isFile: boolean;
  dir: string | null;
};

export function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
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

export async function generatePoisonedDocument(
  document: string,
  goal?: PoisonOptions['goal'],
): Promise<PoisonResponse> {
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

/**
 * Poisons an individual document.
 * @param docLike A path to a document or document content to poison.
 */
export async function poisonDocument(
  doc: Document,
  outputDir: string,
  goal?: PoisonOptions['goal'],
): Promise<Partial<PoisonResponse>> {
  logger.debug(`Poisoning ${JSON.stringify(doc)}`);

  try {
    const documentContent = doc.isFile ? fs.readFileSync(doc.docLike, 'utf-8') : doc.docLike;
    const result = await generatePoisonedDocument(documentContent, goal);

    if (doc.isFile) {
      result.originalPath = doc.docLike;
    }

    let outputFilePath: string;
    if (doc.isFile) {
      // If the document was loaded from a directory, strip the directory prefix.
      // Otherwise, use the relative path to the current directory.
      const docPath = doc.dir
        ? doc.docLike.replace(doc.dir, '')
        : path.relative(process.cwd(), doc.docLike);

      outputFilePath = path.join(outputDir, docPath);

      // Create necessary subdirectories
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    } else {
      // Generate a filename for / from the document content
      const hash = Buffer.from(documentContent).toString('base64').slice(0, 8);
      outputFilePath = path.join(outputDir, `poisoned-${hash}.txt`);
    }

    fs.writeFileSync(outputFilePath, result.poisonedDocument);
    logger.debug(`Wrote poisoned document to ${outputFilePath}`);

    logger.info(chalk.green(`✓ Successfully poisoned ${doc.isFile ? doc.docLike : 'document'}`));

    return {
      originalPath: result.originalPath,
      poisonedDocument: result.poisonedDocument,
      intendedResult: result.intendedResult,
    };
  } catch (error) {
    throw new Error(`Failed to poison ${doc.docLike}: ${error}`);
  }
}

export async function doPoisonDocuments(options: PoisonOptions) {
  const outputPath = options.output || 'poisoned-config.yaml';
  const outputDir = options.outputDir || 'poisoned-documents';

  // Always create output directory since we're always using it
  fs.mkdirSync(outputDir, { recursive: true });

  logger.info(chalk.blue('Generating poisoned documents...'));

  // Collect all document paths, including from directories
  let docs: Document[] = [];

  for (const doc of options.documents) {
    // Is the document a ∈{file|directory} path or document content?
    if (fs.existsSync(doc)) {
      const stat = fs.statSync(doc);
      if (stat.isDirectory()) {
        docs = [
          ...docs,
          ...getAllFiles(doc).map((file) => ({ docLike: file, isFile: true, dir: doc })),
        ];
      } else {
        docs = [...docs, { docLike: doc, isFile: true, dir: null }];
      }
    } else {
      // Treat as direct content
      docs.push({ docLike: doc, isFile: false, dir: null });
    }
  }

  // Poison all documents
  const results: Partial<PoisonResponse>[] = await Promise.all(
    docs.map((doc) => poisonDocument(doc, outputDir, options.goal)),
  );

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
    .action(async (documents: DocumentLike[], opts: Omit<PoisonOptions, 'documents'>) => {
      setupEnv(opts.envPath);
      telemetry.record('command_used', {
        name: 'redteam poison',
      });

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
