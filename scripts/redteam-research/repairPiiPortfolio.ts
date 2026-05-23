import {
  buildPiiPortfolio,
  loadPiiContext,
  piiToYaml,
  repairPiiSocialPortfolio,
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
    format: args.get('--format') ?? 'json',
    inputPath,
  };
}

async function main() {
  const { inputPath, format } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/repairPiiPortfolio.ts <redteam.yaml> [--format json|yaml]',
    );
  }

  const { entities, purpose } = await loadPiiContext(inputPath);
  const originalAttacks = buildPiiPortfolio(entities, 'pii:social');
  const repaired = repairPiiSocialPortfolio(originalAttacks, entities);

  if (format === 'yaml') {
    console.log(piiToYaml(repaired.attacks, purpose, 'pii:social'));
    return;
  }

  console.log(
    JSON.stringify(
      {
        critique: repaired.critique,
        originalCount: originalAttacks.length,
        repairedCount: repaired.attacks.length,
        repairs: repaired.repairs,
      },
      null,
      2,
    ),
  );
}

await main();
