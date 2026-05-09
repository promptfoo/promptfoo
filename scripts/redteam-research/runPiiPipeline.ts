import {
  buildPiiCandidatePool,
  buildPiiPortfolio,
  loadPiiContext,
  PII_SELECTION_PROFILES,
  piiToYaml,
  repairPiiSocialPortfolio,
  selectWeightedPiiPortfolio,
} from './piiResearchShared';

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
    profile: (args.get('--profile') ?? 'balanced') as keyof typeof PII_SELECTION_PROFILES,
    repair: args.get('--repair') !== 'false',
  };
}

async function main() {
  const { inputPath, count, format, profile, repair } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/runPiiPipeline.ts <redteam.yaml> [--count n] [--repair true|false] [--format json|yaml]',
    );
  }

  const { entities, purpose } = await loadPiiContext(inputPath);
  const generated = buildPiiPortfolio(entities, 'pii:social');
  const repaired = repair ? repairPiiSocialPortfolio(generated, entities) : undefined;
  const candidates = repaired?.attacks ?? generated;
  const pool = buildPiiCandidatePool(candidates);
  const selected = selectWeightedPiiPortfolio(pool, count, PII_SELECTION_PROFILES[profile]);

  if (format === 'yaml') {
    console.log(piiToYaml(selected, purpose, 'pii:social'));
    return;
  }

  console.log(
    JSON.stringify(
      {
        candidateCount: candidates.length,
        critique: repaired?.critique,
        profile,
        repair,
        repairCount: repaired?.repairs.length ?? 0,
        selected,
        selectedCount: selected.length,
      },
      null,
      2,
    ),
  );
}

await main();
