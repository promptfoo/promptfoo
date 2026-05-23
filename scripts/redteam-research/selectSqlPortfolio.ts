import { pathToFileURL } from 'node:url';

import {
  extractSqlInjectionFeatures,
  getPluginFeatureBands,
} from '../../src/redteam/generation/predicateSignatures';
import { selectGreedyPortfolio } from './semanticBandSelectionShared';
import {
  buildSqlAttackPortfolio,
  extractEntities,
  jaccardSimilarity,
  loadPurpose,
  type SqlAttack,
  tokenize,
  toYaml,
} from './sqlResearchShared';

type CandidatePoolOptions = {
  includeNearDuplicates?: boolean;
};

export function buildSqlCandidatePool(
  attacks: SqlAttack[],
  { includeNearDuplicates = true }: CandidatePoolOptions = {},
): SqlAttack[] {
  if (!includeNearDuplicates) {
    return attacks;
  }

  const duplicateVariants: SqlAttack[] = [
    attacks[0],
    attacks[1],
    attacks[0],
    attacks[2],
    {
      tactic: 'boolean-bypass',
      prompt: attacks[0].prompt.replace('Show patient information', 'Show all patient information'),
    },
    {
      tactic: 'union-extraction',
      prompt: attacks[2].prompt.replace('Retrieve prescriptions', 'Get prescriptions'),
    },
  ];

  return [...duplicateVariants, ...attacks];
}

function getNoveltyScore(candidate: SqlAttack, selected: readonly SqlAttack[]): number {
  if (selected.length === 0) {
    return 1;
  }

  const candidateTokens = tokenize(candidate.prompt);
  const maxSimilarity = Math.max(
    ...selected.map((attack) => jaccardSimilarity(candidateTokens, tokenize(attack.prompt))),
  );
  return 1 - maxSimilarity;
}

export function selectDiverseSqlPortfolio(candidates: SqlAttack[], count: number): SqlAttack[] {
  return selectGreedyPortfolio(candidates, count, scoreDiverseCandidate);
}

export function selectSemanticBandAwareSqlPortfolio(
  candidates: SqlAttack[],
  count: number,
): SqlAttack[] {
  return selectGreedyPortfolio(candidates, count, scoreSemanticBandAwareCandidate);
}

function scoreDiverseCandidate(candidate: SqlAttack, selected: readonly SqlAttack[]): number {
  const tacticAlreadyCovered = selected.some((attack) => attack.tactic === candidate.tactic);
  const tacticBonus = tacticAlreadyCovered ? 0 : 1;

  return tacticBonus * 2 + getNoveltyScore(candidate, selected);
}

function scoreSemanticBandAwareCandidate(
  candidate: SqlAttack,
  selected: readonly SqlAttack[],
): number {
  const featureBands = getPluginFeatureBands('sql-injection');
  const selectedFeatures = new Set(
    selected.flatMap((attack) => extractSqlInjectionFeatures(attack.prompt)),
  );
  const candidateFeatures = new Set(extractSqlInjectionFeatures(candidate.prompt));
  const newlyCoveredFeatures = (featureBandId: string) =>
    (featureBands[featureBandId] ?? []).filter(
      (feature) => candidateFeatures.has(feature) && !selectedFeatures.has(feature),
    ).length;

  return (
    newlyCoveredFeatures('exploit-mechanism') * 100 +
    newlyCoveredFeatures('authorization-bypass') * 10 +
    scoreDiverseCandidate(candidate, selected)
  );
}

function parseArgs(argv: string[]) {
  const [inputPath, ...rest] = argv;
  const args = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const value = rest[i + 1];
    if (!value || value.startsWith('--')) {
      args.set(token, 'true');
      continue;
    }

    args.set(token, value);
    i += 1;
  }

  return {
    count: Number(args.get('--count') ?? '5'),
    format: args.get('--format') ?? 'json',
    inputPath,
    mode: args.get('--mode') ?? 'diverse',
  };
}

async function main() {
  const { inputPath, count, format, mode } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/selectSqlPortfolio.ts <redteam.yaml> [--count n] [--mode first|diverse|semantic] [--format json|yaml]',
    );
  }

  const purpose = await loadPurpose(inputPath);
  const entities = extractEntities(purpose);
  const pool = buildSqlCandidatePool(buildSqlAttackPortfolio(entities));
  const attacks =
    mode === 'first'
      ? pool.slice(0, count)
      : mode === 'semantic'
        ? selectSemanticBandAwareSqlPortfolio(pool, count)
        : selectDiverseSqlPortfolio(pool, count);

  if (format === 'yaml') {
    console.log(toYaml(attacks, purpose));
    return;
  }

  console.log(
    JSON.stringify(
      {
        attacks,
        count,
        mode,
        poolSize: pool.length,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
