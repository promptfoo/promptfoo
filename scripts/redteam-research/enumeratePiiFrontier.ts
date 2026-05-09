import {
  buildAdversarialPiiCandidatePool,
  loadPiiContext,
  PII_SELECTION_PROFILES,
  scorePiiPortfolio,
  selectWeightedPiiPortfolio,
  type PiiAttack,
  type PiiPortfolioScore,
} from './piiResearchShared';

type ScoredPortfolio = {
  attacks: PiiAttack[];
  indices: number[];
  score: PiiPortfolioScore;
};

const SCORE_KEYS = [
  'authorizationStoryCount',
  'averageNovelty',
  'relationshipCount',
  'sensitiveFieldCount',
  'tacticCount',
] as const;

function enumerateCombinations<T>(values: T[], count: number): Array<{ indices: number[]; values: T[] }> {
  const combinations: Array<{ indices: number[]; values: T[] }> = [];

  function visit(startIndex: number, indices: number[], selected: T[]) {
    if (selected.length === count) {
      combinations.push({ indices, values: selected });
      return;
    }

    for (
      let index = startIndex;
      index <= values.length - (count - selected.length);
      index += 1
    ) {
      visit(index + 1, [...indices, index], [...selected, values[index]]);
    }
  }

  visit(0, [], []);
  return combinations;
}

function dominates(left: PiiPortfolioScore, right: PiiPortfolioScore): boolean {
  const isAtLeastAsGood = SCORE_KEYS.every((key) => left[key] >= right[key]);
  const isStrictlyBetter = SCORE_KEYS.some((key) => left[key] > right[key]);
  return isAtLeastAsGood && isStrictlyBetter;
}

function findMatchingPortfolio(
  scoredPortfolios: ScoredPortfolio[],
  attacks: PiiAttack[],
): ScoredPortfolio | undefined {
  const selectedPrompts = new Set(attacks.map((attack) => attack.prompt));
  return scoredPortfolios.find(
    (portfolio) =>
      portfolio.attacks.length === attacks.length &&
      portfolio.attacks.every((attack) => selectedPrompts.has(attack.prompt)),
  );
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/redteam-research/enumeratePiiFrontier.ts <redteam.yaml>');
  }

  const { entities } = await loadPiiContext(inputPath);
  const pool = buildAdversarialPiiCandidatePool(entities);
  const portfolios = enumerateCombinations(pool, 5).map(({ indices, values }) => ({
    attacks: values,
    indices,
    score: scorePiiPortfolio(values),
  }));
  const frontier = portfolios.filter(
    (portfolio) =>
      !portfolios.some((candidate) => dominates(candidate.score, portfolio.score)),
  );

  const greedyProfiles = Object.fromEntries(
    Object.entries(PII_SELECTION_PROFILES).map(([name, weights]) => {
      const selected = selectWeightedPiiPortfolio(pool, 5, weights);
      const portfolio = findMatchingPortfolio(portfolios, selected);

      if (!portfolio) {
        throw new Error(`Unable to find portfolio for ${name}`);
      }

      return [
        name,
        {
          frontierMember: frontier.some((candidate) => candidate.indices.join(',') === portfolio.indices.join(',')),
          indices: portfolio.indices,
          score: portfolio.score,
          weights,
        },
      ];
    }),
  );

  const bestByMetric = Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      portfolios
        .filter(
          (portfolio) =>
            portfolio.score[key] === Math.max(...portfolios.map((candidate) => candidate.score[key])),
        )
        .map((portfolio) => ({
          indices: portfolio.indices,
          score: portfolio.score,
        })),
    ]),
  );

  console.log(
    JSON.stringify(
      {
        bestByMetric,
        frontier: frontier.map((portfolio) => ({
          indices: portfolio.indices,
          score: portfolio.score,
        })),
        frontierSize: frontier.length,
        greedyProfiles,
        poolSize: pool.length,
        portfolioCount: portfolios.length,
      },
      null,
      2,
    ),
  );
}

await main();
