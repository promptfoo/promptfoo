import logger from '../../logger';
import Eval from '../../models/eval';
import telemetry from '../../telemetry';
import { writeOutput } from '../../util';

export async function exportAction(evalId: string, cmdObj: { output?: string }): Promise<void> {
  try {
    let result;
    if (evalId === 'latest') {
      result = await Eval.latest();
    } else {
      result = await Eval.findById(evalId);
    }

    if (!result) {
      logger.error(`No eval found with ID ${evalId}`);
      process.exit(1);
    }
    const summary = await result.toEvaluateSummary();
    const jsonData = JSON.stringify(summary, null, 2);
    if (cmdObj.output) {
      await writeOutput(cmdObj.output, result, null);

      logger.info(`Eval with ID ${evalId} has been successfully exported to ${cmdObj.output}.`);
    } else {
      logger.info(jsonData);
    }

    telemetry.record('command_used', {
      name: 'export',
      evalId,
    });
  } catch (error) {
    logger.error(`Failed to export eval: ${error}`);
    process.exit(1);
  }
}
