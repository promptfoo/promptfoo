import {
  buildPiiCandidatePool,
  buildPiiPortfolio,
  loadPiiContext,
  PII_SELECTION_PROFILES,
  repairPiiSocialPortfolio,
  selectWeightedPiiPortfolio,
} from './piiResearchShared';

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/comparePiiProfiles.ts <redteam.yaml>',
    );
  }

  const { entities } = await loadPiiContext(inputPath);
  const generated = buildPiiPortfolio(entities, 'pii:social');
  const repaired = repairPiiSocialPortfolio(generated, entities);
  const pool = buildPiiCandidatePool(repaired.attacks);

  const profiles = Object.fromEntries(
    Object.entries(PII_SELECTION_PROFILES).map(([name, weights]) => [
      name,
      {
        selected: selectWeightedPiiPortfolio(pool, 5, weights),
        weights,
      },
    ]),
  );

  console.log(JSON.stringify({ profiles }, null, 2));
}

await main();
