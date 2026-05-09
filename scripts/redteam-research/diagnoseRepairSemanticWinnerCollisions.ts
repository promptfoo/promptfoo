import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { observedOutcomes, type PromptProfile } from './buildRepairOutcomeTable';

import type { SemanticSignature } from './evaluateRepairSemanticSignatures';

type RepresentationArtifact = {
  trialSummaries: Array<{
    signatures?: Record<string, SemanticSignature>;
    trial: number;
  }>;
};

type TupleCollisionGroup = {
  taskIds: string[];
  tuple: string;
  winners: PromptProfile[];
};

type TupleCollisionSummary = {
  mixedWinnerGroupCount: number;
  mixedWinnerGroups: TupleCollisionGroup[];
  sameWinnerGroupCount: number;
  trial: number;
};

type RepresentationSpec = {
  name: string;
  path: string;
};

function parseSpec(spec: string): RepresentationSpec {
  const separatorIndex = spec.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(`Invalid representation spec "${spec}". Expected <name>=<artifact.json>.`);
  }
  return {
    name: spec.slice(0, separatorIndex),
    path: spec.slice(separatorIndex + 1),
  };
}

async function loadArtifact(path: string): Promise<RepresentationArtifact> {
  return JSON.parse(await readFile(path, 'utf8')) as RepresentationArtifact;
}

function summarizeTupleCollisions(
  signatures: Record<string, SemanticSignature>,
  trial: number,
): TupleCollisionSummary {
  const grouped = Object.entries(signatures).reduce<Map<string, string[]>>(
    (groups, [taskId, signature]) => {
      const tuple = signature.labels.join('|');
      const taskIds = groups.get(tuple) ?? [];
      groups.set(tuple, [...taskIds, taskId]);
      return groups;
    },
    new Map(),
  );
  const groupedEntries = [...grouped.entries()]
    .map(([tuple, taskIds]) => ({
      taskIds,
      tuple,
      winners: [...new Set(taskIds.map((taskId) => observedOutcomes[taskId].observedWinner))],
    }))
    .filter((group) => group.taskIds.length > 1);

  return {
    mixedWinnerGroupCount: groupedEntries.filter((group) => group.winners.length > 1).length,
    mixedWinnerGroups: groupedEntries.filter((group) => group.winners.length > 1),
    sameWinnerGroupCount: groupedEntries.filter((group) => group.winners.length === 1).length,
    trial,
  };
}

async function main() {
  const specs = process.argv.slice(2).map(parseSpec);
  if (specs.length === 0) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/diagnoseRepairSemanticWinnerCollisions.ts <name>=<artifact.json> [...]',
    );
  }
  const representations = await Promise.all(
    specs.map(async ({ name, path }) => {
      const artifact = await loadArtifact(path);
      const tupleCollisions = artifact.trialSummaries.map((summary) => {
        if (!summary.signatures) {
          throw new Error(`Artifact for ${name} is missing trialSummaries[].signatures`);
        }
        return summarizeTupleCollisions(summary.signatures, summary.trial);
      });
      return {
        averageMixedWinnerGroupCount:
          tupleCollisions.reduce((sum, trial) => sum + trial.mixedWinnerGroupCount, 0) /
          tupleCollisions.length,
        averageSameWinnerGroupCount:
          tupleCollisions.reduce((sum, trial) => sum + trial.sameWinnerGroupCount, 0) /
          tupleCollisions.length,
        name,
        tupleCollisions,
      };
    }),
  );

  console.log(JSON.stringify({ representations }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
