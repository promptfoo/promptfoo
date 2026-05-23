import { buildPiiPortfolio, loadPiiContext, piiToYaml } from './piiResearchShared';

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
    format: args.get('--format') ?? 'json',
    inputPath,
    pluginId: (args.get('--plugin') ?? 'pii:social') as 'pii:direct' | 'pii:social',
  };
}

async function main() {
  const { inputPath, format, pluginId } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/generatePiiPortfolio.ts <redteam.yaml> [--plugin pii:direct|pii:social] [--format json|yaml]',
    );
  }

  const { entities, purpose } = await loadPiiContext(inputPath);
  const attacks = buildPiiPortfolio(entities, pluginId);

  if (format === 'yaml') {
    console.log(piiToYaml(attacks, purpose, pluginId));
    return;
  }

  console.log(JSON.stringify({ attacks, entities, pluginId }, null, 2));
}

await main();
