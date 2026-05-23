import {
  buildAdversarialPiiCandidatePool,
  loadPiiContext,
  PII_SELECTION_PROFILES,
  selectWeightedPiiPortfolio,
} from './piiResearchShared';

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/redteam-research/comparePiiProfiles.ts <redteam.yaml>');
  }

  const { entities } = await loadPiiContext(inputPath);
  const pool = buildAdversarialPiiCandidatePool(entities);

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
