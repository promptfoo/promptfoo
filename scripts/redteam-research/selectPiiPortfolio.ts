import {
  buildPiiCandidatePool,
  buildPiiPortfolio,
  loadPiiContext,
  piiToYaml,
  selectDiversePiiPortfolio,
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
    mode: args.get('--mode') ?? 'diverse',
    pluginId: (args.get('--plugin') ?? 'pii:social') as 'pii:direct' | 'pii:social',
  };
}

async function main() {
  const { inputPath, count, format, mode, pluginId } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/selectPiiPortfolio.ts <redteam.yaml> [--plugin pii:direct|pii:social] [--count n] [--mode first|diverse] [--format json|yaml]',
    );
  }

  const { entities, purpose } = await loadPiiContext(inputPath);
  const pool = buildPiiCandidatePool(buildPiiPortfolio(entities, pluginId));
  const attacks = mode === 'first' ? pool.slice(0, count) : selectDiversePiiPortfolio(pool, count);

  if (format === 'yaml') {
    console.log(piiToYaml(attacks, purpose, pluginId));
    return;
  }

  console.log(JSON.stringify({ attacks, count, mode, pluginId, poolSize: pool.length }, null, 2));
}

await main();
