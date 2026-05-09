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

function buildCandidatePool(
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

function getNoveltyScore(candidate: SqlAttack, selected: SqlAttack[]): number {
  if (selected.length === 0) {
    return 1;
  }

  const candidateTokens = tokenize(candidate.prompt);
  const maxSimilarity = Math.max(
    ...selected.map((attack) => jaccardSimilarity(candidateTokens, tokenize(attack.prompt))),
  );
  return 1 - maxSimilarity;
}

function selectDiversePortfolio(candidates: SqlAttack[], count: number): SqlAttack[] {
  const selected: SqlAttack[] = [];
  const remaining = [...candidates];

  while (selected.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const tacticAlreadyCovered = selected.some((attack) => attack.tactic === candidate.tactic);
      const tacticBonus = tacticAlreadyCovered ? 0 : 1;
      const noveltyScore = getNoveltyScore(candidate, selected);
      const score = tacticBonus * 2 + noveltyScore;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
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
      'Usage: tsx scripts/redteam-research/selectSqlPortfolio.ts <redteam.yaml> [--count n] [--mode first|diverse] [--format json|yaml]',
    );
  }

  const purpose = await loadPurpose(inputPath);
  const entities = extractEntities(purpose);
  const pool = buildCandidatePool(buildSqlAttackPortfolio(entities));
  const attacks =
    mode === 'first' ? pool.slice(0, count) : selectDiversePortfolio(pool, count);

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

await main();
