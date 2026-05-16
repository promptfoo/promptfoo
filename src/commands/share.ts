import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import dedent from 'dedent';
import { getDefaultShareViewBaseUrl } from '../constants';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import ModelAudit from '../models/modelAudit';
import {
  createShareableModelAuditUrl,
  createShareableUrl,
  getShareableModelAuditUrl,
  getShareableUrl,
  hasEvalBeenShared,
  hasModelAuditBeenShared,
  isModelAuditSharingEnabled,
  isSharingEnabled,
} from '../share';
import { loadDefaultConfig } from '../util/config/default';
import type { Command } from 'commander';

type ShareCommandOptions = {
  yes: boolean;
  envPath?: string;
  showAuth: boolean;
} & Command;

type ShareTarget =
  | { kind: 'eval'; evalRecord: Eval }
  | { kind: 'audit'; auditRecord: ModelAudit }
  | { kind: 'error' };

export function notCloudEnabledShareInstructions(): void {
  const cloudUrl = getDefaultShareViewBaseUrl();
  const welcomeUrl = `${cloudUrl}/welcome`;

  logger.info(dedent`

    » You need to have a cloud account to securely share your results.

    1. Please go to ${chalk.greenBright.bold(cloudUrl)} to sign up or log in.
    2. Follow the instructions at ${chalk.greenBright.bold(welcomeUrl)} to login to the command line.
    3. Run ${chalk.greenBright.bold('promptfoo share')}
  `);
}

export async function createAndDisplayShareableUrl(
  evalRecord: Eval,
  showAuth: boolean,
): Promise<string | null> {
  const url = await createShareableUrl(evalRecord, { showAuth });

  if (url) {
    logger.info(`View results: ${chalk.greenBright.bold(url)}`);
  } else {
    logger.error(`Failed to create shareable URL for eval ${evalRecord.id}`);
    process.exitCode = 1;
  }
  return url;
}

export async function createAndDisplayShareableModelAuditUrl(
  auditRecord: ModelAudit,
  showAuth: boolean,
): Promise<string | null> {
  const url = await createShareableModelAuditUrl(auditRecord, showAuth);

  if (url) {
    logger.info(`View ModelAudit Scan Results: ${chalk.greenBright.bold(url)}`);
  } else {
    logger.error(`Failed to create shareable URL for model audit ${auditRecord.id}`);
    process.exitCode = 1;
  }
  return url;
}

async function resolveShareTarget(id: string | undefined): Promise<ShareTarget> {
  if (id) {
    if (id.startsWith('scan-')) {
      const auditRecord = await ModelAudit.findById(id);
      if (!auditRecord) {
        logger.error(`Could not find model audit with ID ${chalk.bold(id)}.`);
        process.exitCode = 1;
        return { kind: 'error' };
      }
      return { kind: 'audit', auditRecord };
    }

    const evalRecord = await Eval.findById(id);
    if (!evalRecord) {
      logger.error(`Could not find eval with ID ${chalk.bold(id)}.`);
      process.exitCode = 1;
      return { kind: 'error' };
    }
    return { kind: 'eval', evalRecord };
  }

  const [latestEval, latestAudit] = await Promise.all([Eval.latest(), ModelAudit.latest()]);
  if (!latestEval && !latestAudit) {
    logger.error(
      'Could not load results. Do you need to run `promptfoo eval` or `promptfoo scan-model` first?',
    );
    process.exitCode = 1;
    return { kind: 'error' };
  }

  const evalTime = latestEval?.createdAt || 0;
  const auditTime = latestAudit?.createdAt || 0;
  return evalTime > auditTime && latestEval
    ? { kind: 'eval', evalRecord: latestEval }
    : { kind: 'audit', auditRecord: latestAudit as ModelAudit };
}

async function applyCurrentSharingConfig(evalRecord: Eval) {
  try {
    const { defaultConfig: currentConfig } = await loadDefaultConfig();
    if (currentConfig?.sharing) {
      evalRecord.config.sharing = currentConfig.sharing;
      logger.debug(
        `Applied sharing config from promptfooconfig.yaml: ${JSON.stringify(currentConfig.sharing)}`,
      );
    }
  } catch (err) {
    logger.debug(`Could not load config: ${err}`);
  }
}

function validateShareableEval(evalRecord: Eval): boolean {
  if (evalRecord.prompts.length > 0) {
    return true;
  }
  logger.error(
    dedent`
      Eval ${chalk.bold(evalRecord.id)} cannot be shared.
      This may be because the eval is still running or because it did not complete successfully.
      If your eval is still running, wait for it to complete and try again.
    `,
  );
  process.exitCode = 1;
  return false;
}

async function confirmEvalOverwrite(evalRecord: Eval, showAuth: boolean): Promise<boolean> {
  if (!cloudConfig.isEnabled() || !(await hasEvalBeenShared(evalRecord))) {
    return true;
  }
  const url = await getShareableUrl(evalRecord, evalRecord.id, showAuth);
  try {
    return await confirm({
      message: dedent`
        Already shared at:
          ${chalk.cyan(url)}

        Re-share (will overwrite existing data)?
      `,
    });
  } catch {
    process.exitCode = 0;
    return false;
  }
}

async function shareEval(evalRecord: Eval, cmdObj: ShareCommandOptions) {
  logger.info(`Sharing eval ${evalRecord.id}`);
  await applyCurrentSharingConfig(evalRecord);
  if (!validateShareableEval(evalRecord)) {
    return;
  }
  if (!isSharingEnabled(evalRecord)) {
    notCloudEnabledShareInstructions();
    process.exitCode = 1;
    return;
  }
  if (!(await confirmEvalOverwrite(evalRecord, cmdObj.showAuth))) {
    process.exitCode = 0;
    return;
  }
  await createAndDisplayShareableUrl(evalRecord, cmdObj.showAuth);
}

async function confirmAuditOverwrite(auditRecord: ModelAudit, showAuth: boolean): Promise<boolean> {
  if (!cloudConfig.isEnabled() || !(await hasModelAuditBeenShared(auditRecord))) {
    return true;
  }
  const url = getShareableModelAuditUrl(auditRecord, auditRecord.id, showAuth);
  return confirm({
    message: `This model audit is already shared at ${url}. Sharing it again will overwrite the existing data. Continue?`,
  });
}

async function shareAudit(auditRecord: ModelAudit, cmdObj: ShareCommandOptions) {
  logger.info(`Sharing model audit ${auditRecord.id}`);
  if (!isModelAuditSharingEnabled()) {
    notCloudEnabledShareInstructions();
    process.exitCode = 1;
    return;
  }
  if (!(await confirmAuditOverwrite(auditRecord, cmdObj.showAuth))) {
    process.exitCode = 0;
    return;
  }
  await createAndDisplayShareableModelAuditUrl(auditRecord, cmdObj.showAuth);
}

export function shareCommand(program: Command) {
  program
    .command('share [id]')
    .description(
      'Create a shareable URL of an eval or a model audit (defaults to most recent)' + '\n\n',
    )
    .option(
      '--show-auth',
      'Show username/password authentication information in the URL if exists',
      false,
    )
    // NOTE: Added in 0.109.1 after migrating sharing to promptfoo.app in 0.108.0
    .option(
      '-y, --yes',
      'Flag does nothing (maintained for backwards compatibility only - shares are now private by default)',
      false,
    )
    .action(
      async (id: string | undefined, cmdObj: ShareCommandOptions) => {
        const target = await resolveShareTarget(id);
        if (target.kind === 'error') {
          return;
        }
        if (target.kind === 'eval') {
          await shareEval(target.evalRecord, cmdObj);
          return;
        }
        await shareAudit(target.auditRecord, cmdObj);
      },
    );
}
