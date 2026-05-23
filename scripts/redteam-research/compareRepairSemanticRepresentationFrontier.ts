import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { SignatureModel } from './evaluateRepairSemanticSignatures';

type RouteStabilitySummary = {
  accuracies: number[];
  averageAccuracy: number;
  averageRegret: number;
  stableTaskCount: number;
  unstableTaskCount: number;
};

type RepresentationArtifact = {
  routeStability: {
    holdout: Record<SignatureModel, RouteStabilitySummary>;
  };
  signatureStability: {
    averageLabelSetSimilarity: number;
    averageLabelSlotAgreement: number;
    averageSummarySimilarity: number;
  };
  trialSummaries?: Array<{
    labelTuples?: {
      uniqueTupleCount: number;
    };
  }>;
};

type RepresentationSpec = {
  name: string;
  path: string;
};

type FrontierRow = {
  averageHoldoutAccuracy: number;
  averageHoldoutRegret: number;
  averageLabelSetSimilarity: number;
  averageLabelSlotAgreement: number;
  averageSummarySimilarity: number;
  averageUniqueTupleCount: number | null;
  bestStableModel: SignatureModel | null;
  bestStableLabelModel: SignatureModel | null;
  maxStableLabelHoldoutAccuracy: number;
  maxStableHoldoutAccuracy: number;
  name: string;
  paretoDominatedBy: string[];
  stableHoldoutModelCount: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

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

function summarizeRepresentation(name: string, artifact: RepresentationArtifact): FrontierRow {
  const holdoutSummaries = Object.entries(artifact.routeStability.holdout) as Array<
    [SignatureModel, RouteStabilitySummary]
  >;
  const stableModels = holdoutSummaries.filter(([, summary]) => summary.unstableTaskCount === 0);
  const stableLabelModels = stableModels.filter(([model]) => model !== 'summary-1nn-yield');
  const bestStableModel = [...stableModels].sort(
    ([, left], [, right]) => right.averageAccuracy - left.averageAccuracy,
  )[0];
  const bestStableLabelModel = [...stableLabelModels].sort(
    ([, left], [, right]) => right.averageAccuracy - left.averageAccuracy,
  )[0];
  const tupleCounts =
    artifact.trialSummaries
      ?.map((summary) => summary.labelTuples?.uniqueTupleCount)
      .filter((count): count is number => count !== undefined) ?? [];

  return {
    averageHoldoutAccuracy: mean(holdoutSummaries.map(([, summary]) => summary.averageAccuracy)),
    averageHoldoutRegret: mean(holdoutSummaries.map(([, summary]) => summary.averageRegret)),
    averageLabelSetSimilarity: artifact.signatureStability.averageLabelSetSimilarity,
    averageLabelSlotAgreement: artifact.signatureStability.averageLabelSlotAgreement,
    averageSummarySimilarity: artifact.signatureStability.averageSummarySimilarity,
    averageUniqueTupleCount: tupleCounts.length > 0 ? mean(tupleCounts) : null,
    bestStableModel: bestStableModel?.[0] ?? null,
    bestStableLabelModel: bestStableLabelModel?.[0] ?? null,
    maxStableLabelHoldoutAccuracy: bestStableLabelModel?.[1].averageAccuracy ?? 0,
    maxStableHoldoutAccuracy: bestStableModel?.[1].averageAccuracy ?? 0,
    name,
    paretoDominatedBy: [],
    stableHoldoutModelCount: stableModels.length,
  };
}

function dominates(left: FrontierRow, right: FrontierRow): boolean {
  const atLeastAsGoodOnEveryAxis =
    left.averageLabelSlotAgreement >= right.averageLabelSlotAgreement &&
    left.maxStableLabelHoldoutAccuracy >= right.maxStableLabelHoldoutAccuracy &&
    (left.averageUniqueTupleCount ?? 0) >= (right.averageUniqueTupleCount ?? 0);
  const strictlyBetterOnSomeAxis =
    left.averageLabelSlotAgreement > right.averageLabelSlotAgreement ||
    left.maxStableLabelHoldoutAccuracy > right.maxStableLabelHoldoutAccuracy ||
    (left.averageUniqueTupleCount ?? 0) > (right.averageUniqueTupleCount ?? 0);
  return atLeastAsGoodOnEveryAxis && strictlyBetterOnSomeAxis;
}

function addParetoDominance(rows: FrontierRow[]): FrontierRow[] {
  return rows.map((row) => ({
    ...row,
    paretoDominatedBy: rows
      .filter((candidate) => candidate.name !== row.name && dominates(candidate, row))
      .map((candidate) => candidate.name),
  }));
}

async function main() {
  const specs = process.argv.slice(2).map(parseSpec);
  if (specs.length < 2) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/compareRepairSemanticRepresentationFrontier.ts <name>=<artifact.json> <name>=<artifact.json> [...]',
    );
  }
  const rows = addParetoDominance(
    await Promise.all(
      specs.map(async ({ name, path }) => summarizeRepresentation(name, await loadArtifact(path))),
    ),
  ).sort((left, right) => {
    if (right.maxStableLabelHoldoutAccuracy !== left.maxStableLabelHoldoutAccuracy) {
      return right.maxStableLabelHoldoutAccuracy - left.maxStableLabelHoldoutAccuracy;
    }
    if (right.averageUniqueTupleCount !== left.averageUniqueTupleCount) {
      return (right.averageUniqueTupleCount ?? 0) - (left.averageUniqueTupleCount ?? 0);
    }
    return right.averageLabelSlotAgreement - left.averageLabelSlotAgreement;
  });

  console.log(
    JSON.stringify(
      {
        frontier: rows.filter((row) => row.paretoDominatedBy.length === 0),
        rows,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
