import { createHash } from 'node:crypto';

const artifactPath = '/workspace/outputs/summary.csv';

export default function verifyArtifact(_output, context) {
  const artifact = context.providerResponse?.metadata?.artifacts?.find(
    (item) => item.path === artifactPath,
  );
  if (artifact?.status !== 'available') {
    return {
      pass: false,
      score: 0,
      reason:
        artifact?.status === 'missing'
          ? `The root turn did not publish ${artifactPath}`
          : `Could not verify the published bytes of ${artifactPath}`,
    };
  }

  const expected = Buffer.from(context.config.expectedCsv, 'utf8');
  const pass =
    artifact.sizeBytes === expected.length &&
    artifact.sha256 === createHash('sha256').update(expected).digest('hex');
  return {
    pass,
    score: Number(pass),
    reason: `${artifactPath} ${pass ? 'matches' : 'differs from'} the expected CSV bytes`,
  };
}
