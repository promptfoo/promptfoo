import {
  buildPromptExtractionCandidatePool,
  buildPromptExtractionPortfolio,
  loadPromptExtractionContext,
  promptExtractionToYaml,
  selectDiversePromptExtractionPortfolio,
} from './promptExtractionResearchShared';

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
      'Usage: tsx scripts/redteam-research/selectPromptExtractionPortfolio.ts <redteam.yaml> [--count n] [--mode first|diverse] [--format json|yaml]',
    );
  }

  const { entities, purpose } = await loadPromptExtractionContext(inputPath);
  const pool = buildPromptExtractionCandidatePool(buildPromptExtractionPortfolio(entities));
  const attacks =
    mode === 'first' ? pool.slice(0, count) : selectDiversePromptExtractionPortfolio(pool, count);

  if (format === 'yaml') {
    console.log(promptExtractionToYaml(attacks, purpose));
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
