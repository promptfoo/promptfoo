import {
  buildAdversarialPiiCandidatePool,
  loadPiiContext,
  type PiiAttack,
} from './piiResearchShared';
import {
  type Attack,
  analyzePortfolioPool,
  buildProposerPrompt,
  buildRepairBrief,
  type DimensionAccessor,
  diagnoseCandidateAgainstPolicy,
  diagnoseFrontierGaps,
  selectBestRepairCandidate,
} from './portfolioResearchShared';
import {
  buildPromptExtractionCandidatePool,
  buildPromptExtractionPortfolio,
  type PromptExtractionAttack,
  repairPromptExtractionPolicyDisagreement,
  repairPromptExtractionTacticNoveltyGap,
  repairPromptExtractionTacticNoveltyGapV2,
} from './promptExtractionResearchShared';
import { buildSqlAttackPortfolio, type SqlAttack } from './sqlResearchShared';

type PluginConfig = {
  dimensions: DimensionAccessor[];
  policies: Record<string, string[]>;
  pool: Attack[];
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
    promptExtractionGapTargeted: {
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
      pool: repairPromptExtractionTacticNoveltyGap(
        buildPromptExtractionCandidatePool(buildPromptExtractionPortfolio(entities)),
        entities,
      ),
    },
    promptExtractionGapTargetedV2: {
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
      pool: repairPromptExtractionTacticNoveltyGapV2(
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
      const { frontier, policies, portfolios } = analyzePortfolioPool(
        config.pool,
        config.dimensions,
        config.policies,
      );
      const uniquePolicyPortfolioCount = new Set(
        Object.values(policies).map((policy) => policy.indices.join(',')),
      ).size;
      const candidateDiagnostics =
        pluginId === 'promptExtractionRepaired' ||
        pluginId === 'promptExtractionGapTargeted' ||
        pluginId === 'promptExtractionGapTargetedV2'
          ? [
              diagnoseCandidateAgainstPolicy(
                portfolios,
                policies,
                config.pool.length - 1,
                'maxTactics',
                config.pool,
              ),
            ]
          : [];

      return [
        pluginId,
        {
          candidateDiagnostics,
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
  const promptExtractionRepairCandidates = [
    ...results.promptExtractionRepaired.candidateDiagnostics,
    ...results.promptExtractionGapTargeted.candidateDiagnostics,
    ...results.promptExtractionGapTargetedV2.candidateDiagnostics,
  ];
  const selectedPromptExtractionRepair = selectBestRepairCandidate(
    promptExtractionRepairCandidates,
  );
  const selectedPromptExtractionDiagnostic = promptExtractionRepairCandidates.find(
    (diagnostic) => diagnostic.candidatePrompt === selectedPromptExtractionRepair.candidatePrompt,
  );
  if (!selectedPromptExtractionDiagnostic) {
    throw new Error('Unable to build repair brief for selected prompt extraction candidate');
  }
  const promptExtractionRepairBrief = buildRepairBrief(selectedPromptExtractionDiagnostic);
  const promptExtractionProposerPrompt = buildProposerPrompt(promptExtractionRepairBrief);

  console.log(
    JSON.stringify(
      {
        promptExtractionProposerPrompt,
        promptExtractionRepairBrief,
        results,
        selectedPromptExtractionRepair,
      },
      null,
      2,
    ),
  );
}

await main();
