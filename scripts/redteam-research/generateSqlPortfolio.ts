import {
  buildSqlAttackPortfolio,
  extractEntities,
  loadPurpose,
  SQL_TACTICS,
  toYaml,
} from './sqlResearchShared';

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
      'Usage: tsx scripts/redteam-research/generateSqlPortfolio.ts <redteam.yaml> [--format json|yaml]',
    );
  }

  const purpose = await loadPurpose(inputPath);
  const entities = extractEntities(purpose);
  const attacks = buildSqlAttackPortfolio(entities);

  if (format === 'yaml') {
    console.log(toYaml(attacks, purpose));
    return;
  }

  console.log(
    JSON.stringify(
      {
        attacks,
        entities,
        tacticCount: SQL_TACTICS.length,
      },
      null,
      2,
    ),
  );
}

await main();
