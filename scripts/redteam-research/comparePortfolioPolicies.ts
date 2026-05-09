import {
  buildAdversarialPiiCandidatePool,
  loadPiiContext,
  type PiiAttack,
} from './piiResearchShared';
import {
  buildPromptExtractionCandidatePool,
  buildPromptExtractionPortfolio,
  type PromptExtractionAttack,
  repairPromptExtractionPolicyDisagreement,
} from './promptExtractionResearchShared';
import {
  buildSqlAttackPortfolio,
  jaccardSimilarity,
  type SqlAttack,
  tokenize,
} from './sqlResearchShared';

type Attack = SqlAttack | PromptExtractionAttack | PiiAttack;
type Portfolio = {
  attacks: Attack[];
  indices: number[];
  score: Record<string, number>;
};
type DimensionAccessor = {
  key: string;
  valueOf: (attack: Attack) => string;
};
type PluginConfig = {
  dimensions: DimensionAccessor[];
  policies: Record<string, string[]>;
  pool: Attack[];
};
type FrontierGap = {
  coMaximizableWithTarget: string[];
  conflictsWithTarget: string[];
  targetMetric: string;
  targetMaximum: number;
};

function buildSqlCandidatePool(attacks: SqlAttack[]): SqlAttack[] {
  return [
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
    ...attacks,
  ];
}

function enumerateCombinations<T>(
  values: T[],
  count: number,
): Array<{ indices: number[]; values: T[] }> {
  const combinations: Array<{ indices: number[]; values: T[] }> = [];

  function visit(startIndex: number, indices: number[], selected: T[]) {
    if (selected.length === count) {
      combinations.push({ indices, values: selected });
      return;
    }

    for (let index = startIndex; index <= values.length - (count - selected.length); index += 1) {
      visit(index + 1, [...indices, index], [...selected, values[index]]);
    }
  }

  visit(0, [], []);
  return combinations;
}

function scorePortfolio(
  attacks: Attack[],
  dimensions: DimensionAccessor[],
): Record<string, number> {
  const pairwiseNovelty: number[] = [];

  for (let leftIndex = 0; leftIndex < attacks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < attacks.length; rightIndex += 1) {
      pairwiseNovelty.push(
        1 -
          jaccardSimilarity(
            tokenize(attacks[leftIndex].prompt),
            tokenize(attacks[rightIndex].prompt),
          ),
      );
    }
  }

  return {
    averageNovelty:
      pairwiseNovelty.length === 0
        ? 1
        : pairwiseNovelty.reduce((sum, value) => sum + value, 0) / pairwiseNovelty.length,
    ...Object.fromEntries(
      dimensions.map((dimension) => [
        `${dimension.key}Count`,
        new Set(attacks.map((attack) => dimension.valueOf(attack))).size,
      ]),
    ),
  };
}

function dominates(left: Portfolio, right: Portfolio): boolean {
  const scoreKeys = Object.keys(left.score);
  const isAtLeastAsGood = scoreKeys.every((key) => left.score[key] >= right.score[key]);
  const isStrictlyBetter = scoreKeys.some((key) => left.score[key] > right.score[key]);
  return isAtLeastAsGood && isStrictlyBetter;
}

function selectLexicographicPortfolio(portfolios: Portfolio[], priorities: string[]): Portfolio {
  const [selected] = [...portfolios].sort((left, right) => {
    for (const priority of priorities) {
      if (left.score[priority] !== right.score[priority]) {
        return right.score[priority] - left.score[priority];
      }
    }

    return left.indices.join(',').localeCompare(right.indices.join(','));
  });

  return selected;
}

function diagnoseFrontierGaps(frontier: Portfolio[]): FrontierGap[] {
  const scoreKeys = Object.keys(frontier[0]?.score ?? {});

  return scoreKeys
    .filter((key) => key !== 'averageNovelty')
    .map((targetMetric) => {
      const targetMaximum = Math.max(...frontier.map((portfolio) => portfolio.score[targetMetric]));
      const targetMaxPortfolios = frontier.filter(
        (portfolio) => portfolio.score[targetMetric] === targetMaximum,
      );
      const otherMetrics = scoreKeys.filter((key) => key !== targetMetric);

      return {
        coMaximizableWithTarget: otherMetrics.filter((metric) => {
          const globalMaximum = Math.max(...frontier.map((portfolio) => portfolio.score[metric]));
          return targetMaxPortfolios.some((portfolio) => portfolio.score[metric] === globalMaximum);
        }),
        conflictsWithTarget: otherMetrics.filter((metric) => {
          const globalMaximum = Math.max(...frontier.map((portfolio) => portfolio.score[metric]));
          return !targetMaxPortfolios.some(
            (portfolio) => portfolio.score[metric] === globalMaximum,
          );
        }),
        targetMetric,
        targetMaximum,
      };
    });
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/comparePortfolioPolicies.ts <redteam.yaml>',
    );
  }

  const { entities } = await loadPiiContext(inputPath);
  const configs: Record<string, PluginConfig> = {
    piiSocial: {
      dimensions: [
        {
          key: 'authorizationStory',
          valueOf: (attack) => (attack as PiiAttack).authorizationStory,
        },
        { key: 'relationship', valueOf: (attack) => (attack as PiiAttack).relationship },
        { key: 'sensitiveField', valueOf: (attack) => (attack as PiiAttack).sensitiveField },
        { key: 'tactic', valueOf: (attack) => attack.tactic },
      ],
      policies: {
        maxNovelty: [
          'averageNovelty',
          'sensitiveFieldCount',
          'tacticCount',
          'authorizationStoryCount',
          'relationshipCount',
        ],
        maxRelationships: [
          'relationshipCount',
          'sensitiveFieldCount',
          'authorizationStoryCount',
          'tacticCount',
          'averageNovelty',
        ],
        maxTactics: [
          'tacticCount',
          'sensitiveFieldCount',
          'authorizationStoryCount',
          'relationshipCount',
          'averageNovelty',
        ],
      },
      pool: buildAdversarialPiiCandidatePool(entities),
    },
    promptExtraction: {
      dimensions: [
        { key: 'artifact', valueOf: (attack) => (attack as PromptExtractionAttack).artifact },
        { key: 'pretext', valueOf: (attack) => (attack as PromptExtractionAttack).pretext },
        { key: 'tactic', valueOf: (attack) => attack.tactic },
      ],
      policies: {
        maxArtifacts: ['artifactCount', 'pretextCount', 'tacticCount', 'averageNovelty'],
        maxNovelty: ['averageNovelty', 'artifactCount', 'pretextCount', 'tacticCount'],
        maxPretexts: ['pretextCount', 'artifactCount', 'tacticCount', 'averageNovelty'],
        maxTactics: ['tacticCount', 'artifactCount', 'pretextCount', 'averageNovelty'],
      },
      pool: buildPromptExtractionCandidatePool(buildPromptExtractionPortfolio(entities)),
    },
    promptExtractionRepaired: {
      dimensions: [
        { key: 'artifact', valueOf: (attack) => (attack as PromptExtractionAttack).artifact },
        { key: 'pretext', valueOf: (attack) => (attack as PromptExtractionAttack).pretext },
        { key: 'tactic', valueOf: (attack) => attack.tactic },
      ],
      policies: {
        maxArtifacts: ['artifactCount', 'pretextCount', 'tacticCount', 'averageNovelty'],
        maxNovelty: ['averageNovelty', 'artifactCount', 'pretextCount', 'tacticCount'],
        maxPretexts: ['pretextCount', 'artifactCount', 'tacticCount', 'averageNovelty'],
        maxTactics: ['tacticCount', 'artifactCount', 'pretextCount', 'averageNovelty'],
      },
      pool: repairPromptExtractionPolicyDisagreement(
        buildPromptExtractionCandidatePool(buildPromptExtractionPortfolio(entities)),
        entities,
      ),
    },
    sqlInjection: {
      dimensions: [{ key: 'tactic', valueOf: (attack) => attack.tactic }],
      policies: {
        maxNovelty: ['averageNovelty', 'tacticCount'],
        maxTactics: ['tacticCount', 'averageNovelty'],
      },
      pool: buildSqlCandidatePool(buildSqlAttackPortfolio(entities)),
    },
  };

  const results = Object.fromEntries(
    Object.entries(configs).map(([pluginId, config]) => {
      const portfolios = enumerateCombinations(config.pool, 5).map(({ indices, values }) => ({
        attacks: values,
        indices,
        score: scorePortfolio(values, config.dimensions),
      }));
      const frontier = portfolios.filter(
        (portfolio) => !portfolios.some((candidate) => dominates(candidate, portfolio)),
      );
      const policies = Object.fromEntries(
        Object.entries(config.policies).map(([name, priorities]) => {
          const portfolio = selectLexicographicPortfolio(frontier, priorities);
          return [
            name,
            {
              indices: portfolio.indices,
              priorities,
              score: portfolio.score,
            },
          ];
        }),
      );
      const uniquePolicyPortfolioCount = new Set(
        Object.values(policies).map((policy) => policy.indices.join(',')),
      ).size;

      return [
        pluginId,
        {
          frontierGaps: diagnoseFrontierGaps(frontier),
          frontierSize: frontier.length,
          policyCount: Object.keys(config.policies).length,
          policies,
          poolSize: config.pool.length,
          portfolioCount: portfolios.length,
          uniquePolicyPortfolioCount,
        },
      ];
    }),
  );

  console.log(JSON.stringify({ results }, null, 2));
}

await main();
